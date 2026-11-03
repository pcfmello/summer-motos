/**
 * Aplica as migrações pendentes (D010, D020): `pnpm db:migrate`.
 *
 * - Usa o `migrate()` do drizzle-orm (node-postgres), com advisory lock
 *   (chave em `CHAVE_LOCK_MIGRACOES`), então dois processos nunca migram juntos.
 * - Todas as pendentes vão numa transação só: falhou uma, nada é aplicado.
 * - Termina com código 0 (sucesso, inclusive sem pendências) ou 1 (erro).
 * - URL: DATABASE_URL_MIGRACAO, senão DATABASE_URL; `--banco=teste` usa DATABASE_URL_TEST.
 * - Ainda com o lock, cria ou migra o schema do pg-boss (`PGBOSS_SCHEMA`) e, se o
 *   usuário do app (DATABASE_URL) for outro, concede a ele só o uso da fila
 *   (`src/server/fila/instalar.ts`, fatia 0.11).
 *
 * Só imports relativos e de pacotes (sem alias `@/`, sem tsx em produção): o
 * Dockerfile empacota este arquivo em JS puro com esbuild (D020).
 */
import {
  PASTA_MIGRACOES_PADRAO,
  aplicarMigracoes,
  descreverUrl,
} from "../src/server/db/migracoes";
import { instalarPgBoss, papelDoApp } from "../src/server/fila/instalar";
import { carregarEnvLocal, pastaMigracoes, urlDoBanco } from "./_ambiente";

async function main(): Promise<number> {
  carregarEnvLocal();
  const alvo = urlDoBanco(process.argv.slice(2));
  const pasta = pastaMigracoes(PASTA_MIGRACOES_PADRAO);
  const log = (m: string) => console.log(`[migrate] ${m}`);
  log(`banco: ${descreverUrl(alvo.url)} (${alvo.nome})`);
  log(`pasta: ${pasta}`);

  // no banco de teste (--banco=teste) o usuário é o mesmo: nada a conceder
  const papelApp = alvo.nome === "DATABASE_URL_MIGRACAO" ? papelDoApp(process.env.DATABASE_URL, alvo.url) : null;

  const inicio = Date.now();
  const { aplicadas, status } = await aplicarMigracoes({
    connectionString: alvo.url,
    pasta,
    log,
    depois: async (cliente) => {
      await instalarPgBoss(cliente, { schema: process.env.PGBOSS_SCHEMA, papelApp, log });
    },
  });
  log(
    `${aplicadas.length} migração(ões) aplicada(s) em ${Date.now() - inicio} ms; ` +
      `${status.aplicadas.length} aplicada(s) no total, ${status.pendentes.length} pendente(s)`,
  );
  return 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    // a mensagem do pg nunca traz a senha; a URL completa não é impressa
    console.error(`[migrate] FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  },
);
