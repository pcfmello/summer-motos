/**
 * Ambiente dos scripts de banco (migrate, db-status).
 *
 * - Carrega o `.env` só se existir (ambiente local). Variáveis já definidas no
 *   ambiente têm prioridade, como no container.
 * - `--banco=teste` usa `DATABASE_URL_TEST` (pnpm db:migrate:test / db:status:test).
 *
 * Imports só de `node:*`: o script de migração é empacotado em JS puro (D020).
 */
import { existsSync } from "node:fs";

export function carregarEnvLocal(): void {
  if (existsSync(".env")) process.loadEnvFile(".env");
}

export type Alvo = { nome: string; url: string };

/** URL para migrar ou consultar: DATABASE_URL_MIGRACAO, senão DATABASE_URL (D010). */
export function urlDoBanco(argv: readonly string[]): Alvo {
  if (argv.includes("--banco=teste")) {
    const url = process.env.DATABASE_URL_TEST;
    if (!url) throw new Error("DATABASE_URL_TEST não está definida");
    return { nome: "DATABASE_URL_TEST", url };
  }
  if (process.env.DATABASE_URL_MIGRACAO) {
    return { nome: "DATABASE_URL_MIGRACAO", url: process.env.DATABASE_URL_MIGRACAO };
  }
  if (process.env.DATABASE_URL) return { nome: "DATABASE_URL", url: process.env.DATABASE_URL };
  throw new Error("defina DATABASE_URL_MIGRACAO ou DATABASE_URL");
}

/** Pasta das migrações. No container, `MIGRACOES_DIR` pode apontar para outro lugar. */
export function pastaMigracoes(padrao: string): string {
  return process.env.MIGRACOES_DIR || padrao;
}
