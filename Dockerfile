# syntax=docker/dockerfile:1
#
# SUMMER: imagens de produção (multi-stage).
#
# Alvos (todos com o usuário node, uid 1000):
#   app      servidor Next.js (output: "standalone"), porta 3000, HEALTHCHECK em /api/health
#   worker   consumidor da fila pg-boss (dist/worker.mjs), HEALTHCHECK pelo arquivo de batimento
#   migrate  aplica as migrações (dist/migrate.mjs) e sai; uso manual (restauração, emergência)
#
# app e worker usam o docker/entrypoint.sh: com MIGRAR_AO_INICIAR=true, migram
# antes de subir (D020, opção A). O app é o último estágio: "docker build ." gera o app.
#
# Build local:  docker buildx build --target app|worker|migrate -t summer-<alvo> --load .
# No Coolify:   campo "Docker build stage target" = app ou worker. Ver docs/deploy.md.
# Versão:       --build-arg SUMMER_VERSAO=v0.1.0 (opcional; sem ela, o version do package.json)
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
# build: next build (gera .next/standalone) e build:scripts (gera dist/migrate.mjs
# e dist/worker.mjs com o esbuild, autossuficientes: não precisam de node_modules)
# -----------------------------------------------------------------------------
FROM deps AS build
COPY . .
# public/ pode não existir num clone limpo (o git não guarda pasta vazia)
RUN --mount=type=cache,id=summer-next-cache,target=/app/.next/cache \
    mkdir -p public && pnpm build && pnpm build:scripts

# -----------------------------------------------------------------------------
# runtime: base comum das três imagens finais
# Leva o migrate.mjs e as migrações SQL: o app e o worker migram na subida (D020).
# Os arquivos ficam com dono root e só leitura para o usuário node.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --link --chmod=755 docker/entrypoint.sh /usr/local/bin/summer-entrypoint
COPY --link --from=build /app/dist/migrate.mjs ./dist/migrate.mjs
# cria tenant, empresas e dono em produção: node dist/criar-tenant.mjs --ajuda
COPY --link --from=build /app/dist/criar-tenant.mjs ./dist/criar-tenant.mjs
# mesmo caminho relativo do código (PASTA_MIGRACOES_PADRAO): sem MIGRACOES_DIR
COPY --link --from=build /app/src/server/db/migrations ./src/server/db/migrations

# -----------------------------------------------------------------------------
# migrate: aplica as migrações e sai (D010). Sem entrypoint.
# Uso:  docker run --rm -e DATABASE_URL_MIGRACAO=... -e DATABASE_URL=... summer-migrate
# (DATABASE_URL é opcional: se o usuário for outro, recebe o uso da fila do pg-boss)
# -----------------------------------------------------------------------------
FROM runtime AS migrate
LABEL org.opencontainers.image.title="summer-migrate" \
      org.opencontainers.image.description="SUMMER: aplica as migrações do banco e sai"
USER node
CMD ["node", "dist/migrate.mjs"]

# -----------------------------------------------------------------------------
# worker: consumidor da fila pg-boss. Mesmo código do app, outro processo.
# Sem HTTP: o HEALTHCHECK confere a idade do arquivo de batimento, que o worker
# regrava a cada 15 s enquanto o banco responde (src/worker/worker.ts).
# SIGTERM: boss.stop() gracioso, até 8 s (cabe nos 10 s padrão do docker stop).
# -----------------------------------------------------------------------------
FROM runtime AS worker
LABEL org.opencontainers.image.title="summer-worker" \
      org.opencontainers.image.description="SUMMER: worker da fila (pg-boss)"
COPY --link --from=build /app/dist/worker.mjs ./dist/worker.mjs
ARG SUMMER_VERSAO=""
ENV SUMMER_VERSAO=${SUMMER_VERSAO}
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "const f=require('path').join(require('os').tmpdir(),'summer-worker-batimento');let ok=false;try{ok=Date.now()-require('fs').statSync(f).mtimeMs<60000}catch{}process.exit(ok?0:1)"]
ENTRYPOINT ["summer-entrypoint"]
CMD ["node", "dist/worker.mjs"]


# -----------------------------------------------------------------------------
# app: imagem final do servidor web (último estágio = alvo padrão)
# -----------------------------------------------------------------------------
FROM runtime AS app
LABEL org.opencontainers.image.title="summer-app" \
      org.opencontainers.image.description="SUMMER: servidor web (Next.js standalone)"
ENV PORT=3000 \
    HOSTNAME=0.0.0.0

# Usuário "node" (uid/gid 1000) da imagem oficial. Numérico por causa do --link.
# O Next grava cache em .next em runtime, por isso o dono é o node.
COPY --link --from=build --chown=1000:1000 /app/.next/standalone ./
COPY --link --from=build --chown=1000:1000 /app/.next/static ./.next/static
COPY --link --from=build --chown=1000:1000 /app/public ./public

ARG SUMMER_VERSAO=""
ENV SUMMER_VERSAO=${SUMMER_VERSAO}
USER node
EXPOSE 3000

# /api/health testa o banco (SELECT 1 com prazo de 2 s) e responde 503 se ele não
# responder. Usa o fetch do próprio Node: a imagem slim não tem curl nem wget.
# O Coolify usa este HEALTHCHECK no lugar do configurado no painel.
# start-period de 60 s: inclui a migração na subida (MIGRAR_AO_INICIAR=true).
HEALTHCHECK --interval=15s --timeout=5s --start-period=60s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["summer-entrypoint"]
CMD ["node", "server.js"]
