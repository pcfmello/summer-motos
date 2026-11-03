/**
 * Custo (regras 4.5 e 4.6): custo médio ponderado, custo de entrada por unidade de estoque,
 * conversão de unidade e rateio do frete da entrada manual.
 */
import {
  type Decimal,
  type ValorDecimal,
  arredondarCusto,
  arredondarDinheiro,
  arredondarQuantidade,
  paraDecimal,
} from "../decimal";
import { ratearProporcional } from "../rateio";

const naoNegativo = (valor: Decimal) => !valor.isNegative() || valor.isZero();

function exigirNaoNegativo(valor: ValorDecimal, nome: string): Decimal {
  const d = paraDecimal(valor);
  if (!naoNegativo(d)) throw new Error(`${nome} não pode ser negativo.`);
  return d;
}

function exigirPositivo(valor: ValorDecimal, nome: string): Decimal {
  const d = paraDecimal(valor);
  if (d.lte(0)) throw new Error(`${nome} deve ser maior que zero.`);
  return d;
}

/**
 * Novo custo médio após uma entrada, em 6 casas:
 * `(saldo × médio + qtd × custo) ÷ (saldo + qtd)`; com saldo ≤ 0 antes da entrada, vale o custo da entrada.
 */
export function calcularCustoMedio(entrada: {
  saldoAntes: ValorDecimal;
  custoMedioAtual: ValorDecimal;
  quantidadeEntrada: ValorDecimal;
  custoEntrada: ValorDecimal;
}): Decimal {
  const saldo = paraDecimal(entrada.saldoAntes);
  const medio = exigirNaoNegativo(entrada.custoMedioAtual, "O custo médio atual");
  const quantidade = exigirPositivo(entrada.quantidadeEntrada, "A quantidade da entrada");
  const custo = exigirNaoNegativo(entrada.custoEntrada, "O custo da entrada");
  if (saldo.lte(0)) return arredondarCusto(custo);
  return arredondarCusto(saldo.mul(medio).plus(quantidade.mul(custo)).div(saldo.plus(quantidade)));
}

/** Converte a quantidade comprada para a unidade de estoque (ex.: 2 CX × 10 = 20 UN), em 4 casas. */
export function converterParaUnidadeEstoque(quantidade: ValorDecimal, fator: ValorDecimal): Decimal {
  const q = exigirPositivo(quantidade, "A quantidade");
  const f = exigirPositivo(fator, "O fator de conversão");
  return arredondarQuantidade(q.mul(f));
}

export interface ComponentesCustoEntrada {
  /** Valor total do item na nota (vProd). */
  valorItem: ValorDecimal;
  ipi?: ValorDecimal;
  st?: ValorDecimal;
  frete?: ValorDecimal;
  seguro?: ValorDecimal;
  outrasDespesas?: ValorDecimal;
  desconto?: ValorDecimal;
  /** Quantidade na unidade de compra. */
  quantidade: ValorDecimal;
  /** Unidades de estoque por unidade de compra. Padrão 1. */
  fator?: ValorDecimal;
}

/**
 * Custo por unidade de estoque = (valor + IPI + ST + frete + seguro + outras − descontos) ÷ quantidade convertida.
 * Créditos de imposto do regime normal ficam de fora (regra 4.5: validar com o contador).
 */
export function calcularCustoEntradaUnitario(item: ComponentesCustoEntrada): {
  quantidadeEstoque: Decimal;
  custoTotal: Decimal;
  custoUnitario: Decimal;
} {
  const quantidadeEstoque = converterParaUnidadeEstoque(item.quantidade, item.fator ?? "1");
  const custoTotal = exigirNaoNegativo(item.valorItem, "O valor do item")
    .plus(exigirNaoNegativo(item.ipi ?? "0", "O IPI"))
    .plus(exigirNaoNegativo(item.st ?? "0", "A ST"))
    .plus(exigirNaoNegativo(item.frete ?? "0", "O frete"))
    .plus(exigirNaoNegativo(item.seguro ?? "0", "O seguro"))
    .plus(exigirNaoNegativo(item.outrasDespesas ?? "0", "As outras despesas"))
    .minus(exigirNaoNegativo(item.desconto ?? "0", "O desconto"));
  if (!naoNegativo(custoTotal)) throw new Error("O custo do item ficou negativo: o desconto é maior que o valor.");
  return { quantidadeEstoque, custoTotal, custoUnitario: arredondarCusto(custoTotal.div(quantidadeEstoque)) };
}

/** Rateia o frete total da entrada pelo valor dos itens (mesma regra do rateio de desconto). */
export function ratearFrete(freteTotal: ValorDecimal, valoresItens: readonly ValorDecimal[]): Decimal[] {
  return ratearProporcional(freteTotal, valoresItens);
}

export interface ItemEntradaManual {
  quantidade: ValorDecimal;
  fator?: ValorDecimal;
  /** Custo por unidade de compra, informado pelo usuário. */
  custoUnitario: ValorDecimal;
}

/**
 * Entrada manual (regra 4.5): custo unitário informado e frete total opcional, rateado pelo valor dos itens.
 * O custo por unidade de estoque é calculado sem arredondar o valor do item antes, para não perder precisão.
 */
export function calcularCustoEntradaManual(entrada: { itens: readonly ItemEntradaManual[]; freteTotal?: ValorDecimal }): {
  itens: {
    quantidadeEstoque: Decimal;
    /** quantidade × custo unitário, em 2 casas (exibição e gravação). */
    valorItem: Decimal;
    freteRateado: Decimal;
    custoUnitarioEstoque: Decimal;
  }[];
} {
  const base = entrada.itens.map((item) => {
    const quantidadeEstoque = converterParaUnidadeEstoque(item.quantidade, item.fator ?? "1");
    const valorExato = paraDecimal(item.quantidade).mul(exigirNaoNegativo(item.custoUnitario, "O custo unitário"));
    return { quantidadeEstoque, valorExato };
  });
  const fretes = ratearFrete(
    entrada.freteTotal ?? "0",
    base.map((b) => b.valorExato),
  );
  return {
    itens: base.map((b, i) => ({
      quantidadeEstoque: b.quantidadeEstoque,
      valorItem: arredondarDinheiro(b.valorExato),
      freteRateado: fretes[i],
      custoUnitarioEstoque: arredondarCusto(b.valorExato.plus(fretes[i]).div(b.quantidadeEstoque)),
    })),
  };
}
