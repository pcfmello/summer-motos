/**
 * Cursor de paginação por chave (keyset) para as listas com rolagem infinita.
 *
 * Por que em `src/lib` e não junto da tabela: o cursor é montado e lido pelas
 * queries do servidor (`src/server/queries`, server functions) e só trafega
 * como texto opaco pelo componente cliente. `lib` é a camada neutra que os dois
 * lados importam sem o servidor depender de `components/`.
 *
 * Formato: JSON `{ o, v, id }` em base64url, onde
 *   o  = identificador da ordenação (ex.: "descricao"), para recusar cursor de outra ordem;
 *   v  = valor da coluna de ordenação na última linha entregue (texto, número ou null);
 *   id = id da última linha (desempate, garante ordem total e estável).
 *
 * Query no banco (Drizzle), ordem crescente — próxima leva depois de (v, id):
 *
 *   import { and, asc, eq, sql } from "drizzle-orm";
 *   db.select().from(produtos)
 *     .where(and(
 *       eq(produtos.empresaId, ctx.empresaId),
 *       cursor ? sql`(${produtos.descricao}, ${produtos.id}) > (${cursor.v}, ${cursor.id})` : undefined,
 *     ))
 *     .orderBy(asc(produtos.descricao), asc(produtos.id))
 *     .limit(limite + 1); // uma linha a mais só para saber se há próxima leva
 *
 * Ordem decrescente: `(col, id) < ($1, $2)` com `desc(col), desc(id)`.
 * O índice que atende é `(empresa_id, col, id)`. Coluna que aceita NULL precisa
 * de `coalesce` (ou NULLS LAST tratado à parte) nos dois lados da comparação.
 */
import { z } from "zod";

export type ValorChave = string | number | null;

export type CursorKeyset = {
  /** Ordenação a que o cursor pertence. */
  o: string;
  v: ValorChave;
  id: string;
};

/** Resultado de uma leva de linhas, devolvido pela server function de leitura. */
export type ResultadoLeva<L> =
  | { ok: true; linhas: L[]; proximoCursor: string | null }
  | { ok: false; mensagem: string };

export const TAMANHO_MAXIMO_CURSOR = 512;

const MENSAGEM_CURSOR_INVALIDO =
  "Não foi possível continuar a lista. Recarregue a página para começar de novo.";

const esquemaCursor = z
  .object({
    o: z.string().min(1).max(40),
    v: z.union([z.string().max(300), z.number().finite(), z.null()]),
    id: z.string().min(1).max(64),
  })
  .strict();

function paraBase64Url(texto: string): string {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const byte of bytes) binario += String.fromCharCode(byte);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function deBase64Url(texto: string): string {
  if (!/^[A-Za-z0-9_-]+$/.test(texto)) throw new Error("base64url inválido");
  const base64 = texto.replace(/-/g, "+").replace(/_/g, "/");
  const binario = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));
  const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export function codificarCursor(cursor: CursorKeyset): string {
  return paraBase64Url(JSON.stringify(esquemaCursor.parse(cursor)));
}

export type ResultadoCursor =
  | { ok: true; cursor: CursorKeyset }
  | { ok: false; mensagem: string };

/**
 * Lê o cursor vindo do cliente. Nunca lança: texto adulterado, de outra
 * ordenação ou grande demais vira `{ ok: false, mensagem }` amigável.
 */
export function decodificarCursor(texto: unknown, ordenacaoEsperada: string): ResultadoCursor {
  if (typeof texto !== "string" || texto.length === 0 || texto.length > TAMANHO_MAXIMO_CURSOR) {
    return { ok: false, mensagem: MENSAGEM_CURSOR_INVALIDO };
  }
  try {
    const resultado = esquemaCursor.safeParse(JSON.parse(deBase64Url(texto)));
    if (!resultado.success || resultado.data.o !== ordenacaoEsperada) {
      return { ok: false, mensagem: MENSAGEM_CURSOR_INVALIDO };
    }
    return { ok: true, cursor: resultado.data };
  } catch {
    return { ok: false, mensagem: MENSAGEM_CURSOR_INVALIDO };
  }
}

type OpcoesRecorte<T> = {
  ordenacao: string;
  chave: (item: T) => { v: ValorChave; id: string };
  /** Compara só os valores da coluna de ordenação (o desempate por id é automático). */
  comparar: (a: ValorChave, b: ValorChave) => number;
  direcao?: "asc" | "desc";
  cursor: CursorKeyset | null;
  limite: number;
};

/**
 * Recorte keyset em memória: a mesma regra do `where (col, id) > (v, id)`,
 * para dados fictícios e testes. No banco, use a query do comentário acima.
 */
export function recorteKeyset<T>(
  itens: readonly T[],
  { ordenacao, chave, comparar, direcao = "asc", cursor, limite }: OpcoesRecorte<T>,
): { itens: T[]; proximoCursor: CursorKeyset | null } {
  const sinal = direcao === "desc" ? -1 : 1;
  const compararChaves = (a: { v: ValorChave; id: string }, b: { v: ValorChave; id: string }) => {
    const porValor = comparar(a.v, b.v);
    if (porValor !== 0) return sinal * porValor;
    return sinal * (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  };

  const ordenados = [...itens].sort((x, y) => compararChaves(chave(x), chave(y)));
  const depoisDoCursor = cursor
    ? ordenados.filter((item) => compararChaves(chave(item), cursor) > 0)
    : ordenados;
  const pagina = depoisDoCursor.slice(0, limite);
  const ultimo = pagina.at(-1);
  const proximoCursor =
    depoisDoCursor.length > limite && ultimo ? { o: ordenacao, ...chave(ultimo) } : null;
  return { itens: pagina, proximoCursor };
}
