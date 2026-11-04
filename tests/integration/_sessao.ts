/**
 * Sessões do Better Auth criadas direto no banco, para testar `getContext()` e
 * as actions sem o fluxo HTTP de login.
 *
 * O cookie é assinado como o Better Auth assina (better-call: HMAC-SHA256 do
 * token com `BETTER_AUTH_SECRET`, em base64, `token.assinatura`), então o
 * `auth.api.getSession` real valida o cookie e lê a sessão em `sessoes`. Só o
 * `headers()` do Next é simulado no teste.
 */
import { createHmac, randomBytes } from "node:crypto";

import type { Banco } from "../../src/server/db/conexao";
import { sessoes } from "../../src/server/db/schema";
import { PREFIXO_COOKIE } from "../../src/lib/rotas-auth";

/** Nome do cookie em HTTP (o `BETTER_AUTH_URL` local é http, sem `__Secure-`). */
export const NOME_COOKIE_SESSAO = `${PREFIXO_COOKIE}.session_token`;

export function assinarToken(token: string, segredo = process.env.BETTER_AUTH_SECRET!): string {
  const assinatura = createHmac("sha256", segredo).update(token).digest("base64");
  return encodeURIComponent(`${token}.${assinatura}`);
}

export async function criarSessao(
  db: Banco,
  usuarioId: string,
  opcoes: { empresaAtivaId?: string | null; expiraEm?: Date } = {},
) {
  const token = randomBytes(24).toString("base64url");
  const [sessao] = await db
    .insert(sessoes)
    .values({
      token,
      userId: usuarioId,
      expiresAt: opcoes.expiraEm ?? new Date(Date.now() + 24 * 60 * 60 * 1000),
      empresaAtivaId: opcoes.empresaAtivaId ?? null,
    })
    .returning();
  return { sessao, cookie: `${NOME_COOKIE_SESSAO}=${assinarToken(token)}` };
}
