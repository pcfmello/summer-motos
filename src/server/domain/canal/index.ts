/**
 * Canais de venda (regra 4.14): disponível e quantidade publicada no Mercado Livre e no e-commerce.
 * O kit é um produto comum, com saldo próprio (D012); não há cálculo por componentes.
 */
import { Decimal, type ValorDecimal, arredondarQuantidade, paraDecimal } from "../decimal";

/** Disponível = quantidade − reservada (regra 4.2). Pode ser negativo se a empresa permite estoque negativo. */
export function calcularDisponivel(quantidade: ValorDecimal, quantidadeReservada: ValorDecimal): Decimal {
  const reservada = paraDecimal(quantidadeReservada);
  if (reservada.lt(0)) throw new Error("A quantidade reservada não pode ser negativa.");
  return arredondarQuantidade(paraDecimal(quantidade).minus(reservada));
}

/**
 * Quantidade publicada = max(0, disponível − estoque de segurança).
 * DECISÃO PROVISÓRIA: a fração é arredondada para baixo até o inteiro (7,5 → 7), porque o canal vende
 * unidades inteiras e arredondar para cima venderia o que não existe.
 * PERGUNTA EM ABERTO ao usuário: confirmar para produtos fracionados (ex.: óleo em LT).
 */
export function calcularQuantidadePublicada(entrada: {
  disponivel: ValorDecimal;
  estoqueSeguranca: ValorDecimal;
}): Decimal {
  const seguranca = paraDecimal(entrada.estoqueSeguranca);
  if (seguranca.lt(0)) throw new Error("O estoque de segurança não pode ser negativo.");
  const publicada = paraDecimal(entrada.disponivel).minus(seguranca).floor();
  return publicada.gt(0) ? publicada : new Decimal(0);
}
