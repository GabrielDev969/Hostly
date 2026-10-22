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

A preencher na #12 (ambiente local com Docker Compose).
