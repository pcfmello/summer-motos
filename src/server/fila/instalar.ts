/**
 * Instalação e migração do schema do pg-boss com a credencial de dono do banco.
 *
 * Por quê aqui (fatia 0.11): em homologação e produção o worker usa o
 * `summer_app`, que não tem `CREATE` no banco (docs/deploy.md, seção 10). A
 * documentação do pg-boss 12 (https://pgboss.io/install) recomenda, para um
 * usuário sem `CREATE`, criar e migrar o schema fora da aplicação (CLI ou
 * funções estáticas) e iniciar o pg-boss com `migrate: false`. O `migrate` do
 * SUMMER já roda com o dono (`DATABASE_URL_MIGRACAO`) e com o advisory lock da
 * D023, então ele faz isso, logo depois das migrações do Drizzle.
 *
 * Mesmo procedimento do `pg-boss migrate` (CLI, `dist/cli.js` do 12.38):
 * - schema ausente: `getConstructionPlans` (função pública) cria tudo numa transação;
 * - versão antiga: `migrateCommands` com `inlineAsync`, que roda a migração numa
 *   transação e, depois do COMMIT, os `CREATE INDEX CONCURRENTLY` um a um, sem
 *   depender do BAM (que só roda numa instância com `migrate: true`);
 * - versão igual: nada; versão mais nova que a do pacote (rollback do app): só aviso.
 *
 * `migrateCommands` não faz parte da API pública: o pg-boss está fixado em
 * versão exata no package.json, e o teste de integração `fila.test.ts` exercita
 * a instalação e a migração. Revise este arquivo a cada atualização do pg-boss.
 *
 * Depois, concede ao usuário do app (quando for outro) só o necessário para usar
 * a fila: USAGE no schema, DML nas tabelas, sequências e EXECUTE nas funções.
 * Sem TRUNCATE e sem DDL.
 */
import type { ClientBase } from "pg";
import { getConstructionPlans } from "pg-boss";
import { getAllForConfig, migrateCommands } from "pg-boss/dist/migrationStore.js";
import pacotePgBoss from "pg-boss/package.json";
import { lerSchemaPgBoss } from "./schema";

/** Versão do schema que o pg-boss instalado espera (`pgboss.schema` do package.json dele). */
export const VERSAO_SCHEMA_PGBOSS: number = pacotePgBoss.pgboss.schema;

export type ResultadoPgBoss = {
  acao: "instalado" | "migrado" | "atual" | "banco_a_frente";
  versaoAntes: number | null;
  versaoDepois: number;
  /** Papel que recebeu os privilégios de uso, se algum. */
  papelApp: string | null;
};

export type OpcoesPgBoss = {
  /** `PGBOSS_SCHEMA` (validado). */
  schema?: string;
  /**
   * Usuário do app e do worker (`summer_app`), que recebe os privilégios de uso.
   * `null` quando é o mesmo usuário que migra (local e CI).
   */
  papelApp?: string | null;
  log?: (mensagem: string) => void;
};

async function lerVersao(cliente: ClientBase, schema: string): Promise<number | null> {
  const existe = await cliente.query<{ existe: boolean }>(
    "select to_regclass($1) is not null as existe",
    [`${schema}.version`],
  );
  if (!existe.rows[0]?.existe) return null;
  const r = await cliente.query<{ version: string | number }>(`select version from ${schema}.version`);
  const versao = r.rows[0]?.version;
  return versao === undefined ? null : Number.parseInt(String(versao), 10);
}

/**
 * Cria ou migra o schema do pg-boss. O `cliente` precisa ser do dono do banco
 * e, de preferência, estar segurando o advisory lock das migrações.
 */
export async function instalarPgBoss(
  cliente: ClientBase,
  opcoes: OpcoesPgBoss = {},
): Promise<ResultadoPgBoss> {
  const schema = lerSchemaPgBoss(opcoes.schema);
  const log = opcoes.log ?? (() => {});
  const papelApp = opcoes.papelApp ?? null;

  const versaoAntes = await lerVersao(cliente, schema);
  let acao: ResultadoPgBoss["acao"];

  if (versaoAntes === null) {
    log(`pg-boss: criando o schema "${schema}" (versão ${VERSAO_SCHEMA_PGBOSS})`);
    await cliente.query(getConstructionPlans(schema, { createSchema: true }));
    acao = "instalado";
  } else if (versaoAntes < VERSAO_SCHEMA_PGBOSS) {
    log(`pg-boss: migrando o schema "${schema}" da versão ${versaoAntes} para ${VERSAO_SCHEMA_PGBOSS}`);
    const particionadas = await cliente.query<{ table_name: string; policy: string }>(
      `select table_name, policy from ${schema}.queue where partition = true`,
    );
    const { sql, concurrent } = migrateCommands(
      schema,
      versaoAntes,
      getAllForConfig({
        schema,
        noTablePartitioning: false,
        noCoveringIndexes: false,
        noAddColumnBackfill: false,
      }),
      false,
      {
        inlineAsync: true,
        partitionTables: particionadas.rows.map((l) => ({ tableName: l.table_name, policy: l.policy })),
      },
    );
    await cliente.query(sql);
    // CREATE INDEX CONCURRENTLY não roda dentro de transação: um por vez
    for (const comando of concurrent) await cliente.query(comando);
    acao = "migrado";
  } else if (versaoAntes > VERSAO_SCHEMA_PGBOSS) {
    log(
      `pg-boss: aviso: o schema "${schema}" está na versão ${versaoAntes}, mais nova que a ${VERSAO_SCHEMA_PGBOSS} deste código (versão anterior do app?). Nada a fazer.`,
    );
    acao = "banco_a_frente";
  } else {
    log(`pg-boss: schema "${schema}" já está na versão ${versaoAntes}`);
    acao = "atual";
  }

  if (papelApp) {
    const papel = cliente.escapeIdentifier(papelApp);
    // Também para o que o dono criar depois neste schema (novas tabelas do pg-boss).
    await cliente.query(`
      grant usage on schema ${schema} to ${papel};
      grant select, insert, update, delete on all tables in schema ${schema} to ${papel};
      grant usage, select, update on all sequences in schema ${schema} to ${papel};
      grant execute on all functions in schema ${schema} to ${papel};
      alter default privileges in schema ${schema} grant select, insert, update, delete on tables to ${papel};
      alter default privileges in schema ${schema} grant usage, select, update on sequences to ${papel};
      alter default privileges in schema ${schema} grant execute on functions to ${papel};
    `);
    log(`pg-boss: privilégios de uso concedidos a "${papelApp}" (sem DDL e sem TRUNCATE)`);
  }

  const versaoDepois = acao === "banco_a_frente" ? (versaoAntes as number) : VERSAO_SCHEMA_PGBOSS;
  return { acao, versaoAntes, versaoDepois, papelApp };
}

/**
 * Usuário do app a partir das URLs: só quando quem migra (`DATABASE_URL_MIGRACAO`)
 * é outro usuário. No local e no CI as duas URLs usam o mesmo usuário.
 */
export function papelDoApp(urlApp: string | undefined, urlMigracao: string): string | null {
  if (!urlApp) return null;
  try {
    const app = decodeURIComponent(new URL(urlApp).username);
    const dono = decodeURIComponent(new URL(urlMigracao).username);
    return app && app !== dono ? app : null;
  } catch {
    return null;
  }
}
