#!/bin/sh
# Entrypoint das imagens app e worker (D020, opção A: migrar na subida).
#
# 1. Se MIGRAR_AO_INICIAR=true, aplica as migrações (Drizzle + schema do pg-boss)
#    com DATABASE_URL_MIGRACAO (usuário dono do banco). O advisory lock da D023
#    garante que app e worker subindo juntos não migram ao mesmo tempo.
# 2. Se a migração falhar, sai com erro: o processo não sobe, o container nunca
#    fica healthy e, com o rolling update do Coolify, a versão anterior continua no ar.
# 3. Remove DATABASE_URL_MIGRACAO do ambiente e faz exec do processo (CMD), que
#    vira o PID 1 e recebe o SIGTERM do docker stop diretamente.
set -eu

if [ "${MIGRAR_AO_INICIAR:-false}" = "true" ]; then
  if [ -z "${DATABASE_URL_MIGRACAO:-}" ]; then
    echo "[entrypoint] MIGRAR_AO_INICIAR=true exige DATABASE_URL_MIGRACAO (usuário dono do banco)" >&2
    exit 1
  fi
  echo "[entrypoint] aplicando migrações antes de iniciar"
  if ! node /app/dist/migrate.mjs; then
    echo "[entrypoint] a migração falhou: o processo não vai subir" >&2
    exit 1
  fi
fi

# o processo do app/worker não herda a credencial de dono do banco
unset DATABASE_URL_MIGRACAO

exec "$@"
