# SUMMER

Sistema de gestão para lojas de moto peças com oficina: estoque, orçamentos, balcão, ordens de serviço, notas fiscais, Mercado Livre e e-commerce.

- O que construir e por quê: [`docs/especificacao.md`](docs/especificacao.md)
- Guia do repositório (stack, convenções, regras): [`CLAUDE.md`](CLAUDE.md)
- Plano e status das entregas: [`docs/plano.md`](docs/plano.md)
- Decisões técnicas: [`docs/decisoes.md`](docs/decisoes.md)
- Modelo de dados: [`docs/modelo-dados.md`](docs/modelo-dados.md)
- Deploy, ambientes e backup: [`docs/deploy.md`](docs/deploy.md)

## Rodar localmente

Pré-requisitos:

- Node 22 (versão exata no [`.nvmrc`](.nvmrc); com nvm, `nvm use`);
- pnpm via corepack (`corepack enable`);
- Docker com Compose.

No Windows com WSL, ative em Docker Desktop → Settings → Resources → WSL integration a distribuição usada.

```sh
cp .env.example .env    # uma vez; revise os valores
docker compose up -d    # Postgres 17 (5432) e MinIO (9000; console em 9001), só em 127.0.0.1
docker compose ps       # postgres e minio "healthy"; minio-init "exited (0)"
pnpm install
pnpm dev                # http://localhost:3000
```

- O `docker compose up` também cria o banco de testes `summer_test`, o bucket `summer-local` e a chave de acesso do app no MinIO.
- Para parar, use `docker compose down`. Os dados ficam nos volumes.
- **`docker compose down -v` apaga o banco e os arquivos locais.** Só rode se quiser mesmo começar do zero.

## Comandos principais

| Comando | O que faz |
|---|---|
| `pnpm dev` | app em desenvolvimento |
| `pnpm build` | build de produção (standalone) |
| `pnpm lint` | ESLint |
| `pnpm typecheck` | tipos do Next + `tsc --noEmit` |
| `pnpm test` | testes de domínio (Vitest, sem banco) |
| `pnpm test:integration` | testes de integração com Postgres real (`DATABASE_URL_TEST`) |
| `docker build --target app -t summer-app .` | imagem de produção do app |

Os comandos de banco (`db:migrate`, `db:status`, `db:seed`) e o `worker` estão listados no [`CLAUDE.md`](CLAUDE.md) e entram nas próximas fatias da Entrega 0.

## Fluxo de publicação

`feature/*` → PR para `develop` (homologação, deploy automático) → PR para `main` (produção, depois da aprovação do diretor). Detalhes em [`docs/deploy.md`](docs/deploy.md).
