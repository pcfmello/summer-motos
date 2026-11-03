/**
 * GET /api/health: healthcheck do app, usado pelo HEALTHCHECK do Dockerfile e,
 * por ele, pelo Coolify (docs/deploy.md, seção 6).
 *
 * - 200 `{ status: "ok", banco: "ok", versao }` quando o `select 1` responde no prazo;
 * - 503 `{ status: "erro", banco: "indisponivel", versao }` caso contrário.
 *
 * Não expõe mensagem de erro, URL, variáveis nem versões de dependências.
 * Pública (sem sessão): o proxy de autenticação não pode exigir login aqui.
 */
import { connection } from "next/server";
import { pool } from "@/server/db";
import { verificarBanco, versaoDaAplicacao } from "@/server/saude";

export async function GET(): Promise<Response> {
  // Com cacheComponents, um GET sem dados de requisição seria pré-renderizado no
  // build. connection() garante que a rota roda a cada requisição.
  await connection();

  const bancoOk = await verificarBanco(pool);
  return Response.json(
    {
      status: bancoOk ? "ok" : "erro",
      banco: bancoOk ? "ok" : "indisponivel",
      versao: versaoDaAplicacao(),
    },
    {
      status: bancoOk ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
