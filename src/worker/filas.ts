/**
 * Filas do worker e seus handlers.
 *
 * Esqueleto (fatia 0.11): só a fila `sistema.ping`, que registra no log. As
 * filas de negócio (outbox → canais, Focus, Mercado Livre) entram nas próximas
 * entregas, cada uma com o handler na própria pasta de `src/server`.
 *
 * As filas não são particionadas (`partition: false`, padrão do pg-boss 12):
 * criar fila particionada é DDL, e o `summer_app` não tem esse privilégio.
 */
import type { PgBoss } from "pg-boss";

export const FILAS = {
  ping: "sistema.ping",
} as const;

export type DadosPing = { origem?: string };

export type ContextoFilas = {
  concorrencia: number;
  log: (mensagem: string) => void;
};

export async function registrarFilas(boss: PgBoss, contexto: ContextoFilas): Promise<void> {
  // idempotente: a fila que já existe não muda
  await boss.createQueue(FILAS.ping, {
    retryLimit: 3,
    retryBackoff: true,
    expireInSeconds: 60,
  });

  await boss.work<DadosPing>(
    FILAS.ping,
    { localConcurrency: contexto.concorrencia },
    async (jobs) => {
      for (const job of jobs) {
        contexto.log(`${FILAS.ping}: job ${job.id} recebido (origem: ${job.data?.origem ?? "?"})`);
      }
    },
  );
}
