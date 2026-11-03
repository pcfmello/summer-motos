/**
 * 500 produtos fictícios para a vitrine de componentes. Simula a query do
 * servidor (busca, ordenação e cursor keyset); nada disso vai para produção.
 */
import Decimal from "decimal.js";

import {
  codificarCursor,
  recorteKeyset,
  type CursorKeyset,
  type ValorChave,
} from "@/lib/cursor";
export type ProdutoFicticio = {
  id: string;
  codigo: string;
  descricao: string;
  marca: string;
  referencia: string;
  unidade: string;
  preco: string;
  quantidade: string;
  minimo: string;
};

const BASE: Array<[string, string, string, string]> = [
  ["Pastilha de freio dianteira CG 160", "Cobreq", "UN", "38.90"],
  ["Kit relação CG 160 (coroa, pinhão e corrente)", "Vaz", "KIT", "189.90"],
  ["Vela de ignição CPR8EA-9", "NGK", "UN", "32.50"],
  ["Óleo 4T 10W-30 semissintético", "Mobil", "LT", "36.90"],
  ["Câmara de ar aro 18", "Pirelli", "UN", "42.00"],
  ["Pneu traseiro 90/90-18", "Pirelli", "UN", "289.00"],
  ["Cabo de embreagem Biz 125", "Controlflex", "UN", "24.90"],
  ["Lâmpada farol H4 35/35W", "Philips", "UN", "19.90"],
  ["Filtro de óleo Fazer 250", "Fram", "UN", "29.90"],
  ["Amortecedor traseiro Bros 160", "Cofap", "PAR", "349.00"],
  ["Retentor de bengala XRE 300", "Sabó", "PAR", "54.90"],
  ["Disco de freio dianteiro CB 300F", "Fras-le", "UN", "219.00"],
  ["Bateria 12V 5Ah selada", "Moura", "UN", "199.90"],
  ["Capacete fechado tamanho 58", "Pro Tork", "UN", "259.90"],
  ["Luva de couro tamanho M", "X11", "PAR", "89.90"],
  ["Fluido de freio DOT 4 200 ml", "Bosch", "UN", "22.90"],
  ["Corrente 428H com 118 elos", "Riffel", "UN", "79.90"],
  ["Junta do cabeçote Titan 150", "Vedamotors", "UN", "18.50"],
  ["Lubrificante de corrente spray", "Motul", "UN", "45.00"],
  ["Retrovisor esquerdo Factor 150", "GVS", "UN", "34.90"],
  ["Manete de freio PCX", "Magnetron", "UN", "48.00"],
  ["Rolamento de roda 6301", "SKF", "UN", "21.90"],
  ["Bico injetor NMax 160", "Magneti Marelli", "UN", "189.00"],
  ["Sapata de freio traseira Pop 110", "Cobreq", "JG", "27.90"],
  ["Óleo de suspensão 20W 500 ml", "Motul", "ML", "500"],
];

const VARIANTES = [
  "",
  " (linha econômica)",
  " (reforçada)",
  " (original)",
  " (paralela)",
  " (importada)",
  " (kit com 2)",
  " (premium)",
  " (cromada)",
  " (preta)",
  " (competição)",
  " (estrada)",
  " (off-road)",
  " (urbana)",
  " (série especial)",
  " (reposição)",
  " (alto desempenho)",
  " (silenciosa)",
  " (longa duração)",
  " (econômica plus)",
];
const FATORES = ["1", "0.8", "1.15", "1.3", "0.9"];
const QTD_LITROS = ["0", "1.5", "3", "4.5", "6", "7.5", "9"];

export const PRODUTOS_FICTICIOS: ProdutoFicticio[] = Array.from({ length: 500 }, (_, i) => {
  const [descricao, marca, unidade, preco] = BASE[i % BASE.length]!;
  const variante = VARIANTES[Math.floor(i / BASE.length) % VARIANTES.length]!;
  const quantidade = unidade === "LT" ? QTD_LITROS[i % QTD_LITROS.length]! : String((i * 7) % 23);
  return {
    id: `p${String(i + 1).padStart(4, "0")}`,
    codigo: String(i + 1).padStart(6, "0"),
    descricao: descricao + variante,
    marca,
    referencia: `${marca.slice(0, 3).toUpperCase()}-${1000 + i * 37}`,
    unidade,
    preco: new Decimal(preco).times(FATORES[i % FATORES.length]!).toFixed(2),
    quantidade,
    minimo: "5",
  };
});

export const ORDENS = ["descricao", "codigo", "preco"] as const;
export type Ordem = (typeof ORDENS)[number];

export const OPCOES_ORDEM: { valor: Ordem; rotulo: string }[] = [
  { valor: "descricao", rotulo: "Descrição (A–Z)" },
  { valor: "codigo", rotulo: "Código" },
  { valor: "preco", rotulo: "Maior preço" },
];

export const TAMANHO_LEVA = 50;

const colador = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

/** Como cada ordenação compara (no banco: ORDER BY coluna, id). */
const CONFIG_ORDEM: Record<
  Ordem,
  {
    chave: (p: ProdutoFicticio) => { v: ValorChave; id: string };
    comparar: (a: ValorChave, b: ValorChave) => number;
    direcao: "asc" | "desc";
  }
> = {
  descricao: {
    chave: (p) => ({ v: p.descricao, id: p.id }),
    comparar: (a, b) => colador.compare(String(a), String(b)),
    direcao: "asc",
  },
  codigo: {
    chave: (p) => ({ v: p.codigo, id: p.id }),
    comparar: (a, b) => (String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0),
    direcao: "asc",
  },
  preco: {
    chave: (p) => ({ v: p.preco, id: p.id }),
    comparar: (a, b) => new Decimal(String(a)).comparedTo(String(b)),
    direcao: "desc",
  },
};

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export function filtrarProdutosFicticios(itens: readonly ProdutoFicticio[], busca: string) {
  const termo = normalizar(busca);
  if (!termo) return [...itens];
  return itens.filter((p) =>
    [p.codigo, p.descricao, p.marca, p.referencia].some((campo) => normalizar(campo).includes(termo)),
  );
}

/** Uma leva keyset sobre `itens` (puro; usado pela página, pela server function e pelos testes). */
export function levaDeProdutos(
  itens: readonly ProdutoFicticio[],
  { busca, ordem, cursor, limite = TAMANHO_LEVA }: { busca: string; ordem: Ordem; cursor: CursorKeyset | null; limite?: number },
) {
  const filtrados = filtrarProdutosFicticios(itens, busca);
  const { itens: linhas, proximoCursor } = recorteKeyset(filtrados, {
    ordenacao: ordem,
    ...CONFIG_ORDEM[ordem],
    cursor,
    limite,
  });
  return {
    linhas,
    total: filtrados.length,
    proximoCursor: proximoCursor ? codificarCursor(proximoCursor) : null,
  };
}

/** Simula a query do servidor, com latência para dar para ver o "carregando". */
export async function consultarProdutosFicticios(filtros: {
  busca: string;
  ordem: Ordem;
  cursor: CursorKeyset | null;
}) {
  await new Promise((resolve) => setTimeout(resolve, 400));
  return levaDeProdutos(PRODUTOS_FICTICIOS, filtros);
}
