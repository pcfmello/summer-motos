/**
 * drizzle-kit (0.31): só gera migrações SQL a partir do schema (D010).
 *
 * - Nunca use `drizzle-kit push` nem `drizzle-kit migrate`: as migrações são
 *   aplicadas por `scripts/migrate.ts` (pnpm db:migrate), com advisory lock.
 * - `pnpm db:generate --name <slug>` e `pnpm db:generate:custom --name <slug>`.
 * - O SQL gerado é lido inteiro antes do commit (skill migracao-drizzle).
 */
import { existsSync } from "node:fs";
import { defineConfig } from "drizzle-kit";

// O .env só existe no ambiente local; variáveis já definidas no ambiente têm prioridade.
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  dialect: "postgresql",
  // index.ts reexporta os módulos de src/server/db/schema/*
  schema: "./src/server/db/schema/index.ts",
  out: "./src/server/db/migrations",
  // Só usado por comandos que conectam (ex.: drizzle-kit studio). O generate não conecta.
  dbCredentials: {
    url: process.env.DATABASE_URL_MIGRACAO || process.env.DATABASE_URL || "",
  },
  // mesma tabela de controle usada por scripts/migrate.ts
  migrations: { schema: "drizzle", table: "__drizzle_migrations" },
  strict: true,
  verbose: true,
});
