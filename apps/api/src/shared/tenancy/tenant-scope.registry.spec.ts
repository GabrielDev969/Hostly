import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import { Prisma } from '@prisma/client';
import { SCOPED_MODELS } from './scoped-models';
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
    'user listings filter by membership; only operator-scoped memberships can hold user:* (see PERMISSION_CEILING)',
  'src/modules/organizations/repositories/prisma-organizations.repository.ts':
    'resolves organizations by id, slug or owner for identity flows; creating a tenant is system work',
};

const SCOPED_DELEGATES = Object.keys(SCOPED_MODELS).map(
  (name) => name[0]!.toLowerCase() + name.slice(1),
);
const SCOPED_RELATIONS = [...RELATIONS.values()].flatMap((fields) =>
  [...fields.entries()]
    .filter(([, relation]) => SCOPED_MODELS[relation.target])
    .map(([name]) => name),
);
const names = (list: string[]) => list.join('|');
const RAW_CLIENT = /\b(PrismaService|PrismaClient|TransactionClient)\b/;
const SCOPED_ACCESS = [
  new RegExp(`\\.(${names(SCOPED_DELEGATES)})\\.`),
  new RegExp(`\\[\\s*['"\`](${names(SCOPED_DELEGATES)})['"\`]\\s*\\]`),
  new RegExp(`\\{[^}]*\\b(${names(SCOPED_DELEGATES)})\\b[^}]*\\}\\s*=`),
  new RegExp(`\\b(${names(SCOPED_RELATIONS)})\\s*:`),
];

// True when code holds a raw Prisma client and reaches a scoped model by any spelling.
const touchesScopedRaw = (code: string): boolean =>
  RAW_CLIENT.test(code) && SCOPED_ACCESS.some((pattern) => pattern.test(code));

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
      .filter((name) => !SCOPED_MODELS[name]);
    expect(unregistered).toEqual([]);
  });

  const rawScopedAccess = (): string[] =>
    sourceFiles(join(API_ROOT, 'src'))
      .map((path) => relative(API_ROOT, path))
      .filter((path) => !path.startsWith('src/shared/tenancy/'))
      .filter((path) => touchesScopedRaw(readFileSync(join(API_ROOT, path), 'utf8')));

  it.each([
    [
      'dot access',
      'constructor(private prisma: PrismaService) {} q() { return this.prisma.auditLog.count(); }',
    ],
    [
      'bracket access',
      "constructor(private prisma: PrismaService) {} q() { return this.prisma['workspaceMember'].count(); }",
    ],
    [
      'destructuring',
      'constructor(private prisma: PrismaService) {} q() { const { auditLog } = this.prisma; }',
    ],
    [
      'transaction helper',
      'function q(tx: Prisma.TransactionClient) { return tx.workspaceMember.findMany(); }',
    ],
    [
      'relation include',
      'constructor(private prisma: PrismaService) {} q() { return this.prisma.user.findMany({ include: { memberships: true } }); }',
    ],
  ])('detects raw access to scoped models through %s', (_, code) => {
    expect(touchesScopedRaw(code)).toBe(true);
  });

  it('ignores code that only uses the scoped client', () => {
    expect(
      touchesScopedRaw(
        'constructor(private scoped: ScopedPrismaService) {} q() { return this.scoped.client.auditLog.count(); }',
      ),
    ).toBe(false);
  });

  it('keeps raw PrismaService access to scoped models inside the allowlist', () => {
    expect(rawScopedAccess().filter((path) => !RAW_ACCESS_ALLOWLIST[path])).toEqual([]);
  });

  it('has no stale allowlist entries (and so proves the scan detects raw access)', () => {
    expect(rawScopedAccess().sort()).toEqual(Object.keys(RAW_ACCESS_ALLOWLIST).sort());
  });
});
