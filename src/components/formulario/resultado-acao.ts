/**
 * Formato de retorno das server actions de formulário.
 *
 * - `erros` usa os nomes dos campos do schema Zod (o mesmo do formulário),
 *   para o erro do servidor aparecer no campo certo. Use `errosDoZod` na action.
 * - `mensagem` é o erro geral, em pt-BR e dizendo o que fazer.
 *
 * Pendência: mover para `src/server/actions/` quando o backend criar a base
 * das actions; este arquivo passa a só reexportar.
 */
import type { z } from "zod";

export type ErrosCampos = Partial<Record<string, string[]>>;

export type ResultadoAcao<T = undefined> =
  | { ok: true; dados: T; mensagem?: string }
  | { ok: false; mensagem?: string; erros?: ErrosCampos };

/** Converte o erro do `safeParse` em erros por campo (caminho "itens.0.preco"). */
export function errosDoZod(erro: z.ZodError): ErrosCampos {
  const erros: Record<string, string[]> = {};
  for (const issue of erro.issues) {
    const caminho = issue.path.map(String).join(".") || "_geral";
    (erros[caminho] ??= []).push(issue.message);
  }
  return erros;
}
