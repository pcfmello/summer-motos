/**
 * Fábrica de conexão e transação, sem `server-only`.
 *
 * O app usa o singleton de `./index.ts` (que importa `server-only`). Scripts
 * (seed, criar-tenant), o worker e os testes de integração usam estas funções
 * diretamente, com a URL que quiserem, sem passar pelo guarda do Next.
 *
 * Imports só relativos e de pacotes: nada de alias `@/`, para o arquivo poder
 * ser empacotado em JS puro (D020).
 */
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Banco = NodePgDatabase<Schema>;
/** O `tx` que `withTransaction` repassa. Tem a mesma API de consulta do `db`. */
export type Transacao = Parameters<Parameters<Banco["transaction"]>[0]>[0];

export type NivelIsolamento = "read committed" | "repeatable read" | "serializable";

export type OpcoesTransacao = {
  /** Padrão: `read committed`. */
  isolamento?: NivelIsolamento;
  /** `read only` para leituras consistentes (relatórios). Padrão: `read write`. */
  modoAcesso?: "read only" | "read write";
  /**
   * Tempo máximo esperando uma trava de linha ou tabela (`SET LOCAL lock_timeout`).
   * Padrão 5000 ms. Estourou: erro 55P03 (`lock_not_available`), sem retentativa.
   * Evita que uma tela fique presa atrás de uma transação travada.
   */
  esperaLockMs?: number;
  /**
   * Total de tentativas quando o Postgres aborta por conflito de serialização
   * (40001) ou deadlock (40P01). Padrão 1 (sem retentativa); máximo 5.
   *
   * A função roda de novo do zero. Só ligue se ela seguir as quatro regras:
   * 1. nada fora da transação: não enfileirar job nem chamar HTTP dentro do `fn`;
   *    enfileire depois do commit, ou pelo pg-boss na mesma conexão (`tx`);
   * 2. tudo o que decide o resultado é lido dentro do `fn`, com `FOR UPDATE`
   *    (saldo, sequência, status do documento), nunca antes de chamar;
   * 3. nenhum estado acumulado fora do `fn` (contadores, listas, objetos
   *    mutados): a tentativa anterior não pode deixar rastro;
   * 4. nunca `redirect()` ou `notFound()` dentro do `fn`: eles lançam exceção
   *    de controle do Next, que desfaria a transação.
   */
  tentativas?: number;
};

export const MAXIMO_TENTATIVAS = 5;
export const PADRAO_ESPERA_LOCK_MS = 5_000;
const PADRAO_POOL_MAX = 10;

/** Códigos SQLSTATE que justificam repetir a transação inteira. */
const CODIGOS_REPETIVEIS = new Set(["40001", "40P01"]);

/**
 * Lê o SQLSTATE de um erro do `pg`, inclusive quando o Drizzle o embrulha em
 * `DrizzleQueryError` (o erro original fica em `cause`).
 */
export function codigoErroPg(erro: unknown): string | undefined {
  let atual: unknown = erro;
  for (let i = 0; i < 5 && atual && typeof atual === "object"; i++) {
    const codigo = (atual as { code?: unknown }).code;
    if (typeof codigo === "string") return codigo;
    atual = (atual as { cause?: unknown }).cause;
  }
  return undefined;
}

export function erroRepetivel(erro: unknown): boolean {
  const codigo = codigoErroPg(erro);
  return codigo !== undefined && CODIGOS_REPETIVEIS.has(codigo);
}

function lerPoolMax(valor: string | undefined): number {
  if (!valor) return PADRAO_POOL_MAX;
  const n = Number.parseInt(valor, 10);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    throw new Error(`DATABASE_POOL_MAX inválido: "${valor}" (use um inteiro de 1 a 100)`);
  }
  return n;
}

export type OpcoesPool = {
  connectionString: string | undefined;
  /** Texto bruto de `DATABASE_POOL_MAX`. */
  max?: string;
  /** Aparece em `pg_stat_activity` (ex.: `summer-app`, `summer-worker`). */
  applicationName?: string;
} & Pick<PoolConfig, "idleTimeoutMillis" | "connectionTimeoutMillis">;

export function criarPool(opcoes: OpcoesPool): Pool {
  const pool = new Pool({
    connectionString: opcoes.connectionString,
    max: lerPoolMax(opcoes.max),
    idleTimeoutMillis: opcoes.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: opcoes.connectionTimeoutMillis ?? 10_000,
    application_name: opcoes.applicationName ?? "summer",
  });
  // Um cliente ocioso que perde a conexão emite "error" no Pool. Sem ouvinte,
  // o processo inteiro cai. O pg descarta o cliente; aqui só registramos,
  // sem a mensagem completa, que pode conter a URL com senha.
  pool.on("error", (erro) => {
    console.error("[db] erro num cliente ocioso do Pool:", codigoErroPg(erro) ?? erro.name);
  });
  return pool;
}

export function criarBanco(pool: Pool): Banco {
  return drizzle({ client: pool, schema });
}

const esperar = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Cria o `withTransaction` de um banco. Todo código que mexe em estoque,
 * reservas, numeração ou documentos passa por ele (seção 2 da especificação).
 *
 * A função recebe o `tx` e tudo dentro dela é uma transação só: commit se
 * terminar, rollback se lançar. Nada de chamada HTTP externa aqui dentro.
 */
export function criarWithTransaction(banco: Banco) {
  return async function withTransaction<T>(
    fn: (tx: Transacao) => Promise<T>,
    opcoes: OpcoesTransacao = {},
  ): Promise<T> {
    const tentativas = opcoes.tentativas ?? 1;
    if (!Number.isInteger(tentativas) || tentativas < 1 || tentativas > MAXIMO_TENTATIVAS) {
      throw new Error(`tentativas deve ser um inteiro de 1 a ${MAXIMO_TENTATIVAS}`);
    }
    const esperaLockMs = opcoes.esperaLockMs ?? PADRAO_ESPERA_LOCK_MS;
    if (!Number.isInteger(esperaLockMs) || esperaLockMs < 1 || esperaLockMs > 600_000) {
      throw new Error("esperaLockMs deve ser um inteiro de 1 a 600000");
    }
    const config = {
      isolationLevel: opcoes.isolamento ?? "read committed",
      accessMode: opcoes.modoAcesso ?? "read write",
    } as const;

    for (let tentativa = 1; ; tentativa++) {
      try {
        return await banco.transaction(async (tx) => {
          // valor inteiro validado acima; SET não aceita parâmetro ($1)
          await tx.execute(sql.raw(`set local lock_timeout = ${esperaLockMs}`));
          return fn(tx);
        }, config);
      } catch (erro) {
        if (tentativa >= tentativas || !erroRepetivel(erro)) throw erro;
        // espera crescente com variação, para as transações em conflito não colidirem de novo
        await esperar(20 * 2 ** (tentativa - 1) + Math.floor(Math.random() * 20));
      }
    }
  };
}

export type WithTransaction = ReturnType<typeof criarWithTransaction>;
