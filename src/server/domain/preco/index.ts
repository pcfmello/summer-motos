/**
 * Preço (regra 4.9): preço sugerido pelo markup, herança do markup da categoria,
 * arredondamento configurável, margem resultante e preço numa tabela de preço.
 */
import { CASAS, Decimal, type ValorDecimal, arredondarAliquota, arredondarDinheiro, paraDecimal } from "../decimal";

/**
 * `empresas.config.arredondamento_preco` (modelo de dados, seção 11.1). Valores em string, como no JSON.
 * - `nenhum`: só arredonda em 2 casas (half-up).
 * - `terminacao`: o preço termina em `centavos` (`"0.90"` → R$ 37,90). `centavos` entre 0,00 e 0,99.
 * - `multiplo`: o preço é múltiplo de `centavos` (`"0.50"`, `"1.00"`). `centavos` > 0.
 * - `direcao`: `cima` (padrão) sobe até o próximo valor válido; `proximo` vai ao mais perto (empate sobe).
 * Um preço positivo nunca é arredondado para zero; preço zero continua zero.
 */
export type ConfigArredondamento =
  | { modo: "nenhum" }
  | { modo: "terminacao" | "multiplo"; centavos: string; direcao?: "cima" | "proximo" };

function lerCentavos(config: Exclude<ConfigArredondamento, { modo: "nenhum" }>): Decimal {
  const centavos = paraDecimal(config.centavos);
  const casasValidas = centavos.decimalPlaces() <= CASAS.dinheiro;
  const faixaValida = config.modo === "terminacao" ? centavos.gte(0) && centavos.lt(1) : centavos.gt(0);
  if (!casasValidas || !faixaValida) {
    throw new Error(`Configuração de arredondamento inválida: ${config.modo} com centavos ${config.centavos}.`);
  }
  return centavos;
}

/** Escolhe entre dois candidatos (abaixo ≤ preço ≤ acima) conforme a direção; nunca devolve ≤ 0. */
function escolher(preco: Decimal, abaixo: Decimal, acima: Decimal, direcao: "cima" | "proximo"): Decimal {
  if (direcao === "cima" || abaixo.lte(0)) return acima;
  return preco.minus(abaixo).lt(acima.minus(preco)) ? abaixo : acima;
}

export function aplicarArredondamento(preco: ValorDecimal, config: ConfigArredondamento): Decimal {
  const p = arredondarDinheiro(preco);
  if (p.lt(0)) throw new Error("O preço não pode ser negativo.");
  if (config.modo === "nenhum") return p;
  const centavos = lerCentavos(config);
  if (p.isZero()) return p;
  const direcao = config.direcao ?? "cima";

  if (config.modo === "terminacao") {
    let abaixo = p.floor().plus(centavos);
    if (abaixo.gt(p)) abaixo = abaixo.minus(1);
    if (abaixo.equals(p)) return p;
    return escolher(p, abaixo, abaixo.plus(1), direcao);
  }

  const multiplos = p.div(centavos);
  if (multiplos.isInteger()) return p;
  return escolher(p, multiplos.floor().mul(centavos), multiplos.ceil().mul(centavos), direcao);
}

export type OrigemMarkup = "produto" | "categoria";

/** Markup do produto; se for nulo, herda o `markup_padrao` da categoria. Zero é markup próprio. */
export function resolverMarkup(
  markupProduto: ValorDecimal | null | undefined,
  markupCategoria: ValorDecimal | null | undefined,
): { markup: Decimal; origem: OrigemMarkup } | null {
  const [valor, origem]: [ValorDecimal | null | undefined, OrigemMarkup] =
    markupProduto != null ? [markupProduto, "produto"] : [markupCategoria, "categoria"];
  if (valor == null) return null;
  const markup = paraDecimal(valor);
  if (markup.lt(0)) throw new Error("O markup não pode ser negativo.");
  return { markup, origem };
}

/**
 * Preço sugerido = último custo × (1 + markup/100), em 2 casas, depois o arredondamento da empresa.
 * Devolve null quando não há markup (nem no produto nem na categoria) ou o último custo é zero.
 */
export function calcularPrecoSugerido(entrada: {
  ultimoCusto: ValorDecimal;
  markupProduto: ValorDecimal | null | undefined;
  markupCategoria: ValorDecimal | null | undefined;
  arredondamento: ConfigArredondamento;
}): { preco: Decimal; markup: Decimal; origemMarkup: OrigemMarkup } | null {
  const custo = paraDecimal(entrada.ultimoCusto);
  if (custo.lt(0)) throw new Error("O último custo não pode ser negativo.");
  const resolvido = resolverMarkup(entrada.markupProduto, entrada.markupCategoria);
  if (!resolvido || custo.isZero()) return null;
  const bruto = custo.mul(resolvido.markup.div(100).plus(1));
  return {
    preco: aplicarArredondamento(arredondarDinheiro(bruto), entrada.arredondamento),
    markup: resolvido.markup,
    origemMarkup: resolvido.origem,
  };
}

/**
 * Margem resultante de um preço:
 * - lucro = preço − custo (2 casas);
 * - margem = lucro ÷ preço × 100 (sobre a venda; null se o preço for zero);
 * - markup = lucro ÷ custo × 100 (sobre o custo; null se o custo for zero).
 * Percentuais em 4 casas, como `numeric(7,4)`.
 */
export function calcularMargem(entrada: { preco: ValorDecimal; custo: ValorDecimal }): {
  lucro: Decimal;
  margemPercentual: Decimal | null;
  markupPercentual: Decimal | null;
} {
  const preco = paraDecimal(entrada.preco);
  const custo = paraDecimal(entrada.custo);
  if (preco.lt(0)) throw new Error("O preço não pode ser negativo.");
  if (custo.lt(0)) throw new Error("O custo não pode ser negativo.");
  const lucro = preco.minus(custo);
  return {
    lucro: arredondarDinheiro(lucro),
    margemPercentual: preco.isZero() ? null : arredondarAliquota(lucro.div(preco).mul(100)),
    markupPercentual: custo.isZero() ? null : arredondarAliquota(lucro.div(custo).mul(100)),
  };
}

export type BaseTabelaPreco = "preco_base" | "ultimo_custo" | "custo_medio";

/**
 * Preço de um produto numa tabela de preço: o preço fixo do item, se houver;
 * senão base × (1 + percentual/100), em 2 casas.
 * Base zero sem preço fixo devolve null ("sem preço"), como em `calcularPrecoSugerido`:
 * um produto sem custo numa tabela sobre o custo não pode ser vendido nem publicado a R$ 0,00.
 * O arredondamento é opcional e nunca é aplicado ao preço fixo.
 */
export function calcularPrecoTabela(entrada: {
  tabela: { base: BaseTabelaPreco; percentual: ValorDecimal };
  precoFixo?: ValorDecimal | null;
  precoBase: ValorDecimal;
  ultimoCusto: ValorDecimal;
  custoMedio: ValorDecimal;
  arredondamento?: ConfigArredondamento;
}): { preco: Decimal; origem: "fixo" | "tabela" } | null {
  if (entrada.precoFixo != null) {
    const fixo = arredondarDinheiro(entrada.precoFixo);
    if (fixo.lt(0)) throw new Error("O preço fixo não pode ser negativo.");
    return { preco: fixo, origem: "fixo" };
  }
  const percentual = paraDecimal(entrada.tabela.percentual);
  if (percentual.lte(-100)) throw new Error("O percentual da tabela deve ser maior que −100%.");
  const valoresBase: Record<BaseTabelaPreco, ValorDecimal> = {
    preco_base: entrada.precoBase,
    ultimo_custo: entrada.ultimoCusto,
    custo_medio: entrada.custoMedio,
  };
  const base = paraDecimal(valoresBase[entrada.tabela.base]);
  if (base.lt(0)) throw new Error("A base da tabela de preço não pode ser negativa.");
  if (base.isZero()) return null;
  const preco = arredondarDinheiro(base.mul(percentual.div(100).plus(1)));
  return { preco: entrada.arredondamento ? aplicarArredondamento(preco, entrada.arredondamento) : preco, origem: "tabela" };
}
