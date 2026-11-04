/**
 * Limite de tentativas da página `/convite/[token]` e das actions de aceite
 * (D033): por IP, com o mesmo armazenamento em memória do limite do Better
 * Auth (`./limites.ts`) e o mesmo IP que ele resolve (`getIP`, com
 * `BETTER_AUTH_TRUSTED_PROXIES`).
 *
 * O token tem 256 bits: adivinhar é inviável. O limite é defesa extra contra
 * varredura e contra repetição de criação de conta. Mesma ressalva do
 * `./limites.ts`: em memória no processo; com mais de uma réplica, cada uma
 * conta à parte. IP indeterminado (configuração errada) não é contado.
 */
import "server-only";

import { getIP } from "better-auth/api";
import { headers } from "next/headers";

import { auth } from "./auth";
import { criarArmazenamentoLimite } from "./limites";

export const CONVITE_JANELA_SEGUNDOS = 15 * 60;
export const CONVITE_MAXIMO_TENTATIVAS = 30;

const armazenamento = criarArmazenamentoLimite();

/** `true` se esta requisição pode seguir; cada chamada conta uma tentativa. */
export async function consumirLimiteConvite(): Promise<boolean> {
  const ip = getIP(await headers(), auth.options);
  if (!ip) return true;
  const resultado = await armazenamento.consume(`${ip}|/convite`, {
    window: CONVITE_JANELA_SEGUNDOS,
    max: CONVITE_MAXIMO_TENTATIVAS,
  });
  return resultado.allowed;
}

/** IP (o mesmo que o limite usa) e user-agent da requisição, para a auditoria do aceite. */
export async function origemDaRequisicao(): Promise<{ ip: string | null; userAgent: string | null }> {
  const cabecalhos = await headers();
  return { ip: getIP(cabecalhos, auth.options), userAgent: cabecalhos.get("user-agent") };
}

export const MENSAGEM_LIMITE_CONVITE = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
