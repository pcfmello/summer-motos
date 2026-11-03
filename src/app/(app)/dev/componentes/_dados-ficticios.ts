/**
 * 50 produtos fictícios para a vitrine de componentes. Simula a query do
 * servidor (busca + paginação); nada disso vai para produção.
 */
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

export const PRODUTOS_FICTICIOS: ProdutoFicticio[] = Array.from({ length: 50 }, (_, i) => {
  const [descricao, marca, unidade, preco] = BASE[i % BASE.length]!;
  const variante = i >= BASE.length ? " (linha econômica)" : "";
  const quantidade = unidade === "LT" ? ["0", "1.5", "3", "4.5", "6", "7.5", "9"][i % 7]! : String((i * 7) % 23);
  return {
    id: `p${i + 1}`,
    codigo: String(i + 1).padStart(6, "0"),
    descricao: descricao + variante,
    marca,
    referencia: `${marca.slice(0, 3).toUpperCase()}-${1000 + i * 37}`,
    unidade,
    preco: i >= BASE.length ? (Number(preco) * 0.8).toFixed(2) : preco,
    quantidade,
    minimo: "5",
  };
});

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

export async function consultarProdutosFicticios({
  busca,
  deslocamento,
  tamanhoPagina,
}: {
  busca: string;
  deslocamento: number;
  tamanhoPagina: number;
}) {
  // Simula a latência do banco para dar para ver o estado "carregando"
  await new Promise((resolve) => setTimeout(resolve, 250));
  const termo = normalizar(busca);
  const filtrados = termo
    ? PRODUTOS_FICTICIOS.filter((p) =>
        [p.codigo, p.descricao, p.marca, p.referencia].some((campo) => normalizar(campo).includes(termo)),
      )
    : PRODUTOS_FICTICIOS;
  return {
    linhas: filtrados.slice(deslocamento, deslocamento + tamanhoPagina),
    total: filtrados.length,
  };
}
