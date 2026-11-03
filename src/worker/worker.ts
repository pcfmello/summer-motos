/**
 * Worker do SUMMER: consumidor da fila pg-boss, num processo separado do app
 * (mesmo código, outro container).
 *
 * - Pool de negócio próprio (`criarPool`, D024), para os handlers usarem com
 *   `criarBanco`/`criarWithTransaction`. Sem `server-only`.
 * - pg-boss com o pool interno dele (`connectionString`), que mantém o que o
 *   adaptador próprio perderia: cancelamento de comandos no `stop()`, LISTEN/NOTIFY
 *   e workers transacionais. Mesmo usuário (`DATABASE_URL`).
 * - `migrate: false`: o schema da fila é criado e migrado pelo `migrate` com o
 *   dono do banco (`src/server/fila/instalar.ts`). Se faltar migração, o
 *   `start()` falha e o processo sai com erro.
 * - Batimento: a cada `intervaloBatimentoMs`, se o banco responde, grava a hora
 *   no arquivo de batimento. O HEALTHCHECK do Dockerfile confere a idade dele.
 */
import { rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PgBoss } from "pg-boss";
import type { Pool } from "pg";
import { criarPool, codigoErroPg } from "@/server/db/conexao";
import { lerSchemaPgBoss } from "@/server/fila/schema";
import { verificarBanco, versaoDaAplicacao } from "@/server/saude";
import { registrarFilas } from "./filas";

/** Caminho fixo: o HEALTHCHECK do Dockerfile lê o mesmo arquivo. */
export const ARQUIVO_BATIMENTO = path.join(tmpdir(), "summer-worker-batimento");
export const INTERVALO_BATIMENTO_MS = 15_000;
/** Tempo para os jobs em andamento terminarem no SIGTERM. Cabe nos 10 s do `docker stop`. */
export const PRAZO_PARADA_MS = 8_000;
/** Conexões do pool interno do pg-boss (busca, conclusão e manutenção dos jobs). */
const PGBOSS_POOL_MAX = 4;

export type ConfigWorker = {
  databaseUrl: string;
  /** Texto bruto de DATABASE_POOL_MAX (pool de negócio). */
  poolMax?: string;
  schema: string;
  concorrencia: number;
  arquivoBatimento: string;
  intervaloBatimentoMs: number;
  log: (mensagem: string) => void;
};

export function lerConfigWorker(
  env: NodeJS.ProcessEnv,
  log: (mensagem: string) => void = (m) => console.log(`[worker] ${m}`),
): ConfigWorker {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está definida (ver .env.example)");
  const textoConcorrencia = env.WORKER_CONCORRENCIA?.trim() || "5";
  const concorrencia = Number.parseInt(textoConcorrencia, 10);
  if (!/^\d+$/.test(textoConcorrencia) || concorrencia < 1 || concorrencia > 50) {
    throw new Error(`WORKER_CONCORRENCIA inválido: "${textoConcorrencia}" (use um inteiro de 1 a 50)`);
  }
  return {
    databaseUrl,
    poolMax: env.DATABASE_POOL_MAX,
    schema: lerSchemaPgBoss(env.PGBOSS_SCHEMA),
    concorrencia,
    arquivoBatimento: ARQUIVO_BATIMENTO,
    intervaloBatimentoMs: INTERVALO_BATIMENTO_MS,
    log,
  };
}

export type Worker = {
  boss: PgBoss;
  /** Pool de negócio dos handlers. */
  pool: Pool;
  /** Para de buscar jobs, espera os em andamento (até PRAZO_PARADA_MS) e fecha as conexões. */
  parar: () => Promise<void>;
};

export async function iniciarWorker(config: ConfigWorker): Promise<Worker> {
  const { log } = config;
  log(`iniciando (versão ${versaoDaAplicacao()}, schema ${config.schema}, concorrência ${config.concorrencia})`);

  const pool = criarPool({
    connectionString: config.databaseUrl,
    max: config.poolMax,
    applicationName: "summer-worker",
  });

  const boss = new PgBoss({
    connectionString: config.databaseUrl,
    schema: config.schema,
    application_name: "summer-worker-pgboss",
    max: PGBOSS_POOL_MAX,
    // usuário restrito: nada de DDL em runtime
    migrate: false,
    createSchema: false,
    reindex: false,
    persistQueueStats: false,
  });
  // Sem ouvinte, um "error" derrubaria o processo. O pg-boss se recupera sozinho
  // quando o banco volta; aqui só registramos (sem stack e sem a URL).
  boss.on("error", (erro: Error) => {
    log(`pg-boss: erro: ${codigoErroPg(erro) ?? erro.name}: ${erro.message}`);
  });

  let parando = false;

  try {
    await boss.start();
    await registrarFilas(boss, { concorrencia: config.concorrencia, log });
  } catch (erro) {
    await boss.stop({ graceful: false }).catch(() => {});
    await pool.end().catch(() => {});
    throw erro;
  }

  let bancoOk: boolean | undefined;
  const bater = async () => {
    if (parando) return;
    const ok = await verificarBanco(pool);
    if (ok !== bancoOk) {
      log(ok ? "banco respondendo; batimento ativo" : "banco não responde; batimento suspenso");
      bancoOk = ok;
    }
    if (ok && !parando) {
      await writeFile(config.arquivoBatimento, new Date().toISOString()).catch((erro: Error) => {
        log(`não consegui gravar o batimento: ${erro.message}`);
      });
    }
  };
  await bater();
  const timer = setInterval(() => void bater(), config.intervaloBatimentoMs);
  timer.unref();
  log("pronto");

  let parada: Promise<void> | undefined;
  const parar = () => {
    parada ??= (async () => {
      parando = true;
      clearInterval(timer);
      await rm(config.arquivoBatimento, { force: true });
      log("parando: aguardando os jobs em andamento...");
      try {
        await boss.stop({ graceful: true, timeout: PRAZO_PARADA_MS });
      } finally {
        await pool.end();
      }
      log("parado");
    })();
    return parada;
  };

  return { boss, pool, parar };
}
