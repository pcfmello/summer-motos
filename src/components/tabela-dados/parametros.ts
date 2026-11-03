/**
 * Lê busca e paginação dos `searchParams` da página (sempre no servidor).
 * Valores inválidos voltam para o padrão em vez de quebrar a tela.
 */
export type SearchParams = Record<string, string | string[] | undefined>;

export type ParametrosTabela = {
  busca: string;
  pagina: number;
  tamanhoPagina: number;
  /** Para a query: quantas linhas pular. */
  deslocamento: number;
};

type Opcoes = {
  tamanhoPadrao?: number;
  tamanhosPermitidos?: readonly number[];
};

export const TAMANHOS_PAGINA = [10, 20, 50] as const;

function primeiro(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export function lerParametrosTabela(
  searchParams: SearchParams,
  { tamanhoPadrao = 20, tamanhosPermitidos = TAMANHOS_PAGINA }: Opcoes = {},
): ParametrosTabela {
  const busca = (primeiro(searchParams.busca) ?? "").trim().slice(0, 100);

  const paginaTexto = primeiro(searchParams.pagina) ?? "";
  const paginaNumero = /^\d{1,6}$/.test(paginaTexto) ? Number(paginaTexto) : 1;
  const pagina = Math.max(1, paginaNumero);

  const tamanhoTexto = primeiro(searchParams.tamanho) ?? "";
  const tamanhoNumero = /^\d{1,3}$/.test(tamanhoTexto) ? Number(tamanhoTexto) : tamanhoPadrao;
  const tamanhoPagina = tamanhosPermitidos.includes(tamanhoNumero) ? tamanhoNumero : tamanhoPadrao;

  return { busca, pagina, tamanhoPagina, deslocamento: (pagina - 1) * tamanhoPagina };
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
