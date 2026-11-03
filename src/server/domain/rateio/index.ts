/**
 * Totais e rateio (regra 4.10): total do item com half-up em 2 casas e desconto do documento
 * rateado proporcionalmente ao valor dos itens, com a diferença de centavos no item de maior valor.
 * Vale para orçamento, venda e OS. O mesmo rateio serve para o frete da entrada (regra 4.5).
 */
import { CASAS, Decimal, type ValorDecimal, arredondarDinheiro, paraDecimal, somar } from "../decimal";

/**
 * Distribui `total` proporcionalmente aos `pesos`, arredondando cada parte em `casas`.
 * A diferença de arredondamento vai para o item de maior peso (empate: o primeiro na ordem).
 * Se o item não comportar a diferença (parte negativa ou acima do `limite`), o excesso passa
 * para o próximo maior peso. Isso só acontece em casos de centavos (ex.: 0,03 em 5 itens iguais).
 * Por isso o maior item pode acabar com MENOS desconto que os outros (0,03 em [1,01; 1,00 ×4] →
 * [0; 0; 0,01; 0,01; 0,01]): cada parte fica entre zero e o valor do item e a soma fecha exata,
 * o que a nota exige; a proporcionalidade cede só no centavo.
 */
function distribuir(total: Decimal, pesos: Decimal[], casas: number, limites?: Decimal[]): Decimal[] {
  const somaPesos = somar(pesos);
  const partes = pesos.map((p) => total.mul(p).div(somaPesos).toDecimalPlaces(casas, Decimal.ROUND_HALF_UP));
  let diferenca = total.minus(somar(partes));
  if (diferenca.isZero()) return partes;

  // maior peso primeiro; empate fica com quem vem antes (sort estável)
  const ordem = pesos.map((_, i) => i).sort((a, b) => pesos[b].comparedTo(pesos[a]));
  for (const i of ordem) {
    const minimo = partes[i].neg(); // a parte não pode ficar negativa
    const maximo = limites ? limites[i].minus(partes[i]) : diferenca; // nem passar do limite do item
    const ajuste = Decimal.max(minimo, Decimal.min(maximo, diferenca));
    partes[i] = partes[i].plus(ajuste);
    diferenca = diferenca.minus(ajuste);
    if (diferenca.isZero()) break;
  }
  // inalcançável quando total ≤ soma dos limites; protege contra uso indevido
  if (!diferenca.isZero()) throw new Error("Não foi possível fechar o rateio nos centavos.");
  return partes;
}

/**
 * Rateia `total` pelos `pesos` (ex.: frete pelo valor dos itens). A soma fecha exatamente com `total`
 * arredondado em `casas`. O total pode ser maior que a soma dos pesos.
 */
export function ratearProporcional(total: ValorDecimal, pesos: readonly ValorDecimal[], casas: number = CASAS.dinheiro): Decimal[] {
  const valor = paraDecimal(total).toDecimalPlaces(casas, Decimal.ROUND_HALF_UP);
  const p = pesos.map(paraDecimal);
  if (valor.isNegative() && !valor.isZero()) throw new Error("O valor a ratear não pode ser negativo.");
  if (p.some((x) => x.isNegative() && !x.isZero())) throw new Error("O valor de um item não pode ser negativo.");
  if (valor.isZero()) return p.map(() => new Decimal(0));
  if (p.length === 0) throw new Error("Rateio sem itens: não há onde distribuir o valor.");
  if (somar(p).isZero()) throw new Error("Todos os itens têm valor zero; não há como ratear proporcionalmente.");
  return distribuir(valor, p, casas);
}

/**
 * Rateia o desconto do documento entre os itens, proporcional ao valor de cada um (regra 4.10).
 * Nenhum item recebe desconto maior que o próprio valor; desconto maior que o total é erro.
 */
export function ratearDesconto(desconto: ValorDecimal, valoresItens: readonly ValorDecimal[]): Decimal[] {
  const d = arredondarDinheiro(desconto);
  const valores = valoresItens.map(paraDecimal);
  if (d.isNegative() && !d.isZero()) throw new Error("O desconto não pode ser negativo.");
  if (valores.some((v) => v.isNegative() && !v.isZero())) throw new Error("O valor de um item não pode ser negativo.");
  if (d.gt(somar(valores))) throw new Error("O desconto é maior que o total do documento.");
  if (d.isZero()) return valores.map(() => new Decimal(0));
  return distribuir(d, valores, CASAS.dinheiro, valores);
}

export interface ItemDocumento {
  quantidade: ValorDecimal;
  precoUnitario: ValorDecimal;
  /** Desconto do próprio item, em reais. */
  desconto?: ValorDecimal;
}

export interface TotalItem {
  /** quantidade × preço unitário, half-up em 2 casas. */
  bruto: Decimal;
  desconto: Decimal;
  /** bruto − desconto do item. */
  total: Decimal;
}

export function calcularTotalItem(item: ItemDocumento): TotalItem {
  const quantidade = paraDecimal(item.quantidade);
  const preco = paraDecimal(item.precoUnitario);
  if (quantidade.lte(0)) throw new Error("Quantidade do item deve ser maior que zero.");
  if (preco.isNegative() && !preco.isZero()) throw new Error("Preço unitário não pode ser negativo.");
  // NF-e: vProd = qCom × vUnCom com os valores gravados; casas além das colunas fariam o total divergir
  if (quantidade.decimalPlaces() > CASAS.quantidade) {
    throw new Error(`A quantidade do item aceita no máximo ${CASAS.quantidade} casas decimais.`);
  }
  if (preco.decimalPlaces() > CASAS.dinheiro) {
    throw new Error(`O preço unitário aceita no máximo ${CASAS.dinheiro} casas decimais.`);
  }
  const bruto = arredondarDinheiro(quantidade.mul(preco));
  const desconto = arredondarDinheiro(item.desconto ?? "0");
  if (desconto.lt(0) || desconto.gt(bruto)) {
    throw new Error("O desconto do item deve estar entre zero e o valor do item.");
  }
  return { bruto, desconto, total: bruto.minus(desconto) };
}

export interface ItemCalculado extends TotalItem {
  /** Parte do desconto do documento que coube ao item. */
  descontoRateado: Decimal;
  /** total − desconto rateado: o valor do item na nota. */
  totalLiquido: Decimal;
}

export interface TotaisDocumento {
  itens: ItemCalculado[];
  totalBruto: Decimal;
  totalDescontoItens: Decimal;
  /** Soma dos totais dos itens, antes do desconto do documento. */
  subtotal: Decimal;
  descontoDocumento: Decimal;
  total: Decimal;
}

/** Totais de orçamento, venda ou OS: desconto por item e desconto do documento rateado. */
export function calcularTotaisDocumento(entrada: {
  itens: readonly ItemDocumento[];
  descontoDocumento?: ValorDecimal;
}): TotaisDocumento {
  const totais = entrada.itens.map(calcularTotalItem);
  const descontoDocumento = arredondarDinheiro(entrada.descontoDocumento ?? "0");
  const rateado = ratearDesconto(
    descontoDocumento,
    totais.map((t) => t.total),
  );
  const itens = totais.map((t, i) => ({
    ...t,
    descontoRateado: rateado[i],
    totalLiquido: t.total.minus(rateado[i]),
  }));
  const subtotal = somar(totais.map((t) => t.total));
  return {
    itens,
    totalBruto: somar(totais.map((t) => t.bruto)),
    totalDescontoItens: somar(totais.map((t) => t.desconto)),
    subtotal,
    descontoDocumento,
    total: subtotal.minus(descontoDocumento),
  };
}
