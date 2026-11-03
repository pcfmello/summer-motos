/**
 * Verificação de saúde do banco, usada pelo `/api/health` (app) e pelo
 * batimento do worker. Sem `server-only` e sem alias `@/`: o worker é
 * empacotado em JS puro (D020).
 *
 * - Faz `select 1` com prazo curto. Estourou o prazo, recusou a conexão ou deu
 *   erro: responde `false`. Nunca lança e nunca devolve a mensagem do erro.
 * - A conexão que deu erro ou estourou o prazo é descartada (`release(erro)`),
 *   para não voltar ao Pool num estado desconhecido.
 */
import type { PoolClient, QueryConfig } from "pg";
import { version as versaoDoPacote } from "../../package.json";

/** Prazo padrão do `select 1`. O HEALTHCHECK do Dockerfile espera até 4 s pela resposta. */
export const PRAZO_SAUDE_MS = 2_000;

export type PoolConsultavel = { connect(): Promise<PoolClient> };

export async function verificarBanco(
  pool: PoolConsultavel,
  prazoMs: number = PRAZO_SAUDE_MS,
): Promise<boolean> {
  let expirou = false;

  const tentativa = (async () => {
    const cliente = await pool.connect();
    if (expirou) {
      // a conexão chegou depois do prazo: devolve sem usar
      cliente.release();
      return false;
    }
    try {
      // query_timeout: se o servidor não responder, o pg encerra a espera
      await cliente.query({ text: "select 1", query_timeout: prazoMs } as QueryConfig);
      cliente.release();
      return true;
    } catch (erro) {
      cliente.release(erro instanceof Error ? erro : true);
      return false;
    }
  })().catch(() => false);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const limite = new Promise<false>((resolve) => {
    timer = setTimeout(() => {
      expirou = true;
      resolve(false);
    }, prazoMs);
  });

  try {
    return await Promise.race([tentativa, limite]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Versão da aplicação: `SUMMER_VERSAO` (passada no build da imagem, ex.: a tag
 * `v0.1.0` ou o commit) ou, sem ela, o `version` do `package.json`.
 */
export function versaoDaAplicacao(): string {
  return process.env.SUMMER_VERSAO?.trim() || versaoDoPacote;
}
