/**
 * Lê busca e ordenação dos `searchParams` da página (sempre no servidor).
 * Valores inválidos voltam para o padrão em vez de quebrar a tela.
 * A paginação não vai na URL: as listas usam rolagem infinita com cursor keyset
 * (ver `src/lib/cursor.ts`).
 */
export type SearchParams = Record<string, string | string[] | undefined>;

export type ParametrosLista<O extends string> = {
  busca: string;
  ordem: O;
};

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerParametrosLista<O extends string>(
  searchParams: SearchParams,
  { ordens, ordemPadrao }: { ordens: readonly O[]; ordemPadrao: O },
): ParametrosLista<O> {
  const busca = (primeiro(searchParams.busca) ?? "").trim().slice(0, 100);
  const ordemTexto = primeiro(searchParams.ordem);
  const ordem = ordens.find((o) => o === ordemTexto) ?? ordemPadrao;
  return { busca, ordem };
}

/** Chave para o `key` da lista: muda quando busca ou filtros mudam, e a lista recomeça. */
export function chaveDaLista(parametros: Record<string, string>): string {
  return Object.entries(parametros)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
}

/** Monta "?a=1&b=2" a partir dos parâmetros atuais, trocando/removendo alguns. */
export function hrefComParametros(
  atuais: SearchParams,
  alteracoes: Record<string, string | number | null>,
): string {
  const params = new URLSearchParams();
  for (const [chave, valor] of Object.entries(atuais)) {
    if (valor === undefined) continue;
    for (const item of Array.isArray(valor) ? valor : [valor]) params.append(chave, item);
  }
  for (const [chave, valor] of Object.entries(alteracoes)) {
    if (valor === null || valor === "") params.delete(chave);
    else params.set(chave, String(valor));
  }
  const texto = params.toString();
  return texto ? `?${texto}` : "?";
}
