import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Prisma } from '@prisma/client';
import { SCOPED_MODELS, TENANT_ROOT_MODELS } from './scoped-models';
import { RELATIONS } from './tenant-scope.rewriter';

const API_ROOT = join(__dirname, '..', '..', '..');
const SCOPE_COLUMNS = ['organizationId', 'clientId', 'advertiserId'];

// Files allowed to touch scoped models through the raw PrismaService, and why.
const RAW_ACCESS_ALLOWLIST: Record<string, string> = {
  'src/modules/workspaces/repositories/prisma-workspace-members.repository.ts':
    'membership lookups feed the WorkspaceGuard before a scope exists; listings and findById use the scoped client',
  'src/modules/workspaces/repositories/prisma-workspaces.repository.ts':
    'creates the tenant with its owner membership and moves ownership between operator members',
  'src/modules/audit/repositories/prisma-audit-logs.repository.ts':
    'the append-only hash chain, retention and verification span every tenant; listing uses the scoped client',
  'src/modules/rbac/repositories/prisma-roles.repository.ts':
    'counts memberships of a role to block deleting a role that is still in use',
  'src/modules/users/repositories/prisma-users.repository.ts':
    'user listings filter by membership; only operator roles hold user:* permissions',
};

function parseSchemaRelations(): Map<string, Map<string, boolean>> {
  const schema = readFileSync(join(API_ROOT, 'prisma', 'schema.prisma'), 'utf8');
  const blocks = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
  const modelNames = new Set(blocks.map((block) => block[1]!));
  const result = new Map<string, Map<string, boolean>>();
  for (const [, name, body] of blocks) {
    const fields = new Map<string, boolean>();
    for (const match of body!.matchAll(/^\s+(\w+)\s+(\w+)(\[\])?\??/gm)) {
      if (modelNames.has(match[2]!)) fields.set(match[1]!, match[3] === '[]');
    }
    result.set(name!, fields);
  }
  return result;
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') && !path.endsWith('.spec.ts') ? [path] : [];
  });
}

describe('tenant scope registry', () => {
  it('infers list vs to-one for every relation exactly as schema.prisma declares it', () => {
    for (const [model, fields] of parseSchemaRelations()) {
      for (const [field, isList] of fields) {
        expect({
          relation: `${model}.${field}`,
          isList: RELATIONS.get(model)?.get(field)?.isList,
        }).toEqual({
          relation: `${model}.${field}`,
          isList,
        });
      }
    }
  });

  it('registers every model that carries a tenant column', () => {
    const unregistered = Prisma.dmmf.datamodel.models
      .filter((model) => model.fields.some((field) => SCOPE_COLUMNS.includes(field.name)))
      .map((model) => model.name)
      .filter((name) => !SCOPED_MODELS[name] && !TENANT_ROOT_MODELS.includes(name));
    expect(unregistered).toEqual([]);
  });

  const rawScopedAccess = (): string[] => {
    const scopedModels = Object.keys(SCOPED_MODELS);
    const delegates = scopedModels.map((name) => name[0]!.toLowerCase() + name.slice(1));
    const relationNames = [...RELATIONS.values()].flatMap((fields) =>
      [...fields.entries()]
        .filter(([, relation]) => scopedModels.includes(relation.target))
        .map(([name]) => name),
    );
    const delegateUse = new RegExp(`\\.(${delegates.join('|')})\\.`);
    const relationUse = new RegExp(`\\b(${relationNames.join('|')})\\s*:`);

    return sourceFiles(join(API_ROOT, 'src'))
      .map((path) => relative(API_ROOT, path))
      .filter((path) => !path.startsWith('src/shared/tenancy/'))
      .filter((path) => {
        const code = readFileSync(join(API_ROOT, path), 'utf8');
        const usesRawClient = /\bPrismaService\b/.test(code);
        return usesRawClient && (delegateUse.test(code) || relationUse.test(code));
      });
  };

  it('keeps raw PrismaService access to scoped models inside the allowlist', () => {
    expect(rawScopedAccess().filter((path) => !RAW_ACCESS_ALLOWLIST[path])).toEqual([]);
  });

  it('has no stale allowlist entries (and so proves the scan detects raw access)', () => {
    expect(rawScopedAccess().sort()).toEqual(Object.keys(RAW_ACCESS_ALLOWLIST).sort());
  });
});
