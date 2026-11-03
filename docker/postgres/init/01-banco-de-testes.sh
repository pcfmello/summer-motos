#!/bin/sh
# Cria o banco dos testes de integração (D011) ao lado do banco de desenvolvimento.
#
# Roda só na primeira subida do Postgres (volume vazio), pelo entrypoint da
# imagem oficial. As extensões (pg_trgm, unaccent) e as tabelas são criadas
# pelas migrações, nos dois bancos; aqui só nasce o banco vazio.
set -eu

: "${POSTGRES_TEST_DB:=summer_test}"

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v banco="$POSTGRES_TEST_DB" \
  -v dono="$POSTGRES_USER" <<'EOSQL'
SELECT format('CREATE DATABASE %I OWNER %I', :'banco', :'dono')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'banco')\gexec
EOSQL
