# CLAUDE.md — Hostly

O Hostly controla robôs OrionStar LuckiBot Plus (RobotOS) em shoppings e outros locais: propaganda nas duas telas,
trilha sonora, falas e modos (cruzeiro, promoção, base), geridos por um painel web multiempresa.
A nuvem decide e entrega; o robô executa sozinho com o último manifesto que recebeu.

**A fonte da verdade é [`docs/spec.md`](docs/spec.md).** Leia a spec antes de qualquer tarefa. Este arquivo só resume
as regras e aponta as seções; em caso de dúvida, vale a spec.

## Stack

Detalhes em `docs/spec.md` → "Stack e estrutura do repositório".

| Camada | Escolha |
| --- | --- |
| Monorepo | pnpm workspaces + Turborepo |
| API | NestJS + Prisma + PostgreSQL, partindo do boilerplate SaaS (Workspace + Membership) |
| Fila | Redis + BullMQ |
| Mídia | Storage S3 compatível (SeaweedFS local; R2 ou S3 em produção) + CDN; FFmpeg no worker |
| Painel | Next.js (App Router) + TanStack Query |
| Tempo real | WebSocket nativo (`@nestjs/platform-ws`) |
| Contratos | `packages/contracts` com schemas Zod exportados em JSON Schema |
| App do robô | Kotlin, coroutines, Room, WorkManager, OkHttp, Media3/ExoPlayer, `robotservice.jar` |
| Local | Docker Compose no OrbStack (Postgres, Redis, SeaweedFS) |
| Produção | VPS com Docker; CDN na frente do bucket |

```text
hostly/
├── apps/
│   ├── api/              # NestJS
│   ├── worker/           # BullMQ + FFmpeg
│   ├── web/              # Next.js (painel)
│   └── robot/            # projeto Gradle (Kotlin), fora do pnpm
│       ├── libs/             # robotservice.jar da ROM testada
│       ├── app/              # Activity principal, UI touch, pareamento
│       ├── core-robot/       # RobotGateway: impl RobotOS + fake (único que importa a OrionStar)
│       ├── core-data/        # Room, manifesto, downloads, WebSocket, eventos, comandos
│       ├── core-ui/          # tema da marca
│       ├── feature-player/   # Presentation da tela de 27" e player de música
│       └── feature-modes/    # motor de modos
├── packages/
│   ├── contracts/        # schemas: manifesto, comandos, eventos
│   └── config/           # eslint, tsconfig
├── docs/                 # spec.md, spikes.md, orionstar.md
├── docker-compose.yml
└── CLAUDE.md
```

## Comandos

Não invente comandos: se um comando não está aqui, ele ainda não existe.

Pré-requisito: `nvm use` (Node 24.22.1, fixado no `.nvmrc`). O pnpm 12.15.0 vem do campo `packageManager`.

| Comando | Faz |
| --- | --- |
| `pnpm install` | Instala as dependências de todos os pacotes |
| `pnpm dev` | Sobe em paralelo o `dev` de cada app (cache desligado) |
| `pnpm build` | Build de tudo, na ordem das dependências, com cache do Turborepo |
| `pnpm lint` | ESLint (flat config de `@hostly/config/eslint`) |
| `pnpm typecheck` | `tsc` sem emitir |
| `pnpm test` | Testes unitários (sem Docker) |
| `pnpm test:e2e` | Testes e2e; os da API usam Testcontainers e precisam do Docker/OrbStack |
| `pnpm format` / `pnpm format:check` | Prettier escreve / confere (ignora `*.md`, `apps/robot` e os arquivos gerados: JSON Schema, `openapi.json` e os tipos do painel) |
| `pnpm turbo run <tarefa> --filter <pacote>` | Roda uma tarefa num pacote só, ex.: `--filter @hostly/config` |
| `pnpm --filter @hostly/contracts build` | Compila o pacote e regenera `packages/contracts/schemas/*.json` (o diff entra no commit) |
| `pnpm --filter @hostly/contracts test` | Valida as fixtures contra os schemas (`node --test`, direto do `src`) |
| `cp .env.example .env` | Cria o `.env` local (uma vez; o git ignora) |
| `pnpm --filter @hostly/api env:keys` | Imprime chaves JWT e `ENCRYPTION_KEY` de desenvolvimento pra colar no `.env` |
| `pnpm --filter @hostly/api dev` | Sobe só a API em watch (porta `API_PORT`; Swagger em `/docs`) |
| `pnpm --filter @hostly/api db:migrate` | `prisma migrate dev`: cria e aplica migração em desenvolvimento |
| `pnpm --filter @hostly/api db:deploy` | `prisma migrate deploy`: aplica as migrações pendentes |
| `pnpm --filter @hostly/api openapi` | Regenera `apps/api/openapi.json` (o diff entra no commit); o `pnpm test` da API falha se ele estiver velho |
| `pnpm --filter @hostly/web dev` | Sobe só o painel em watch (porta 3000, com webpack: o Turbopack do `next dev` 16.4.2 quebra no `next/font/google` deste repo; o `next build` usa Turbopack e passa); a API precisa estar de pé em `NEXT_PUBLIC_API_URL` |
| `pnpm --filter @hostly/web generate` | Gera `apps/web/src/lib/api/schema.d.ts` a partir do `openapi.json` (o Turbo roda antes de dev, build, lint, typecheck e test; o git ignora) |
| `pnpm --filter @hostly/web test` | Testes do painel (Vitest + Testing Library + MSW, sem API de verdade) |
| `pnpm --filter @hostly/api fake-robot --serial <serial>` | Robô simulado: pareia com a API local (mostra o código; aprove no painel ou no Swagger), conecta no WebSocket, manda `hello` e telemetria e responde ping. `--telemetry-interval <s>` (padrão 10), `--close-after <s>` (fecha limpo) e `--vanish-after <s>` (para de responder sem fechar). Precisa do contracts compilado (`pnpm build`) e não grava o token em disco |
| `pnpm --filter @hostly/api db:seed` | Seed idempotente: permissões, admin (`SUPER_ADMIN_*`), a operadora (`SEED_OPERATOR_*`) com o admin como `operator_admin` e o cliente interno dela (`SEED_INTERNAL_CLIENT_NAME`) |
| `docker compose up -d --wait` | Sobe Postgres, Redis e SeaweedFS e espera ficarem saudáveis; o `storage-init` cria o bucket e o CORS logo depois |
| `docker compose ps -a` | Status dos serviços (`storage-init` termina com `Exited (0)`) |
| `docker compose logs -f <serviço>` | Logs de um serviço: `postgres`, `redis`, `storage` ou `storage-init` |
| `docker compose down` | Para tudo e mantém os dados nos volumes |
| `docker compose down -v` | Para tudo e apaga os volumes (zera banco, fila e bucket) |

Configs compartilhadas em `packages/config`: `tsconfig/base.json`, `tsconfig/node.json` (API e worker),
`tsconfig/nextjs.json` (painel), `eslint` e `prettier`. No `eslint.config.js` de cada app, somar
`parserOptions.tsconfigRootDir: import.meta.dirname` (a API usa `eslint.config.mjs`, porque o pacote é CommonJS como o
NestJS). Dependência nova com script de build precisa entrar no `allowBuilds` do `pnpm-workspace.yaml`, senão o
`pnpm install` falha.

A API (`apps/api`) tem regras próprias em [`apps/api/CLAUDE.md`](apps/api/CLAUDE.md) e lê o `.env` da raiz. Ainda não
existe: o worker entra no `pnpm dev` quando nascer (#30); `apps/robot` é Gradle, fora do pnpm, e os comandos dele chegam
na #23.

Painel (`apps/web`, `@hostly/web`): Next.js (App Router) + TanStack Query, lê o `.env` da raiz pelo `next.config.ts`.

- Fala direto com a API (CORS com credentials), em `NEXT_PUBLIC_API_URL`. Painel e API ficam no mesmo site e em HTTPS
  em produção, porque o cookie de refresh é `SameSite=Lax` e `secure`.
- O access token fica só em memória (`src/lib/session/session-client.ts`): nunca em `localStorage`, `sessionStorage`,
  URL ou log. As abas dividem um token pelo `BroadcastChannel` e renovam uma de cada vez no `navigator.locks`, porque a
  API revoga todas as sessões do usuário quando o mesmo cookie de refresh volta duas vezes.
- Cliente tipado: `openapi-fetch` com os tipos gerados do `apps/api/openapi.json`. Mudou rota ou DTO na API, rode
  `pnpm --filter @hostly/api openapi` e commite o JSON.
- O menu sai do escopo e das permissões efetivas de `GET /workspaces/:id/me` (`src/features/shell/menu.ts`), nunca do
  nome do papel. É conforto: quem barra é a API. O cliente escolhido fica em `?client=` e as telas leem com
  `useClientFilter()`.
- Cores, fontes e medidas são CSS variables em `src/app/globals.css`, com os valores padrão da operadora; componente
  nenhum usa hex nem nome de marca.
- Canal ao vivo (`src/features/robots/live`): o `LiveRobotsProvider` mora no layout de `/robots`, então lista e
  detalhe dividem um socket, que fecha ao sair da seção ou quando a sessão cai. Ele pede um ticket a cada conexão e
  manda o ticket só no subprotocolo. Cada evento passa pelo `liveEventSchema`, e o que não valida é ignorado. O
  evento vai direto pro cache do Query, e cada `open` recarrega o REST. Reconexão:
  - `4401`: ticket novo na hora;
  - outro fechamento ou ticket com 429/5xx: backoff de 1 s até 30 s;
  - ticket com 401/403: para de vez.
- O painel depende do `@hostly/contracts`: no Next vale o `dist` (o Turbo compila antes), e no Vitest um alias aponta
  pro `src`. O WebSocket nos testes é o `ws.link` do MSW (`test/robots.ts`).
- Confirmação é o `Dialog` de `src/components/dialog.tsx`, nunca `confirm()`/`alert()`.
- ESLint: `@next/eslint-plugin-next`, `react-hooks` e `jsx-a11y` direto no flat config. O `eslint-config-next` fica de
  fora porque puxa plugins que não suportam o ESLint 10; os peers do `jsx-a11y` (ESLint 10) e do `openapi-typescript`
  (TypeScript 6) estão liberados em `peerDependencyRules`, depois de provados.

Contratos (`packages/contracts`, `@hostly/contracts`): schemas Zod dos formatos robô ↔ nuvem (`ws/*`, mais as constantes
do socket: caminho, header de auth, intervalos e códigos de fechamento) e da família `live/*` (nuvem → painel: eventos e
constantes do canal ao vivo). Um nome por schema em `contractSchemas` (`src/registry.ts`), que vira
`schemas/<nome>.json` e a pasta `fixtures/<nome>/{valid,invalid}`.

- O pacote é só ESM (`"type": "module"`). A API, CommonJS, carrega o `dist` por `require(esm)` (Node 24), então nada de
  top-level `await` no pacote. No Jest da API, `@hostly/contracts` aponta pro `src` e o
  `apps/api/test/transformers/esm-source.mjs` compila pra CommonJS.
- Imports relativos com `.ts` (o `tsc` reescreve pra `.js`): o Node roda os testes e o gerador direto do `src`.
- O zod vem do `catalog:` do `pnpm-workspace.yaml`, igual pra todos os pacotes.
- `CONTRACT_VERSION` (`src/version.ts`, inteiro, vai no `hello`) sobe só em mudança que quebra: campo removido ou
  renomeado, tipo, unidade ou limite mais estrito, campo novo obrigatório, valor de enum removido ou novo num campo que
  o outro lado lê. Campo opcional novo e mensagem nova não sobem.
- Quem recebe ignora o que não conhece, sem derrubar a conexão: `type` desconhecido e payload inválido viram log
  (`parseRobotMessage` / `parseCloudMessage`), e campo a mais é descartado.
- Unidades: x/y em metros, `theta` em radianos, bateria de 0 a 100 (%); o app converte se o robô reportar diferente.

## CI

`.github/workflows/ci.yml` roda em todo PR pra `main` e em todo push na `main`, com os mesmos comandos da tabela acima
e sem nenhum segredo (o `apps/api/test/env.ts` gera as chaves dos testes):

- **`verify`**: `pnpm install --frozen-lockfile`, `format:check`, `lint`, `typecheck`, `build`, JSON Schema em dia
  (falha se o build mudou ou criou algo em `packages/contracts/schemas`) e `test` (que também falha se o
  `apps/api/openapi.json` estiver velho). O build do painel baixa as fontes do Google Fonts (`next/font`).
- **`e2e`**: `pnpm install --frozen-lockfile` e `test:e2e` (Testcontainers no Docker do runner), em paralelo ao `verify`.

O ruleset `main` exige PR (sem aprovação, porque o dono trabalha sozinho) e os checks `verify` e `e2e` verdes, bloqueia
force push e exclusão da branch, e não tem bypass. Numa emergência, o dono põe o ruleset em *Disabled* (Settings →
Rules) e religa depois. Renomear um job quebra o check exigido: atualize o ruleset junto. As actions vão fixadas por SHA
e o Dependabot (`.github/dependabot.yml`) abre PR semanal pra atualizá-las.

## Regras críticas

1. O alvo é RobotOS: nenhuma dependência do AgentOS SDK. (spec → "Preparado pro AgentOS")
2. Nada fora de `core-robot` importa classes da OrionStar; todo acesso ao robô passa pelo `RobotGateway`, e toda voz
   pelo `VoiceService`. (spec → "App Android")
3. Nenhuma marca fixa no código: logo, cores, fonte e textos vêm do perfil de marca no manifesto.
   (spec → "Operadora, clientes e marcas" e "Cara do projeto")
4. Formatos entre robô e nuvem (manifesto, comandos, eventos, WebSocket) mudam primeiro em `packages/contracts`.
   (spec → "Protocolo robô ↔ nuvem")
5. Toda query de negócio filtra por `organizationId`, e por `clientId`/`advertiserId` quando o usuário é de cliente
   ou anunciante. (spec → "Modelo de dados")
6. O robô nunca depende de rede pra tocar a agenda. (spec → "Arquitetura" e "Pipeline de propaganda")
7. Só contagens saem do robô; nenhuma imagem (LGPD). O app nunca abre a câmera direto: usa a `PersonApi`.
   (spec → "Regras do robô que mandam no desenho", item 8)
8. Um recurso de chassi por vez; respeitar `onSuspend`/`onRecovery`. (spec → "Regras do robô que mandam no desenho")
9. No robô o app instala por ADB e abre pela Home do RobotOS; Run/Debug do Android Studio não funciona.
   No emulador, usar o `FakeRobotGateway`.
10. Senha do ADB, tokens e chaves nunca entram no repositório.

APIs do robô e o que falta validar no Plus: spec → "Mapa de APIs do robô". Riscos e planos B: spec → "Riscos e
decisões em aberto".

## Como trabalhar uma issue

Leia a issue inteira (`gh api repos/GabrielDev969/hostly/issues/N`) e as seções da spec que ela cita.

**Issue de código** — etapas, sempre nesta ordem:

1. **PLANO** — lê a issue e a spec e propõe o que vai mudar. **Não altera código.** O dono revisa e libera.
2. **IMPLEMENTAÇÃO** — faz o mínimo que a issue pede, numa branch `issue-N-descricao`.
3. **REVISÃO** — o dono (ou um agente revisor) revisa o PR.
4. **CORREÇÃO** — ajusta o que a revisão apontou, no mesmo PR.

**Spike (Fase 0)** — etapas:

1. **SPIKE** — o agente escreve o teste; o dono instala no robô, roda e cola o resultado.
2. **REGISTRO DO SPIKE** — o resultado vai pra [`docs/spikes.md`](docs/spikes.md) no modelo de lá.

Regras:

- Uma issue por PR. Branch `issue-N-descricao`. Descrição do PR com `Closes #N`.
- Mude o mínimo; prove antes de afirmar; pare e pergunte quando a decisão for do dono.
- Uma fase fecha pelo critério de pronto no robô de verdade, não pela lista de tarefas (spec → "Fases de implementação").

**Agentes em paralelo** (duas issues ao mesmo tempo, cada uma com o seu agente):

- Cada agente trabalha num `git worktree` próprio, nunca na mesma pasta de outro.
- O Postgres local é um só. Num worktree com migrações diferentes das que o banco já tem, não rode `db:migrate` nem
  `prisma migrate dev`, e recuse qualquer reset: use outro database no `DATABASE_URL` só daquele worktree.
- Pare só o processo que você mesmo iniciou, pelo PID. Nunca mate por padrão amplo (`pkill -f`, `killall`), porque
  pega o processo do outro agente.
- Só um agente sobe a API na porta `API_PORT` por vez.
- Antes de abrir o PR, faça rebase na `main`. Conflito no `pnpm-lock.yaml` se resolve rodando `pnpm install`, nunca à
  mão, e arquivo gerado (JSON Schema e afins) se resolve gerando de novo.

## Fluxo do quadro

Quadro "Hostly v1" (GitHub Projects). Status:

- **Backlog**: ideia ainda não planejada, ou issue com alguma dependência aberta
- **Ready**: todas as dependências fechadas; pode começar
- **In Progress**: o agente move ao começar a trabalhar (plano, spike ou código)
- **In Review**: PR aberto esperando revisão do dono
- **Done**: PR com `Closes #N` mergeado (a issue fecha sozinha)

Ao fechar uma issue: conferir as issues que dependiam dela (seção "Depende de" de cada uma) e mover pra **Ready** as que
ficaram sem dependência aberta. Use só as opções de Status que já existem. Se o `gh project` falhar, avise e siga.

## Idioma

- Tudo que vai pro dono (planos, relatórios, PRs, issues, docs) em português do Brasil.
- Código e identificadores em inglês.
- Commits em português, no formato `tipo: descrição`, com tipo `feat`, `fix`, `docs`, `chore`, `test` ou `refactor`.
  Ex.: `docs: registra o spike da tela de 27"`.

## Documentos

- [`docs/spec.md`](docs/spec.md) — especificação da v1 (não editar sem pedido do dono)
- [`docs/spikes.md`](docs/spikes.md) — resultados dos spikes no robô
- [`docs/orionstar.md`](docs/orionstar.md) — contato com a OrionStar e respostas
