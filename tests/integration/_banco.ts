/**
 * Apoio dos testes de integração (D011): banco `summer_test`, Postgres real.
 *
 * Os testes recriam o schema e dão TRUNCATE: por segurança, a URL precisa
 * apontar para um banco cujo nome termine em `_test`.
 */
import { existsSync } from "node:fs";
import { Client } from "pg";

export function urlBancoTeste(): string {
  if (existsSync(".env")) process.loadEnvFile(".env");
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST não está definida (ver .env.example)");
  const banco = new URL(url).pathname.replace(/^\//, "");
  if (!banco.endsWith("_test")) {
    throw new Error(`DATABASE_URL_TEST precisa apontar para um banco *_test (recebido: "${banco}")`);
  }
  return url;
}

type Consultavel = { query: (sql: string) => Promise<{ rows: unknown[] }> };

/**
 * Segunda trava, depois de conectar: o banco em que a conexão realmente caiu
 * (`current_database()`) precisa terminar em `_test`. Protege contra uma URL que
 * passe na primeira conferência mas aponte para outro banco (pgbouncer, alias…).
 */
export async function exigirBancoDeTeste(conexao: Consultavel): Promise<void> {
  const r = await conexao.query("select current_database() as banco");
  const banco = (r.rows[0] as { banco: string }).banco;
  if (!banco.endsWith("_test")) {
    throw new Error(`recusado: a conexão está no banco "${banco}", que não termina em _test`);
  }
}

/** Apaga tudo (tabelas, funções, extensões e a tabela de controle) e deixa o schema public vazio. */
export async function recriarSchema(url: string): Promise<void> {
  const cliente = new Client({ connectionString: url });
  await cliente.connect();
  try {
    await exigirBancoDeTeste(cliente);
    await cliente.query("drop schema if exists drizzle cascade");
    await cliente.query("drop schema if exists public cascade");
    await cliente.query("create schema public");
  } finally {
    await cliente.end();
  }
}

/** TRUNCATE em todas as tabelas do schema public (entre os casos de teste). */
export async function limparTabelas(conexao: Consultavel): Promise<void> {
  await exigirBancoDeTeste(conexao);
  await conexao.query(`
    do $$
    declare lista text;
    begin
      select string_agg(format('%I.%I', schemaname, tablename), ', ')
        into lista from pg_tables where schemaname = 'public';
      if lista is not null then
        execute 'truncate table ' || lista || ' restart identity cascade';
      end if;
    end $$;
  `);
}

export type ErroPg = { code: string; constraint?: string };

/** Executa e devolve o SQLSTATE e a constraint do erro do Postgres, ou `null` se não houve erro. */
export async function erroPg(promessa: Promise<unknown>): Promise<ErroPg | null> {
  try {
    await promessa;
    return null;
  } catch (erro) {
    // o Drizzle embrulha o erro do pg em DrizzleQueryError (o original fica em `cause`)
    let atual: unknown = erro;
    while (atual && typeof atual === "object") {
      const { code, constraint } = atual as { code?: unknown; constraint?: unknown };
      if (typeof code === "string") {
        return typeof constraint === "string" ? { code, constraint } : { code };
      }
      atual = (atual as { cause?: unknown }).cause;
    }
    throw erro;
  }
}
