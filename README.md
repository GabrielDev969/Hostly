# Hostly

Plataforma que controla robôs OrionStar LuckiBot Plus (RobotOS) em shoppings e outros locais. Um app Android próprio
substitui o app de fábrica do robô e toca propaganda nas duas telas, trilha sonora, falas e modos (cruzeiro, promoção,
base). Tudo é gerido por um painel web multiempresa: a operadora controla a frota, e cada cliente (ex.: um shopping)
tem a própria marca e acesso aos próprios robôs, campanhas e relatórios.

## Documentação

- [Especificação da v1](docs/spec.md): escopo, arquitetura, modelo de dados, protocolo e fases
- [CLAUDE.md](CLAUDE.md): regras e fluxo de trabalho pro agente de código
- [Spikes](docs/spikes.md): resultados dos testes no robô (Fase 0)
- [OrionStar](docs/orionstar.md): contato com o fabricante e respostas

## Estrutura

```text
hostly/
├── apps/
│   ├── api/          # NestJS + Prisma + PostgreSQL
│   ├── worker/       # BullMQ + FFmpeg
│   ├── web/          # Next.js (painel)
│   └── robot/        # app Android em Kotlin (Gradle, fora do pnpm)
├── packages/
│   ├── contracts/    # schemas Zod: manifesto, comandos, eventos
│   └── config/       # eslint, tsconfig
└── docs/             # spec.md, spikes.md, orionstar.md
```

As pastas `apps/` e `packages/` passam a existir a partir da #11.

## Como rodar

### Pré-requisitos

- [OrbStack](https://orbstack.dev) (ou Docker Desktop), com o Docker Compose v2
- [nvm](https://github.com/nvm-sh/nvm) para o Node 24.22.1, fixado no `.nvmrc`. O pnpm 12.15.0 vem do campo
  `packageManager` do `package.json`.

### Do zero ao ambiente rodando

```sh
nvm use
pnpm install
cp .env.example .env          # valores só de desenvolvimento; o .env não entra no git
docker compose up -d --wait   # sobe os serviços e espera ficarem saudáveis
docker compose ps -a          # postgres, redis e storage "healthy"; storage-init "Exited (0)"
```

Na primeira subida, o `storage-init` cria o bucket `hostly-media` e aplica o CORS do painel. Nas seguintes, ele só
confere que o bucket existe e reaplica o CORS. Ele roda logo depois que o storage fica saudável e termina alguns
segundos depois do `--wait` voltar: `docker compose logs storage-init` mostra o resultado.

| Serviço | Imagem | No host | Credencial de dev |
| --- | --- | --- | --- |
| Postgres | `postgres:18.6-alpine3.24` | `127.0.0.1:5432` | `hostly` / `hostly_dev`, banco `hostly` |
| Redis | `redis:8.10.2-alpine3.23` | `127.0.0.1:6379` | sem senha |
| Storage S3 (SeaweedFS) | `chrislusf/seaweedfs:4.48` | `http://127.0.0.1:8333` | `hostly-dev` / `hostly-dev-secret` |

As portas ficam presas em `127.0.0.1`. Se alguma já estiver em uso por outro projeto, troque `POSTGRES_PORT`,
`REDIS_PORT` ou `S3_PORT` no `.env`, e também a URL correspondente (`DATABASE_URL`, `REDIS_URL` ou `S3_ENDPOINT`).

### Testar a conexão

Os comandos abaixo rodam fora dos containers dos serviços. O `psql` e o `aws` rodam em containers de uso único, então
não é preciso instalar nada no Mac.

```sh
# Postgres
docker run --rm postgres:18.6-alpine3.24 \
  psql "postgresql://hostly:hostly_dev@host.docker.internal:5432/hostly" -c 'select version()'

# Redis: deve responder +PONG
printf 'PING\r\n' | nc -w1 127.0.0.1 6379

# Storage S3: deve listar o bucket hostly-media
docker run --rm -e AWS_ACCESS_KEY_ID=hostly-dev -e AWS_SECRET_ACCESS_KEY=hostly-dev-secret \
  -e AWS_DEFAULT_REGION=us-east-1 amazon/aws-cli:2.38.4 \
  --endpoint-url http://host.docker.internal:8333 s3 ls
```

### Parar e zerar

```sh
docker compose down      # para tudo e mantém os dados
docker compose down -v   # para tudo e apaga os volumes (banco, fila e bucket)
```

Em produção, o storage é R2 ou S3. O código usa só a API S3 padrão, configurada pelas variáveis `S3_*` do `.env`.
