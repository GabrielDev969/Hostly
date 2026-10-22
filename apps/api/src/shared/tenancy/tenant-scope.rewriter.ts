import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { SCOPED_MODELS, type ScopedModel, type Where } from './scoped-models';
import type { TenantScope } from './tenant-scope';

type Args = Record<string, unknown>;

interface Relation {
  target: string;
  isList: boolean;
}

// Prisma 7's runtime DMMF omits isList and foreign keys, so a relation is to-one when its model
// holds the `<relation>Id` column. tenant-scope.registry.spec.ts checks this against schema.prisma.
export const RELATIONS: ReadonlyMap<string, ReadonlyMap<string, Relation>> = new Map(
  Prisma.dmmf.datamodel.models.map((model) => {
    const scalars = new Set(model.fields.filter((f) => f.kind === 'scalar').map((f) => f.name));
    return [
      model.name,
      new Map(
        model.fields
          .filter((field) => field.kind === 'object')
          .map((field) => [
            field.name,
            { target: field.type, isList: !scalars.has(`${field.name}Id`) },
          ]),
      ),
    ];
  }),
);

const WHERE_OPERATIONS = new Set([
  'findUnique',
  'findUniqueOrThrow',
  'findFirst',
  'findFirstOrThrow',
  'findMany',
  'count',
  'aggregate',
  'groupBy',
  'update',
  'updateMany',
  'updateManyAndReturn',
  'delete',
  'deleteMany',
  'upsert',
]);
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn']);
const UPDATE_OPERATIONS = new Set(['update', 'updateMany', 'updateManyAndReturn']);
const DELETE_OPERATIONS = new Set(['delete', 'deleteMany']);
const ROOT_WRITE_OPERATIONS = new Set([...UPDATE_OPERATIONS, ...DELETE_OPERATIONS, 'upsert']);

export class TenantScopeError extends Error {}

const isObject = (value: unknown): value is Args =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date);

const and = (where: unknown, extra: Where): Where => {
  if (!isObject(where) || Object.keys(where).length === 0) return extra;
  const existing = where.AND;
  const list: unknown[] =
    existing === undefined ? [] : Array.isArray(existing) ? existing : [existing];
  return { ...where, AND: [...list, extra] };
};

const scalarValue = (value: unknown): unknown =>
  isObject(value) && 'set' in value ? value.set : value;

// Rewrites Prisma query args so they can only reach rows inside the current tenant scope.
// Scoped models get the scope filter on every read and write, list relations into them are
// filtered wherever they appear, and shapes that cannot be filtered (to-one includes, nested
// writes, `_count: true`) are rejected instead of silently leaking.
export class TenantScopeRewriter {
  constructor(private readonly scope: TenantScope | null) {}

  rewrite(model: string, operation: string, args: Args): Args {
    const scoped = SCOPED_MODELS[model];
    if (scoped) this.requireScope(model);
    if (scoped?.root && ROOT_WRITE_OPERATIONS.has(operation)) this.assertOperatorScope(model);

    if (DELETE_OPERATIONS.has(operation)) this.assertNoScopedCascade(model);

    const out: Args = { ...args };
    if (out.where !== undefined) out.where = this.where(model, out.where);
    if (scoped && WHERE_OPERATIONS.has(operation)) {
      out.where = and(out.where, this.scopeWhere(model, scoped));
    }
    if (out.include !== undefined) out.include = this.selection(model, out.include);
    if (out.select !== undefined) out.select = this.selection(model, out.select);
    if (out.orderBy !== undefined) this.assertOrderBy(model, out.orderBy);

    if (CREATE_OPERATIONS.has(operation)) {
      out.data = Array.isArray(out.data)
        ? out.data.map((row) => this.createData(model, row))
        : this.createData(model, out.data);
    }
    if (UPDATE_OPERATIONS.has(operation)) out.data = this.updateData(model, out.data);
    if (operation === 'upsert') {
      out.create = this.createData(model, out.create);
      out.update = this.updateData(model, out.update);
    }
    return out;
  }

  private requireScope(model: string): TenantScope {
    if (!this.scope) {
      throw new TenantScopeError(`Scoped model ${model} accessed without a tenant scope`);
    }
    return this.scope;
  }

  // Client and advertiser users may read their organization's roots but never change them.
  private assertOperatorScope(model: string): void {
    const scope = this.requireScope(model);
    if (scope.clientId || scope.advertiserId) {
      throw new ForbiddenException(`Only operators can change ${model}`);
    }
  }

  private scopeWhere(model: string, config: ScopedModel): Where {
    const scope = this.requireScope(model);
    if (config.root) return config.organizationWhere(scope);
    if (scope.clientId && !config.clientField) {
      throw new ForbiddenException(`${model} is not available to client users`);
    }
    if (scope.advertiserId && !config.advertiserField) {
      throw new ForbiddenException(`${model} is not available to advertisers`);
    }
    return {
      ...config.organizationWhere(scope),
      ...(scope.clientId && config.clientField ? { [config.clientField]: scope.clientId } : {}),
      ...(scope.advertiserId && config.advertiserField
        ? { [config.advertiserField]: scope.advertiserId }
        : {}),
    };
  }

  private relations(model: string): ReadonlyMap<string, Relation> {
    return RELATIONS.get(model) ?? new Map<string, Relation>();
  }

  private where(model: string, where: unknown): unknown {
    if (!isObject(where)) return where;
    const relations = this.relations(model);
    const out: Args = {};
    for (const [key, value] of Object.entries(where)) {
      const relation = relations.get(key);
      if (key === 'AND' || key === 'OR' || key === 'NOT') {
        out[key] = Array.isArray(value)
          ? value.map((item) => this.where(model, item))
          : this.where(model, value);
      } else if (relation && isObject(value)) {
        out[key] = this.relationFilter(relation, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private relationFilter(relation: Relation, filter: Args): Args {
    const scoped = SCOPED_MODELS[relation.target];
    const inScope = (inner: unknown): unknown => {
      const rewritten = this.where(relation.target, inner);
      return scoped && inner !== null
        ? and(rewritten, this.scopeWhere(relation.target, scoped))
        : rewritten;
    };

    if (relation.isList) {
      const out: Args = {};
      for (const [op, inner] of Object.entries(filter)) {
        // `every` must ignore rows outside the scope instead of failing because of them.
        out[op] =
          op === 'every' && scoped
            ? {
                OR: [
                  this.where(relation.target, inner),
                  { NOT: this.scopeWhere(relation.target, scoped) },
                ],
              }
            : inScope(inner);
      }
      return out;
    }
    if ('is' in filter || 'isNot' in filter) {
      const out: Args = {};
      for (const [op, inner] of Object.entries(filter)) out[op] = inScope(inner);
      return out;
    }
    return inScope(filter) as Args;
  }

  private selection(model: string, selection: unknown): unknown {
    if (!isObject(selection)) return selection;
    const relations = this.relations(model);
    const out: Args = {};
    for (const [key, value] of Object.entries(selection)) {
      const relation = relations.get(key);
      if (key === '_count') {
        out[key] = this.countSelection(model, value);
      } else if (relation && value !== false && value !== undefined) {
        out[key] = this.relationSelection(model, key, relation, value);
      } else {
        out[key] = value;
      }
    }
    return out;
  }

  private relationSelection(
    model: string,
    field: string,
    relation: Relation,
    value: unknown,
  ): unknown {
    const scoped = SCOPED_MODELS[relation.target];
    if (scoped && !relation.isList) {
      throw new TenantScopeError(
        `${model}.${field} is a to-one relation into scoped model ${relation.target} and cannot be filtered; query it through its own delegate`,
      );
    }
    if (!scoped && value === true) return value;

    const args: Args = isObject(value) ? { ...value } : {};
    if (args.where !== undefined) args.where = this.where(relation.target, args.where);
    if (scoped) args.where = and(args.where, this.scopeWhere(relation.target, scoped));
    if (args.include !== undefined) args.include = this.selection(relation.target, args.include);
    if (args.select !== undefined) args.select = this.selection(relation.target, args.select);
    if (args.orderBy !== undefined) this.assertOrderBy(relation.target, args.orderBy);
    return args;
  }

  private countSelection(model: string, value: unknown): unknown {
    const relations = this.relations(model);
    if (value === true) {
      const scopedList = [...relations.entries()].find(
        ([, relation]) => relation.isList && SCOPED_MODELS[relation.target],
      );
      if (scopedList) {
        throw new TenantScopeError(
          `${model}._count: true would count scoped relation ${scopedList[0]} unfiltered; select the counts explicitly`,
        );
      }
      return value;
    }
    if (!isObject(value) || !isObject(value.select)) return value;

    const select: Args = {};
    for (const [key, inner] of Object.entries(value.select)) {
      const relation = relations.get(key);
      const scoped = relation ? SCOPED_MODELS[relation.target] : undefined;
      if (!relation || !scoped || inner === false) {
        select[key] = inner;
        continue;
      }
      const args: Args = isObject(inner) ? { ...inner } : {};
      args.where = and(
        this.where(relation.target, args.where),
        this.scopeWhere(relation.target, scoped),
      );
      select[key] = args;
    }
    return { ...value, select };
  }

  private assertOrderBy(model: string, orderBy: unknown): void {
    const items = Array.isArray(orderBy) ? orderBy : [orderBy];
    const relations = this.relations(model);
    for (const item of items) {
      if (!isObject(item)) continue;
      for (const [key, value] of Object.entries(item)) {
        const relation = relations.get(key);
        if (!relation) continue;
        if (SCOPED_MODELS[relation.target]) {
          throw new TenantScopeError(
            `${model}.${key}: ordering by a scoped relation would read rows outside the tenant scope`,
          );
        }
        this.assertOrderBy(relation.target, value);
      }
    }
  }

  // Deleting a parent of scoped rows would cascade (or set null) into them, possibly in other scopes.
  private assertNoScopedCascade(model: string): void {
    const cascade = [...this.relations(model).entries()].find(
      ([, relation]) => relation.isList && SCOPED_MODELS[relation.target],
    );
    if (cascade) {
      throw new TenantScopeError(
        `Deleting ${model} would cascade into scoped relation ${cascade[0]}; delete it as system work`,
      );
    }
  }

  private assertNoNestedWrites(model: string, data: Args): void {
    const relations = this.relations(model);
    for (const [key, value] of Object.entries(data)) {
      const relation = relations.get(key);
      if (!relation || value === undefined) continue;
      if (SCOPED_MODELS[model] || SCOPED_MODELS[relation.target]) {
        throw new TenantScopeError(
          `Nested write ${model}.${key} bypasses the tenant scope; write scalar ids or use the ${relation.target} delegate`,
        );
      }
    }
  }

  private createData(model: string, data: unknown): unknown {
    if (!isObject(data)) return data;
    this.assertNoNestedWrites(model, data);
    const scoped = SCOPED_MODELS[model];
    if (!scoped) return data;

    const scope = this.requireScope(model);
    if (scoped.root) {
      throw new TenantScopeError(`Creating ${model} is system work; use TenantContext.runAsSystem`);
    }
    const out: Args = { ...data };
    const required: Where = {
      ...scoped.organizationData(scope),
      ...(scope.clientId && scoped.clientField ? { [scoped.clientField]: scope.clientId } : {}),
      ...(scope.advertiserId && scoped.advertiserField
        ? { [scoped.advertiserField]: scope.advertiserId }
        : {}),
    };
    for (const [field, expected] of Object.entries(required)) {
      if (out[field] === undefined) out[field] = expected;
      else if (out[field] !== expected) {
        throw new ForbiddenException(`Cannot create ${model} outside the current tenant scope`);
      }
    }
    return out;
  }

  private updateData(model: string, data: unknown): unknown {
    if (!isObject(data)) return data;
    this.assertNoNestedWrites(model, data);
    const scoped = SCOPED_MODELS[model];
    if (!scoped) return data;

    const scope = this.requireScope(model);
    const pinned: Where = {
      ...scoped.organizationData(scope),
      ...(scope.clientId && scoped.clientField ? { [scoped.clientField]: scope.clientId } : {}),
      ...(scope.advertiserId && scoped.advertiserField
        ? { [scoped.advertiserField]: scope.advertiserId }
        : {}),
    };
    for (const [field, expected] of Object.entries(pinned)) {
      const value = scalarValue(data[field]);
      if (value !== undefined && value !== expected) {
        throw new ForbiddenException(`Cannot move ${model} outside the current tenant scope`);
      }
    }
    return data;
  }
}
