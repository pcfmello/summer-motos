/**
 * Schema do Postgres onde o pg-boss guarda a fila (`PGBOSS_SCHEMA`).
 *
 * O nome entra direto no SQL de instalação e nos GRANTs, então só aceita
 * identificador simples em minúsculas (sem aspas), como o pg-boss recomenda.
 */
export const SCHEMA_PGBOSS_PADRAO = "pgboss";

const IDENTIFICADOR_SIMPLES = /^[a-z_][a-z0-9_]{0,49}$/;

export function lerSchemaPgBoss(valor: string | undefined): string {
  const schema = valor?.trim() || SCHEMA_PGBOSS_PADRAO;
  if (!IDENTIFICADOR_SIMPLES.test(schema)) {
    throw new Error(
      `PGBOSS_SCHEMA inválido: "${schema}" (use letras minúsculas, dígitos e _, começando por letra ou _, até 50 caracteres)`,
    );
  }
  return schema;
}
