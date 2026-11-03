# Configuração do Claude Code no SUMMER

Tudo aqui é versionado junto com o projeto. Instalado em 2026-11-03.

## Agentes (`.claude/agents/`)

Feitos para o SUMMER. Todos recebem o `CLAUDE.md` automaticamente e, com ele, a especificação (`docs/especificacao.md`), que ele importa.

| Agente | Para quê |
|---|---|
| `arquiteto` | modelo de dados, ER, decisões técnicas, plano das entregas (não coda) |
| `backend` | schema, domínio, actions, queries, auth, worker, route handlers |
| `ui-ux` | telas e componentes, identidade visual 2.1, balcão, responsividade |
| `testes` | Vitest de domínio, integração com Postgres real, Playwright |
| `devops` | docker-compose, Dockerfile, CI, Coolify, backups, `docs/deploy.md` |
| `integracoes` | plano e implementação de Focus NFe, Mercado Livre, MDe e e-commerce; dúvidas fiscais |
| `revisor-multitenant` | revisão de isolamento, permissões, segredos e idempotência (só leitura) |
| `revisor-estoque` | revisão de estoque, custo, dinheiro e concorrência (só leitura) |

## Skills do projeto (`.claude/skills/`)

**Feitas para o SUMMER**

- `nova-fatia`: roteiro de uma fatia vertical, da migração ao commit.
- `migracao-drizzle`: migrações aditivas com o drizzle-kit, busca com trigram e unaccent.
- `fechar-entrega`: verificação, roteiro de homologação, pendências e CHANGELOG.

**De terceiros** (copiadas sem alteração, exceto a remoção das pastas `agents/` do Docker, que são configurações do Codex)

| Skill | Origem | Commit | Licença |
|---|---|---|---|
| `better-auth-best-practices`, `create-auth`, `organization-best-practices`, `email-and-password-best-practices` | github.com/better-auth/skills (`better-auth/`) | `20c9e88` (2026-09-01) | o repositório não declara licença |
| `better-auth-security-best-practices` | github.com/better-auth/skills (`security/`) | `20c9e88` | o repositório não declara licença |
| `supabase-postgres-best-practices` | github.com/supabase/agent-skills | `c9be0e9` (2026-10-02) | MIT |
| `next-dev-loop` | github.com/vercel/next.js (`skills/`) | `61e1348f` (2026-11-02) | MIT |
| `docker-build-strategies`, `docker-compose-patterns`, `docker-destructive-guardrails` | github.com/docker/skills | `34969c3` (2026-10-30) | Apache-2.0 |

Para atualizar uma skill de terceiro: clone o repositório de origem, compare com `diff -r`, leia o que mudou e só então copie por cima.

**Globais** (em `~/.claude/skills/`, fora do repositório, usadas pelos agentes quando existem): `shadcn`, `zod`, `tailwind-design-system`, `web-design-guidelines`, `impeccable`, `ui-ux-pro-max`, `vercel-react-best-practices`, `vercel-composition-patterns`, `webapp-testing`, `systematic-debugging` e `verification-before-completion`.

## Plugins (`.claude/settings.json`, marketplace `claude-plugins-official`)

- **`context7`**: documentação atualizada de bibliotecas (Drizzle, Better Auth, pg-boss, Zod, shadcn…), via servidor MCP remoto da Upstash.
- **`typescript-lsp`**: diagnósticos e navegação de TypeScript. Requer `npm i -g typescript-language-server typescript` (já instalado nesta máquina).
- **`security-guidance`**:
  - avisos por padrão a cada edição;
  - revisão do diff por LLM ao fim de cada turno;
  - revisão agêntica a cada `git commit`.

  As regras do projeto ficam em `.claude/claude-security-guidance.md`. As revisões por LLM consomem uso da conta; para desligar só a revisão por turno, defina `ENABLE_STOP_REVIEW=0`. Requer Python 3.

## Pré-requisitos que ainda faltam

- **`next-dev-loop`:** precisa do Next.js 16.3+ rodando com Turbopack e do `agent-browser` (`npm i -g agent-browser@latest`). Instale quando o app existir.
- **Documentação do Next:** a partir do 16.3, o próprio Next mantém um bloco no `AGENTS.md` apontando para `node_modules/next/dist/docs/`. Ao rodar o `create-next-app`, gere numa pasta temporária e mescle, para não sobrescrever o `CLAUDE.md`.
- **`.gitignore`** (quando o repositório for criado): incluir `.claude/settings.local.json` e `.claude/agent-memory-local/`.
