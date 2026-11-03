# syntax=docker/dockerfile:1
#
# SUMMER: imagens de produção (multi-stage).
#
# Alvos:
#   app      servidor Next.js (output: "standalone")              -> ativo
#   worker   consumidor da fila pg-boss (src/worker/index.ts)      -> comentado: habilitar na fatia 0.11
#   migrate  aplica as migrações (scripts/migrate.ts) e sai        -> comentado: habilitar na fatia 0.3
#
# Build local:  docker build --target app -t summer-app .
# No Coolify:   campo "Docker build stage target" = app (ou worker). Ver docs/deploy.md.
#
# Nenhum segredo entra na imagem: todas as variáveis (DATABASE_URL, BETTER_AUTH_SECRET,
# CHAVES_CIFRAGEM...) chegam só em runtime, pelo ambiente do container.

ARG NODE_VERSION=22.23.4

# -----------------------------------------------------------------------------
# base: Node + pnpm (versão do campo packageManager do package.json, via corepack)
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
    NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

# -----------------------------------------------------------------------------
# deps: todas as dependências (inclusive dev, necessárias para o build)
# Só os manifestos entram aqui, então esta camada só é refeita quando o
# lockfile muda. O store do pnpm fica num cache do BuildKit, fora da imagem.
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=summer-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store

# -----------------------------------------------------------------------------
# build: next build (gera .next/standalone)
# -----------------------------------------------------------------------------
FROM deps AS build
COPY . .
# public/ pode não existir num clone limpo (o git não guarda pasta vazia)
RUN --mount=type=cache,id=summer-next-cache,target=/app/.next/cache \
    mkdir -p public && pnpm build

# -----------------------------------------------------------------------------
# app: imagem final do servidor web
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS app
LABEL org.opencontainers.image.title="summer-app" \
      org.opencontainers.image.description="SUMMER: servidor web (Next.js standalone)"
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app

# Usuário "node" (uid/gid 1000) da imagem oficial. Numérico por causa do --link.
# O Next grava cache em .next em runtime, por isso o dono é o node.
COPY --link --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --link --from=build --chown=1000:1000 /app/.next/static ./.next/static
COPY --link --from=build --chown=1000:1000 /app/public ./public

# TODO(fatia 0.3, proposta em docs/deploy.md seção 5): migração na subida do container.
# COPY --link --from=build --chown=1000:1000 /app/dist/migrate.mjs ./migrate.mjs
# COPY --link --chmod=755 docker/entrypoint.sh /usr/local/bin/summer-entrypoint
# ENTRYPOINT ["summer-entrypoint"]

USER node
EXPOSE 3000

# /api/health testa o banco (SELECT 1 com timeout) e responde 503 se ele não
# responder. Usa o fetch do próprio Node: a imagem slim não tem curl nem wget.
# O Coolify usa este HEALTHCHECK no lugar do configurado no painel.
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

CMD ["node", "server.js"]

# -----------------------------------------------------------------------------
# prod-deps / worker / migrate: habilitar quando os arquivos de origem existirem.
#
# Decisão pendente (fatia 0.3 / 0.11): rodar TypeScript em produção sem tsx.
#   Opção A: empacotar src/worker/index.ts e scripts/migrate.ts com esbuild em
#            dist/*.mjs no estágio build (resolve o alias "@/"); a imagem leva só
#            o arquivo empacotado + node_modules de produção.
#   Opção B: node --experimental-strip-types (padrão no Node 22.18+), mas os
#            imports "@/..." não funcionam sem bundler.
# Os blocos abaixo assumem a opção A, com os scripts build:worker e build:migrate.
# -----------------------------------------------------------------------------

# --- dependências de produção (worker e migrate) -----------------------------
# FROM base AS prod-deps
# COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
# RUN --mount=type=cache,id=summer-pnpm-store,target=/pnpm/store \
#     pnpm install --frozen-lockfile --prod --store-dir /pnpm/store

# --- worker: habilitar na fatia 0.11 (esqueleto do worker pg-boss) ------------
# Mesmo código do app, outro processo. Precisa tratar SIGTERM (boss.stop()).
# FROM node:${NODE_VERSION}-bookworm-slim AS worker
# LABEL org.opencontainers.image.title="summer-worker"
# ENV NODE_ENV=production
# WORKDIR /app
# COPY --link --from=prod-deps --chown=1000:1000 /app/node_modules ./node_modules
# COPY --link --from=build --chown=1000:1000 /app/package.json ./package.json
# COPY --link --from=build --chown=1000:1000 /app/dist/worker.mjs ./worker.mjs
# USER node
# Sem HTTP: o healthcheck lê um arquivo de batimento que o worker atualiza.
# HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
#   CMD ["node", "-e", "const s=require('fs').statSync('/tmp/worker-vivo');process.exit(Date.now()-s.mtimeMs<90000?0:1)"]
# CMD ["node", "worker.mjs"]

# --- migrate: habilitar na fatia 0.3 (recurso de migrações, D010) -------------
# Roda e sai. Só o necessário para aplicar as migrações (sem drizzle-kit).
# Uso manual:  docker run --rm --env DATABASE_URL_MIGRACAO=... summer-migrate
# FROM node:${NODE_VERSION}-bookworm-slim AS migrate
# LABEL org.opencontainers.image.title="summer-migrate"
# ENV NODE_ENV=production
# WORKDIR /app
# COPY --link --from=prod-deps --chown=1000:1000 /app/node_modules ./node_modules
# COPY --link --from=build --chown=1000:1000 /app/dist/migrate.mjs ./migrate.mjs
# COPY --link --from=build --chown=1000:1000 /app/src/server/db/migrations ./src/server/db/migrations
# USER node
# CMD ["node", "migrate.mjs"]
