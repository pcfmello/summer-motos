"use server";

import { errosDoZod, type ResultadoAcao } from "@/components/formulario/resultado-acao";

import { esquemaProdutoExemplo } from "./esquema-exemplo";

/**
 * Server action fictícia da vitrine: valida com o mesmo schema do formulário e
 * simula um erro de unicidade vindo do banco (código 000001 já existe).
 */
export async function salvarProdutoExemplo(
  dados: unknown,
): Promise<ResultadoAcao<{ codigo: string }>> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, mensagem: "Indisponível em produção." };
  }
  const resultado = esquemaProdutoExemplo.safeParse(dados);
  if (!resultado.success) {
    return { ok: false, erros: errosDoZod(resultado.error) };
  }
  await new Promise((resolve) => setTimeout(resolve, 600));
  if (resultado.data.codigo === "000001") {
    return {
      ok: false,
      erros: { codigo: ["Já existe um produto com o código 000001. Use outro código ou deixe em branco para gerar."] },
    };
  }
  return { ok: true, dados: { codigo: resultado.data.codigo || "000051" } };
}
