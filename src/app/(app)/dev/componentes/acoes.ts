"use server";

import { z } from "zod";

import { errosDoZod, type ResultadoAcao } from "@/components/formulario/resultado-acao";
import { decodificarCursor, type ResultadoLeva } from "@/lib/cursor";

import {
  consultarProdutosFicticios,
  ORDENS,
  type ProdutoFicticio,
} from "./_dados-ficticios";

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

const esquemaFiltrosProdutos = z.object({
  busca: z.string().max(100),
  ordem: z.enum(ORDENS),
});

/**
 * Server function de LEITURA da rolagem infinita: devolve a próxima leva.
 *
 * - Os filtros chegam fixados pelo servidor (closure na página) e são
 *   revalidados aqui; do cliente só vem o cursor, decodificado e validado.
 * - Quando o banco existir, a versão real faz como a query da página:
 *   `const ctx = await getContext()` e filtra por `ctx.empresaId` e pelo perfil
 *   (sem custo/margem para balcão e mecânico). Nunca recebe empresa do cliente.
 * - Erros viram `{ ok: false, mensagem }`; nada de exceção solta para a tela.
 */
export async function carregarMaisProdutosFicticios(
  filtros: unknown,
  cursorTexto: unknown,
): Promise<ResultadoLeva<ProdutoFicticio>> {
  if (process.env.NODE_ENV === "production") {
    return { ok: false, mensagem: "Indisponível em produção." };
  }
  const validados = esquemaFiltrosProdutos.safeParse(filtros);
  if (!validados.success) {
    return { ok: false, mensagem: "Filtros inválidos. Recarregue a página." };
  }
  const cursor = decodificarCursor(cursorTexto, validados.data.ordem);
  if (!cursor.ok) return { ok: false, mensagem: cursor.mensagem };

  const { linhas, proximoCursor } = await consultarProdutosFicticios({
    ...validados.data,
    cursor: cursor.cursor,
  });
  return { ok: true, linhas, proximoCursor };
}
