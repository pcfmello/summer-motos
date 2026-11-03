/**
 * Ponto de entrada do worker (`pnpm worker` no local; `node dist/worker.mjs` na imagem).
 *
 * - SIGTERM (docker stop, deploy do Coolify) ou SIGINT (Ctrl+C): para com
 *   `boss.stop()` gracioso e sai com 0. Um segundo sinal sai na hora, com 1.
 * - Falha ao iniciar (banco fora, schema do pg-boss sem migrar): sai com 1.
 *
 * Variáveis: DATABASE_URL, PGBOSS_SCHEMA, WORKER_CONCORRENCIA, DATABASE_POOL_MAX
 * (ver .env.example). No local, o script `pnpm worker` carrega o .env.
 */
import { iniciarWorker, lerConfigWorker } from "./worker";

const log = (m: string) => console.log(`[worker] ${m}`);

async function main(): Promise<void> {
  const worker = await iniciarWorker(lerConfigWorker(process.env, log));

  let sinais = 0;
  const encerrar = (sinal: NodeJS.Signals) => {
    sinais += 1;
    if (sinais > 1) {
      log(`${sinal} de novo: saindo sem esperar`);
      process.exit(1);
    }
    log(`${sinal} recebido`);
    worker.parar().then(
      () => process.exit(0),
      (erro: unknown) => {
        console.error(`[worker] erro ao parar: ${erro instanceof Error ? erro.message : String(erro)}`);
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", encerrar);
  process.on("SIGINT", encerrar);
}

main().catch((erro: unknown) => {
  // a mensagem do pg nunca traz a senha; a URL não é impressa
  console.error(`[worker] falhou ao iniciar: ${erro instanceof Error ? erro.message : String(erro)}`);
  process.exit(1);
});
