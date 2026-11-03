/**
 * Banco do app e do worker: um único `Pool` em escopo de módulo, reaproveitado
 * por todas as requisições (seção 2 da especificação).
 *
 * - `db`: Drizzle com o schema completo.
 * - `withTransaction(fn, opcoes)`: ver `./conexao.ts`.
 *
 * Scripts, worker e testes não importam este arquivo: o `server-only` lança erro
 * fora do Next (sem a condição `react-server`). Eles usam `criarPool`,
 * `criarBanco` e `criarWithTransaction` de `./conexao`.
 */
import "server-only";
import type { Pool } from "pg";
import { criarBanco, criarPool, criarWithTransaction } from "./conexao";

export type {
  Banco,
  NivelIsolamento,
  OpcoesTransacao,
  Schema,
  Transacao,
  WithTransaction,
} from "./conexao";

const url = process.env.DATABASE_URL;
// No `next build` o módulo pode ser avaliado sem banco; o Pool só conecta na primeira query.
if (!url && process.env.NEXT_PHASE !== "phase-production-build") {
  throw new Error("DATABASE_URL não está definida (ver .env.example)");
}

// Em desenvolvimento, o HMR do Next reavalia módulos: o Pool fica no globalThis
// para não abrir um Pool novo a cada edição. Em produção é avaliado uma vez.
const globalComPool = globalThis as typeof globalThis & { __summerPool?: Pool };

export const pool: Pool =
  globalComPool.__summerPool ??
  criarPool({
    connectionString: url,
    max: process.env.DATABASE_POOL_MAX,
    applicationName: "summer-app",
  });

if (process.env.NODE_ENV !== "production") globalComPool.__summerPool = pool;

export const db = criarBanco(pool);
export const withTransaction = criarWithTransaction(db);
