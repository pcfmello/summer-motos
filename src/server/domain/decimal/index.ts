import { Decimal as DecimalBase } from "decimal.js";

/**
 * `Decimal` do SUMMER: 40 dígitos significativos e ROUND_HALF_UP.
 * No decimal.js, ROUND_HALF_UP arredonda o empate para longe do zero (−1,005 → −1,01).
 * Use sempre este construtor, nunca o `decimal.js` direto, para dinheiro, quantidade e custo.
 */
export const Decimal = DecimalBase.clone({
  precision: 40,
  rounding: DecimalBase.ROUND_HALF_UP,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Decimal = DecimalBase;

/** Valor aceito pelas funções do domínio: a string que o Drizzle devolve para `numeric` ou um `Decimal`. */
export type ValorDecimal = string | DecimalBase;

/** Casas decimais de cada tipo, iguais às colunas `numeric` do banco (seção 1.2 do modelo de dados). */
export const CASAS = {
  dinheiro: 2,
  quantidade: 4,
  custo: 6,
  aliquota: 4,
} as const;
export type TipoNumerico = keyof typeof CASAS;

const FORMATO_NUMERIC = /^[+-]?\d+(\.\d+)?$/;

/**
 * Converte a string de um `numeric` (ex.: `"123.4500"`) ou um `Decimal` em `Decimal`.
 * Rejeita vírgula, notação científica, hexadecimal, NaN e infinito: texto digitado
 * pelo usuário em pt-BR é convertido antes, na camada de formatação.
 */
export function paraDecimal(valor: ValorDecimal): Decimal {
  if (DecimalBase.isDecimal(valor)) {
    if (!valor.isFinite()) throw new Error(`Valor decimal inválido: ${valor.toString()}`);
    return new Decimal(valor);
  }
  const texto = typeof valor === "string" ? valor.trim() : "";
  if (!FORMATO_NUMERIC.test(texto)) throw new Error(`Valor decimal inválido: ${JSON.stringify(valor)}`);
  return new Decimal(texto);
}

function arredondar(valor: ValorDecimal, casas: number): Decimal {
  return paraDecimal(valor).toDecimalPlaces(casas, Decimal.ROUND_HALF_UP);
}

export const arredondarDinheiro = (valor: ValorDecimal) => arredondar(valor, CASAS.dinheiro);
export const arredondarQuantidade = (valor: ValorDecimal) => arredondar(valor, CASAS.quantidade);
export const arredondarCusto = (valor: ValorDecimal) => arredondar(valor, CASAS.custo);
export const arredondarAliquota = (valor: ValorDecimal) => arredondar(valor, CASAS.aliquota);

/**
 * Converte para a string gravada numa coluna `numeric`, já arredondada nas casas do tipo
 * (ex.: `paraNumeric("10", "dinheiro") === "10.00"`). Zero negativo vira zero.
 */
export function paraNumeric(valor: ValorDecimal, tipo: TipoNumerico): string {
  const arredondado = arredondar(valor, CASAS[tipo]);
  return (arredondado.isZero() ? new Decimal(0) : arredondado).toFixed(CASAS[tipo]);
}

/** Soma sem perda de precisão. Lista vazia soma zero. */
export function somar(valores: readonly ValorDecimal[]): Decimal {
  return valores.reduce<Decimal>((total, v) => total.plus(paraDecimal(v)), new Decimal(0));
}
