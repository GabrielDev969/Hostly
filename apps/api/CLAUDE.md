# apps/api — Guia para Claude

API do Hostly (`@hostly/api`), nascida do boilerplate SaaS do dono (`GabrielDev969/BaseApiNestJs` @ `e80e18b`): NestJS multi-tenant com RBAC, autenticação JWT, 2FA, audit logging e super admin global. Vale junto com o `CLAUDE.md` da raiz e a `docs/spec.md`; em conflito, valem eles. Fora do boilerplate: OAuth (sem provedor na v1), stack de observabilidade (`infra/`), CI e hooks de commit.

## Stack

- **NestJS 11** + Express + TypeScript 6 (config estrita de `@hostly/config/tsconfig/node.json`; só `strictPropertyInitialization` desligado, porque DTOs e entidades são preenchidos pelo framework)
- **Prisma 7** com adapter `@prisma/adapter-pg` (PostgreSQL)
- **Auth**: Passport JWT (access 15m, refresh 7d), Argon2id, otplib (TOTP)
- **Validação**: class-validator + class-transformer (controllers); Zod (env)
- **Logging**: nestjs-pino (redact em headers `authorization` e `cookie`)
- **Outros**: helmet, throttler, swagger, BullMQ (e-mail e manutenção), cache no Redis
- **Ambiente**: um `.env` só, na raiz do monorepo (`src/config/load-root-env.ts`); não existe `apps/api/.env`

## Arquitetura

Cada módulo de domínio segue 4 camadas — não invente outras:

```
src/modules/<nome>/
  http/
    <nome>.controller.ts        # HTTP routing, ApiTags, decorators
    dto/                        # class-validator DTOs (input)
  use-cases/
    <verbo>-<recurso>.use-case.ts   # 1 caso de uso por arquivo, classe @Injectable
  services/                     # opcional: lógica reutilizável (TokenService, etc.)
  repositories/
    <recurso>.repository.interface.ts   # abstract class (SEM Symbol, SEM interface I*)
    prisma-<recurso>.repository.ts      # extends da abstract class
  entities/
    <recurso>.entity.ts         # POJO simples (sem decorators ORM)
  <nome>.module.ts
```

Compartilhado fica em `src/shared/` (guards, interceptors, decorators, utils, types, database). Aliases: `@modules/*`, `@shared/*`, `@core/*`, `src/*` (em `paths`, sem `baseUrl`, que o TS 6 descontinuou; o `nest build` reescreve pra caminhos relativos).

## Repository pattern (DI via abstract class)

**Repositórios são abstract classes — não interfaces.** Isso elimina a duplicação `Symbol + import type + @Inject`. O nome do arquivo permanece `*.repository.interface.ts` por convenção, mesmo definindo `abstract class`.

```ts
// users.repository.interface.ts
export abstract class UsersRepository {
  abstract findById(id: string): Promise<User | null>;
  abstract create(data: CreateUserData): Promise<User>;
}

// prisma-users.repository.ts
@Injectable()
export class PrismaUsersRepository extends UsersRepository {
  constructor(private prisma: PrismaService) {
    super();
  }
  async findById(id: string) { ... }
  async create(data: CreateUserData) { ... }
}

// users.module.ts
providers: [{ provide: UsersRepository, useClass: PrismaUsersRepository }]
exports: [UsersRepository]

// any consumer
constructor(private users: UsersRepository) {}   // 1 import, sem @Inject, sem Symbol
```

**Regras desse padrão:**
- Implementações usam `extends`, **nunca** `implements`.
- A derivada **deve** chamar `super()` no construtor.
- Não recriar `Symbol`s — a classe abstrata **é** o token de DI.
- Não usar `@Inject(UsersRepository)` — Nest resolve por reflexão de tipo.

## Regras inegociáveis

0. **Tudo em inglês**. Identificadores, comentários, mensagens de erro, descriptions de Swagger, mensagens de validação, console.log, seed data — **tudo**. Nada de português no código, mesmo que o time fale português. A única exceção é a comunicação humana (chat, commits podem ser PT) — código não.
1. **Sem `any`**. Tipos explícitos sempre. Use `unknown` + narrow se preciso. Exceção justificada: campos `Record<string, any>` que cruzam a fronteira do Prisma JSON (ver `audit-logs.repository.interface.ts` — comente com `eslint-disable-next-line`).
2. **Repos via abstract class** (regra acima).
3. **Use cases não falam HTTP**. Lançam `BadRequestException`, `UnauthorizedException`, etc., mas não conhecem `Request`/`Response`.
4. **Controllers são finos**. Apenas: validar DTO, extrair contexto (user, workspace), chamar use-case, retornar.
5. **Multi-tenant por header**. Toda rota protegida por workspace recebe `x-workspace-id` (ou `:workspaceId` em params). O `WorkspaceGuard` carrega membership e permissões em `req.workspace` e `req.permissions`.
6. **Permissões via decorator**. `@RequirePermissions('user:delete')` antes do handler. Permissões são keys string (ver `src/modules/rbac/constants/permissions.ts`).
7. **Soft delete**. `deletedAt` em User/Workspace. Queries de leitura sempre filtram `deletedAt: null`.
8. **Senhas com Argon2id**. Use `CryptoUtil.hashPassword` / `verifyPassword`. Nunca compare strings ou use bcrypt/sha256 para senha.
9. **Secrets sensíveis (2FA, etc.) criptografados** com `CryptoUtil.encrypt/decrypt` usando `env.ENCRYPTION_KEY`.
10. **Tokens hash sha256** antes de persistir (refresh tokens em `Session.refreshTokenHash`, recovery codes em `User.recoveryCodes`).
11. **Audit automático**. `AuditInterceptor` é global. Não logue manualmente; use `@Audit('action.name')` se precisar customizar.
12. **JwtAuthGuard é global**. Marque rotas públicas com `@Public()`. Não importe o guard manualmente.
13. **Register não cria tenant**. Usuário novo só ganha acesso por convite; a operadora nasce no seed.

## Escopo central (regra 5 do Hostly)

Operadora = `Organization` com um `Workspace` (contêiner de membros, papéis e convites). Cliente e anunciante são
dados da membership: `WorkspaceMember.clientId` / `advertiserId` (nulos = operadora; só `clientId` = cliente; os dois =
anunciante). Os papéis de sistema ficam em `src/modules/rbac/constants/roles.ts` (`operator_admin`, `operator_staff`,
`client_admin`, `client_editor`, `advertiser`); `assertRoleFitsScope` impede papel de cliente em membership de
operadora e vice-versa.

- O `TenantContextMiddleware` abre um `AsyncLocalStorage` por requisição; o `WorkspaceGuard` grava o escopo
  (`organizationId`, `workspaceId`, `clientId`, `advertiserId`) em `TenantContext` e em `req.scope`.
- **Repositório de negócio usa `ScopedPrismaService` (`this.scoped.client`)**, nunca o `PrismaService` cru. A extensão
  (`src/shared/tenancy/tenant-scope.rewriter.ts`) põe o filtro de escopo em toda leitura e escrita dos modelos de
  `SCOPED_MODELS`, filtra relações de lista pra esses modelos em `include`/`select`/`_count`/filtros de relação, e
  recusa o que não dá pra filtrar: include a-um pra modelo escopado, `_count: true`, `orderBy` por relação escopada,
  escrita aninhada (use ids escalares ou o delegate do modelo) e acesso sem escopo.
- **Tabela de negócio nova** entra em `SCOPED_MODELS` (`src/shared/tenancy/scoped-models.ts`). O
  `tenant-scope.registry.spec.ts` falha se um modelo com `organizationId`/`clientId`/`advertiserId` ficar de fora, se um
  arquivo usar modelo escopado pelo `PrismaService` cru fora da allowlist (com motivo), ou se a convenção de chave
  estrangeira `<relação>Id` deixar de valer (é dela que sai "lista ou a-um", porque o DMMF de runtime do Prisma 7 não
  traz `isList`).
- Nada de `$queryRaw`/`$executeRaw` em tabela de negócio: a extensão não enxerga SQL cru.
- Jobs, seed e lookups de identidade que atravessam tenants rodam em `TenantContext.runAsSystem()`.
- O `@Cacheable` prefixa a chave com o escopo atual: resultado de um escopo nunca serve outro.
- Auditoria: `@Audit` nas rotas; em use-case, `AuditService.record({ actorId, action, entity, entityId })`. O escopo
  (organização e cliente) vem do contexto.

## Estilo de código

- **Conciso > defensivo**. Validar só nas bordas (DTO, env, repos). Não duplique checks.
- **Sem comentários explicando o "o que"**. Identificadores claros bastam. Comente só "porquês" não-óbvios.
- **Sem fallbacks especulativos**. Nada de `?? defaultMágico` para ramos que nunca acontecem.
- **Não criar README/docs novos** salvo pedido explícito.
- **Erros**: prefira exceções HTTP do Nest (`UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `BadRequestException`, `ConflictException`).
- **Formato**: Prettier e ESLint compartilhados da raiz; rode `pnpm lint` e `pnpm format` antes de finalizar.

## Padrões específicos

### Adicionar permissão nova
1. Adicione em `src/modules/rbac/constants/permissions.ts` (constante tipada)
2. Adicione no array `PERMISSIONS` de `prisma/seed.ts`
3. Use no controller: `@RequirePermissions(PERMISSIONS.X.Y)`
4. Rode `pnpm --filter @hostly/api db:seed`

### Criar novo módulo
- Siga a estrutura de `src/modules/users/` como referência canônica
- Registre o módulo em `src/app.module.ts`
- Exporte os repos do módulo se outros módulos vão consumi-los

### DTOs
- 1 DTO por endpoint, 1 arquivo cada
- `@ApiProperty` em todos os campos (Swagger)
- `@Transform` para normalização (lowercase email, trim, etc.)
- Validações detalhadas com mensagens

## Super Admin global

- Workspace com slug `__admin__` (constante em `@modules/rbac/constants/system`)
- Role `SuperAdmin` no workspace admin tem TODAS as permissões
- `WorkspaceGuard` faz fallback: se user não é membro do workspace alvo, tenta `findSuperAdminMembership` → ganha permissões totais
- Provisionado via seed a partir de `SUPER_ADMIN_EMAIL/PASSWORD/NAME`
- **Nunca** crie endpoint que permita promover alguém a super admin pela API

## 2FA

- Secret armazenado **criptografado** em `User.twoFactorSecret`
- Recovery codes (10) armazenados como JSON de hashes sha256 em `User.recoveryCodes`
- Fluxo de login: senha OK + `twoFactorEnabled` → emite challenge JWT 5min → `/auth/2fa/verify` aceita TOTP **ou** recovery code
- Disable exige senha + TOTP atual (recovery não disable — força usuário comprometido a saber senha)

## Testing

Stack: Jest 30 + Supertest 7 + @nestjs/testing 11 + @testcontainers/postgresql 11 (Postgres real, isolado por job).

**3 padrões canônicos** (cada um tem um exemplo no repo, copie e cole):

| Tipo | Onde | Exemplo | Quando usar |
|------|------|---------|------------|
| Service puro | `src/.../*.spec.ts` | `two-factor.service.spec.ts` | Lógica sem deps externas |
| Use case com mocks | `src/.../*.spec.ts` | `register.use-case.spec.ts` | Use cases — mocka repos via `jest.Mocked<UsersRepository>` |
| E2E real | `test/*.e2e-spec.ts` | `auth.e2e-spec.ts` | Fluxo completo HTTP→DB com testcontainers |

**Regras:**
- Repos não são mockados em e2e — banco real via testcontainers, migrations via `prisma migrate deploy`.
- Use cases unitários: mocke o repo inteiro como `jest.Mocked<XRepository>` (a classe abstrata serve de tipo).
- E2E: import dos helpers no top, mas `createTestApp` via `require()` lazy dentro do `beforeAll` para que o container já esteja de pé antes do AppModule ler `DATABASE_URL`.
- Reset entre testes via `resetDatabase()` (TRUNCATE com CASCADE), não `DROP/CREATE`.
- Stub do `nanoid` em `test/stubs/nanoid.ts` (ESM-only). Outras libs ESM resolvem com `customExportConditions: ["node"]` no jest-e2e.

**Comandos:**
```bash
pnpm --filter @hostly/api test       # unit (rápido, sem Docker)
pnpm --filter @hostly/api test:e2e   # e2e (Testcontainers: precisa do Docker/OrbStack)
```

As imagens do Testcontainers são as mesmas do `docker-compose.yml` da raiz.

## Error responses

Há um filter global (`AllExceptionsFilter`) que normaliza **todas** as respostas de erro para este formato:

```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "User not found",
  "details": ["email must be a valid email"],   // só em validation 400
  "timestamp": "2026-05-07T12:34:56.789Z",
  "path": "/api/v1/users/abc",
  "requestId": "req-12",                         // se pino-http populou
  "stack": "..."                                  // só em NODE_ENV != production
}
```

**Regras:**
- Não escreva tratamento manual em controllers (sem try/catch só pra responder erro). Lance exceções HTTP do Nest e o filter normaliza.
- `class-validator` errors viram `details: string[]` com `message: "Validation failed"`.
- `Prisma.PrismaClientKnownRequestError` é mapeado: `P2002 → 409`, `P2025 → 404`, `P2003 → 409`, `P2014 → 400`. Outros caem em 500.
- 5xx são logados via `Logger`. 4xx não.
- `stack` só aparece fora de produção.

## Comandos

Os comandos ficam no `CLAUDE.md` da raiz (seção "Comandos"). Não invente outros.

## O que NÃO fazer

- Não usar `any` (use `unknown` se precisar)
- Não usar `Symbol` para DI tokens — use abstract class
- Não usar `implements IXRepository` — use `extends XRepository`
- Não usar `@Inject(...)` para repos — Nest resolve por tipo
- Não criar arquivos `.md` de planning/decisão sem pedido explícito
- Não adicionar libs sem justificar (já temos otplib, argon2, etc.)
- Não amend commits — sempre criar novo commit
- Não comentar código "morto" — delete
- Não pular os testes que a issue pede (no Hostly, a issue fecha pelo teste)
- Não escrever docstring/JSDoc longo — uma linha basta
- Não criar abstrações para um único caso de uso
- Não exponha `passwordHash`, `twoFactorSecret` ou `recoveryCodes` em respostas HTTP
