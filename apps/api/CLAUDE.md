# apps/api — Guia para Claude

API do Hostly (`@hostly/api`), nascida do boilerplate SaaS do dono (`GabrielDev969/BaseApiNestJs` @ `e80e18b`): NestJS multi-tenant com RBAC, autenticação JWT, 2FA, audit logging e super admin global. Vale junto com o `CLAUDE.md` da raiz e a `docs/spec.md`; em conflito, valem eles. Fora do boilerplate: OAuth (sem provedor na v1), stack de observabilidade (`infra/`), CI e hooks de commit.

## Stack

- **NestJS 11** + Express + TypeScript 6 (config estrita de `@hostly/config/tsconfig/node.json`; só `strictPropertyInitialization` desligado, porque DTOs e entidades são preenchidos pelo framework)
- **Prisma 7** com adapter `@prisma/adapter-pg` (PostgreSQL)
- **Auth**: Passport JWT (access 15m, refresh 7d), Argon2id, otplib (TOTP)
- **Validação**: class-validator + class-transformer (controllers); Zod (env)
- **Logging**: nestjs-pino (redact em headers `authorization` e `cookie`; o e-mail em modo log mascara o token e guarda o texto num arquivo, ver o `CLAUDE.md` da raiz)
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
`client_admin`, `client_editor`, `advertiser`).

- `PERMISSION_CEILING`: teto de permissões por tipo de membership (operadora: qualquer; cliente: `workspace:read`,
  `audit:read`, `client:read`, `site:read` e `robot:read`; anunciante: `workspace:read`). `assertRoleFitsScope` vale
  pra papel de sistema e customizado em toda atribuição (convite, `POST /users`, troca de papel, posse) e ao editar um papel que já
  está em uso. Em toda
  requisição, o `PermissionsGuard` e o `@CurrentPermissions` cortam as permissões do papel pelo teto do escopo
  (`withinCeiling`); sem `req.scope`, nenhuma permissão. O `permissions.guard.spec.ts` falha se uma rota com
  `PermissionsGuard` ou `@CurrentPermissions` não tiver o `WorkspaceGuard` antes.
- `assertCanGrant`: só operadora concede papel de operadora; os demais só dentro do próprio cliente/anunciante.
  `assertCanManageRoles`: só operadora cria ou edita papel. O escopo de quem concede vem do `TenantContext`.

- O `TenantContextMiddleware` abre um `AsyncLocalStorage` por requisição; o `WorkspaceGuard` grava o escopo
  (`organizationId`, `workspaceId`, `clientId`, `advertiserId`) em `TenantContext` e em `req.scope`.
- **Repositório de negócio usa `ScopedPrismaService` (`this.scoped.client`)**, nunca o `PrismaService` cru. A extensão
  (`src/shared/tenancy/tenant-scope.rewriter.ts`) põe o filtro de escopo em toda leitura e escrita dos modelos de
  `SCOPED_MODELS` (inclusive as raízes `Organization` e `Workspace`, limitadas à própria organização, que só escopo de
  operadora altera ou apaga), filtra relações de lista pra esses modelos em `include`/`select`/`_count`/filtros de
  relação, e recusa o que não dá pra filtrar: include a-um pra modelo escopado, `_count: true`, `orderBy` por relação
  escopada, escrita aninhada (use ids escalares ou o delegate do modelo), criação de raiz, `delete` que cascateia em
  modelo escopado, SQL cru e acesso sem escopo. Em qualquer modelo, escopado ou não, escrita que põe `workspaceId` ou
  `organizationId` fora do tenant do escopo dá 403, e o `update` que os grava só alcança linha do próprio tenant.
- No `Client`, o `clientField` é o próprio `id`: o usuário de cliente só alcança a linha do cliente dele. `Client`,
  `Site` e `Invitation` não têm `advertiserField`, então o anunciante leva 403 neles. O convite só leva `clientId`
  (papel de cliente) quando quem convida é a operadora; o cliente interno de cada organização (robôs próprios) nasce
  com ela e o banco o mantém único, ativo e não apagado.
- `Robot` também não tem `advertiserField`; o `clientId` acompanha o local (FK composta `(siteId, clientId,
  organizationId)` pro `Site`), e mover troca os dois. `RobotPairing` fica fora do `SCOPED_MODELS` porque nasce antes
  de o robô ter dono (sem coluna de tenant); a aprovação o liga a um `Robot` pelo `robotId`. O robô, sem escopo, só
  passa por `runAsSystem` na entrega do token e no `RobotAuthService` (token → robô ativo).
- **Soft delete e ordem dos locks.** A FK de um insert só pega `FOR KEY SHARE` no pai, que não espera o `UPDATE` de
  `deletedAt`. Por isso, quem apaga marca `deletedAt` antes de contar os dependentes, na mesma transação
  (`softDeleteUnlessUsed` de cliente e de local). E quem cria ou liga um filho a um `Client` ou `Site` trava o pai
  primeiro, na transação do insert, com `updateMany({ where: { id, deletedAt: null }, data: { updatedAt: now } })`; se
  `count` for 0, responde 404 e não cria nada. Fazem isso: criar local, mandar e aceitar convite, mover e aprovar robô.
  Ordem única pra todo caminho: `Client → Site → Robot → RobotPairing` (e `Client → Invitation → WorkspaceMember`).
  Nenhuma transação trava uma linha mais acima depois de uma mais abaixo, senão o Postgres aborta uma delas (40P01,
  que vira 500). O comentário de `prisma-robot-pairings.repository.ts` lista cada caminho, e os e2e "racing a ..."
  provam cada corrida com uma transação parada (`test/helpers/held-transaction.ts`).
- Limites do pareamento (`PairingRateLimiter`) ficam no Redis de verdade, inclusive nos testes (o `@nestjs/throttler`
  é desligado em `NODE_ENV=test`); sem Redis, o pareamento falha fechado (503). O e2e zera as chaves com
  `resetPairingLimits()`.
- **Socket do robô** (`modules/robot-link`, `ROBOT_SOCKET_PATH`): o token vem no header `Authorization` e é conferido no
  `verifyClient` do `ws`, antes do upgrade (401 sem abrir). Cada mensagem passa de novo pela identidade
  (`RobotAuthService.authenticateHash`, em `runAsSystem`) e grava em `runWithScope` com o escopo do robô naquele
  momento (`clientId` atual, workspace da operadora). O offline do close roda no escopo da organização do robô, porque
  o token pode já ter sido revogado. Revogar ou re-parear fecha o socket na hora (`RobotTokenEvents`). Presença:
  `Robot.online`/`lastSeenAt`; a varredura (`RobotPresenceSweeper`, a cada intervalo de ping) derruba quem ficou
  `online` com `lastSeenAt` velho (restart). O último estado fica no `Robot`; o histórico (`TelemetrySnapshot`) leva o
  cliente onde aconteceu e é apagado pelo job `cleanup-old-telemetry` depois de `TELEMETRY_RETENTION_DAYS`. O painel lê
  o histórico em `GET /robots/:id/telemetry?hours=1..24`, em blocos de 5 min agregados em código
  (`robots/services/telemetry-buckets.ts`). Pelo escopo, o cliente vê só as linhas do tempo em que o robô era dele.
- **Canal do painel** (`modules/live`, `LIVE_SOCKET_PATH`): `POST /live/tickets` (`robot:read`) dá um ticket de uso
  único (Redis, `GETDEL`, falha fechada) que o navegador manda como subprotocolo `ticket.<ticket>`, nunca na URL. O
  socket confere o `Origin` contra `CORS_ORIGINS`, filtra cada evento pela organização e pelo cliente atual do robô
  (`canSee`) e fecha com `4401` depois de `LIVE_SOCKET_MAX_AGE_MS`.
- **Handshake dos dois sockets:** o upgrade não passa pelo Express nem pelo throttler. Por isso, antes de qualquer
  I/O, o `verify()` recusa token ou ticket fora de `/^[0-9a-f]{64}$/` e IP com recusas demais
  (`HandshakeLimiter`, em memória, com o IP calculado como o `req.ip` do Express pelo `TRUST_PROXY`; 429 até a janela
  acabar, mas o IP bloqueado ainda tem 1 tentativa a cada 5 s, gasta só por handshake que passou do formato e do
  `Origin`). No robô, o hash de token que já autenticou (`KnownRobotTokens`, em memória, vazio no restart, sai com o
  `RobotTokenEvents` ou numa autenticação que falha) passa pelo IP bloqueado no ritmo dele, 1 a cada 2 s, e ainda
  autentica no banco. Cada recusa vira log com o IP e o motivo, nunca com o segredo. `closeTimeout` de 3 s: o `ws`
  ainda entrega mensagens de um socket em CLOSING, e o `RobotConnection.closing` faz o gateway ignorá-las. O hello só
  registra a conexão (e derruba a anterior com `4409`) depois de revalidar o token, dentro da fila de escritas do
  robô. No máximo 2 sockets por robô esperando hello e 5 sockets de painel por usuário; o painel que manda qualquer
  coisa leva `1008`.
- **Uma instância na v1:** o registro de conexões do robô (`RobotConnectionRegistry`) e o barramento de eventos do
  painel (`LiveEventBus`) ficam em memória, atrás de abstract classes. Com mais de uma instância, os dois passam pro
  Redis (registro compartilhado pra "a conexão nova derruba a antiga" e pub/sub pros eventos).
- O e2e dos sockets precisa de `app.listen(0)` e do `WsAdapter` (já no `createTestApp`); o `test/env.ts` usa ping de
  1 s, 3 faltas e hello em 2 s. Espere sempre com prazo (`waitFor` de `test/helpers/fleet.ts`), nunca com `sleep`.
  `createTestApp({ logs })` manda o log do pino de verdade (nível `trace`) pra um stream, pra provar que segredo não
  vai pro log.
- **Tabela de negócio nova** entra em `SCOPED_MODELS` (`src/shared/tenancy/scoped-models.ts`). O
  `tenant-scope.registry.spec.ts` falha se um modelo com `organizationId`/`clientId`/`advertiserId` ficar de fora, se um
  arquivo usar modelo escopado por client cru (`PrismaService`, `PrismaClient` ou `Prisma.TransactionClient`; por ponto,
  colchete, destructuring, relação ou SQL cru citando a tabela entre aspas) fora da allowlist (com motivo), ou se a
  convenção de chave estrangeira `<relação>Id` deixar de valer (é dela que sai "lista ou a-um", porque o DMMF de
  runtime do Prisma 7 não traz `isList`).
- Nada de `$queryRaw`/`$executeRaw` em tabela de negócio: a extensão não enxerga SQL cru e recusa os quatro métodos de
  SQL cru no client com escopo fora de `runAsSystem`.
- Jobs, seed e lookups de identidade que atravessam tenants rodam em `TenantContext.runAsSystem()`.
- O `@Cacheable` prefixa a chave com `system:`, `none:` ou o escopo (organização, workspace, cliente, anunciante):
  resultado de um contexto nunca serve outro.
- O fallback de super admin só vale pra membership no `__admin__` com o papel `SuperAdmin`.
- Cadeia de auditoria: só existe o `hashVersion` 2, que cobre `organizationId`, `clientId` e a própria versão e
  serializa o `metadata` em JSON canônico (passado por `JSON.stringify` e com chaves ordenadas, recursivamente), porque
  o JSONB devolve as chaves em outra ordem. O `create` grava o mesmo JSON que entrou no hash. Qualquer outra versão,
  inclusive a 1 do boilerplate (que não dá pra recalcular), reprova o verify com `bad_version`; o default da coluna é
  2. A FK de `AuditLog.organizationId` é `RESTRICT`, pra cascata nenhuma reescrever linha já
  encadeada.
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
- `@hostly/contracts` (ESM do workspace): o `moduleNameMapper` dos dois configs aponta pro `src` do pacote e o `test/transformers/esm-source.mjs` o compila pra CommonJS (o ts-jest manteria ESM, pelo `"type": "module"`). Fora do Jest, a API carrega o `dist` por `require(esm)`.

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
