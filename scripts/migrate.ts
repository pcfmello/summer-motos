/**
 * Aplica as migrações pendentes (D010, D020): `pnpm db:migrate`.
 *
 * - Usa o `migrate()` do drizzle-orm (node-postgres), com advisory lock
 *   (chave em `CHAVE_LOCK_MIGRACOES`), então dois processos nunca migram juntos.
 * - Todas as pendentes vão numa transação só: falhou uma, nada é aplicado.
 * - Termina com código 0 (sucesso, inclusive sem pendências) ou 1 (erro).
 * - URL: DATABASE_URL_MIGRACAO, senão DATABASE_URL; `--banco=teste` usa DATABASE_URL_TEST.
 *
 * Só imports relativos e de pacotes (sem alias `@/`, sem tsx em produção): o
 * Dockerfile empacota este arquivo em JS puro com esbuild (D020).
 */
import {
  PASTA_MIGRACOES_PADRAO,
  aplicarMigracoes,
  descreverUrl,
} from "../src/server/db/migracoes";
import { carregarEnvLocal, pastaMigracoes, urlDoBanco } from "./_ambiente";

async function main(): Promise<number> {
  carregarEnvLocal();
  const alvo = urlDoBanco(process.argv.slice(2));
  const pasta = pastaMigracoes(PASTA_MIGRACOES_PADRAO);
  const log = (m: string) => console.log(`[migrate] ${m}`);
  log(`banco: ${descreverUrl(alvo.url)} (${alvo.nome})`);
  log(`pasta: ${pasta}`);

  const inicio = Date.now();
  const { aplicadas, status } = await aplicarMigracoes({
    connectionString: alvo.url,
    pasta,
    log,
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
