/**
 * Estoque (regras 4.2, 4.5 e 4.6; seções 6 e 13 do modelo de dados): funções puras.
 *
 * Só este módulo decide como um movimento muda o saldo. Quem grava é
 * `server/servicos/estoque.ts`, dentro de `withTransaction`, com as linhas de
 * `estoque_saldos` travadas por `SELECT ... FOR UPDATE` em ordem de `produto_id`.
 *
 * Custo desconhecido é `null` (D25 do modelo), nunca zero: zero é custo
 * conhecido (bonificação).
 */
import { calcularCustoMedio } from "../custo";
import {
  CASAS,
  type Decimal,
  type ValorDecimal,
  arredondarCusto,
  arredondarQuantidade,
  paraDecimal,
} from "../decimal";

// ---------------------------------------------------------------- Tipos de movimento

/** Mesma lista e mesma ordem do CHECK `movimentacoes_estoque_tipo_check` (teste confere). */
export const TIPOS_MOVIMENTO = [
  "saldo_inicial",
  "entrada_compra",
  "entrada_manual",
  "saida_venda",
  "saida_os",
  "ajuste_manual",
  "ajuste_inventario",
  "devolucao_cliente",
  "devolucao_fornecedor",
  "estorno",
] as const;
export type TipoMovimento = (typeof TIPOS_MOVIMENTO)[number];

/** Sempre positivos. */
export const TIPOS_ENTRADA = ["saldo_inicial", "entrada_compra", "entrada_manual", "devolucao_cliente"] as const;
/** Sempre negativos. */
export const TIPOS_SAIDA = ["saida_venda", "saida_os", "devolucao_fornecedor"] as const;
/** Qualquer sinal, nunca zero. */
export const TIPOS_SINAL_LIVRE = ["ajuste_manual", "ajuste_inventario", "estorno"] as const;
/** Exigem custo (CHECK `movimentacoes_estoque_custo_entrada_check`). O saldo inicial aceita nulo. */
export const TIPOS_CUSTO_OBRIGATORIO = ["entrada_compra", "entrada_manual"] as const;

const contem = (lista: readonly string[], tipo: string) => lista.includes(tipo);

/** Maior valor absoluto que cabe em `numeric(14,4)` e em `numeric(16,6)`: 10 dígitos inteiros. */
const LIMITE_INTEIRO = "10000000000";
const dentroDoLimite = (valor: Decimal) => valor.abs().lt(LIMITE_INTEIRO);

// ---------------------------------------------------------------- Erro

export type CodigoErroEstoque =
  | "movimento_invalido"
  | "produto_invalido"
  | "produto_repetido"
  | "deposito_invalido"
  | "origem_invalida"
  | "saldo_nao_encontrado";

/**
 * Erro de regra de estoque. O serviço o lança dentro do `withTransaction` (o que
 * desfaz a transação inteira); a action o captura e devolve um resultado tipado.
 * `produtos` lista exatamente os produtos envolvidos, para a tela apontá-los.
 */
export class ErroEstoque extends Error {
  readonly codigo: CodigoErroEstoque;
  readonly produtos: readonly string[];

  constructor(codigo: CodigoErroEstoque, mensagem: string, produtos: readonly string[] = []) {
    super(mensagem);
    this.name = "ErroEstoque";
    this.codigo = codigo;
    this.produtos = produtos;
  }
}

// ---------------------------------------------------------------- Validação de movimento

export type ErroMovimento =
  | "tipo"
  | "formato"
  | "quantidade_zero"
  | "sinal"
  | "casas_quantidade"
  | "casas_custo"
  | "custo_negativo"
  | "custo_obrigatorio"
  | "limite";

export type ResultadoMovimento = { ok: true } | { ok: false; erro: ErroMovimento; mensagem: string };

const falha = (erro: ErroMovimento, mensagem: string): ResultadoMovimento => ({ ok: false, erro, mensagem });

function lerDecimal(valor: ValorDecimal): Decimal | null {
  try {
    return paraDecimal(valor);
  } catch {
    return null;
  }
}

/**
 * Confere um movimento antes de gravar, com as mesmas regras dos CHECKs de
 * `movimentacoes_estoque` (6.3), para o erro chegar com mensagem e não como
 * violação de constraint:
 * - tipo conhecido;
 * - quantidade diferente de zero, com o sinal do tipo e no máximo 4 casas;
 * - custo não negativo, com no máximo 6 casas, obrigatório nas entradas de compra e manual;
 * - os dois abaixo de 10¹⁰, o limite das colunas `numeric(14,4)` e `numeric(16,6)`.
 * Valores com mais casas são recusados, não arredondados: o kardex grava o que foi informado.
 */
export function validarMovimento(movimento: {
  tipo: TipoMovimento;
  quantidade: ValorDecimal;
  custoUnitario: ValorDecimal | null;
}): ResultadoMovimento {
  const { tipo } = movimento;
  if (!contem(TIPOS_MOVIMENTO, tipo)) return falha("tipo", `Tipo de movimento desconhecido: ${String(tipo)}.`);

  const quantidade = lerDecimal(movimento.quantidade);
  if (!quantidade) return falha("formato", "Quantidade inválida.");
  if (quantidade.isZero()) return falha("quantidade_zero", "A quantidade do movimento não pode ser zero.");
  if (!dentroDoLimite(quantidade)) return falha("limite", "A quantidade passa do limite aceito.");
  if (quantidade.decimalPlaces() > CASAS.quantidade) {
    return falha("casas_quantidade", `A quantidade aceita no máximo ${CASAS.quantidade} casas decimais.`);
  }
  if (contem(TIPOS_ENTRADA, tipo) && quantidade.isNegative()) {
    return falha("sinal", "Este tipo de movimento só aceita quantidade positiva.");
  }
  if (contem(TIPOS_SAIDA, tipo) && !quantidade.isNegative()) {
    return falha("sinal", "Este tipo de movimento só aceita quantidade negativa.");
  }

  if (movimento.custoUnitario === null) {
    if (contem(TIPOS_CUSTO_OBRIGATORIO, tipo)) return falha("custo_obrigatorio", "A entrada exige o custo unitário.");
    return { ok: true };
  }
  const custo = lerDecimal(movimento.custoUnitario);
  if (!custo) return falha("formato", "Custo unitário inválido.");
  if (custo.isNegative() && !custo.isZero()) return falha("custo_negativo", "O custo unitário não pode ser negativo.");
  if (!dentroDoLimite(custo)) return falha("limite", "O custo unitário passa do limite aceito.");
  if (custo.decimalPlaces() > CASAS.custo) {
    return falha("casas_custo", `O custo unitário aceita no máximo ${CASAS.custo} casas decimais.`);
  }
  return { ok: true };
}

// ---------------------------------------------------------------- Saldo

/**
 * Disponível = quantidade − reservada (regra 4.2), em 4 casas. Pode ser negativo
 * quando a empresa permite estoque negativo. Calculado, nunca gravado.
 */
export function calcularDisponivel(quantidade: ValorDecimal, quantidadeReservada: ValorDecimal): Decimal {
  const reservada = paraDecimal(quantidadeReservada);
  if (reservada.lt(0)) throw new Error("A quantidade reservada não pode ser negativa.");
  return arredondarQuantidade(paraDecimal(quantidade).minus(reservada));
}

/** Linha de `estoque_saldos` como o Drizzle a devolve (`numeric` em string; custo nulo = desconhecido). */
export interface SaldoAtual {
  quantidade: ValorDecimal;
  custoMedio: ValorDecimal | null;
  ultimoCusto: ValorDecimal | null;
}

export interface SaldoDepois {
  quantidade: Decimal;
  custoMedio: Decimal | null;
  ultimoCusto: Decimal | null;
  /**
   * Custo gravado no movimento (`custo_unitario`): o informado ou, sem ele, o custo
   * pelo qual as unidades entraram. Nulo só quando nenhum custo é conhecido.
   */
  custoMovimento: Decimal | null;
}

/**
 * Aplica uma entrada (saldo inicial, compra, entrada manual, devolução de cliente)
 * ao saldo travado. Quantidade em 4 casas; custos em 6.
 *
 * Custo da entrada (D25 e 13.7 do modelo, D026), quando não informado:
 * - saldo positivo com médio conhecido: entra pelo médio atual (como a devolução de
 *   cliente com custo nulo), e o médio não muda;
 * - senão (saldo ≤ 0 ou médio nulo): entra pelo último custo, se houver (13.7);
 * - sem nenhum dos dois: custo nulo (peça sem custo, fora da margem).
 * O kardex grava esse custo efetivo, então Σ(qtd × custo) continua batendo com o saldo.
 *
 * Custo médio (regra 4.5), com o custo efetivo:
 * - saldo ≤ 0 ou médio desconhecido: novo médio = custo da entrada;
 * - senão: média ponderada (`calcularCustoMedio`).
 *
 * Último custo: muda só com custo **informado** (é o preço de reposição da compra).
 */
export function aplicarEntrada(
  saldo: SaldoAtual,
  entrada: { quantidade: ValorDecimal; custoUnitario: ValorDecimal | null },
): SaldoDepois {
  const quantidadeEntrada = paraDecimal(entrada.quantidade);
  if (quantidadeEntrada.lte(0)) throw new Error("A quantidade da entrada deve ser maior que zero.");
  const saldoAntes = paraDecimal(saldo.quantidade);
  const medioAtual = saldo.custoMedio === null ? null : paraDecimal(saldo.custoMedio);
  const ultimoAtual = saldo.ultimoCusto === null ? null : arredondarCusto(saldo.ultimoCusto);
  const quantidade = arredondarQuantidade(saldoAntes.plus(quantidadeEntrada));
  if (!dentroDoLimite(quantidade)) throw new Error("O saldo passa do limite aceito.");

  let custoMovimento: Decimal | null;
  if (entrada.custoUnitario !== null) {
    custoMovimento = arredondarCusto(entrada.custoUnitario);
    if (custoMovimento.isNegative() && !custoMovimento.isZero()) {
      throw new Error("O custo da entrada não pode ser negativo.");
    }
  } else if (saldoAntes.gt(0) && medioAtual !== null) {
    custoMovimento = arredondarCusto(medioAtual);
  } else {
    custoMovimento = ultimoAtual;
  }

  const custoMedio =
    custoMovimento === null
      ? null
      : medioAtual === null
        ? custoMovimento
        : calcularCustoMedio({
            saldoAntes,
            custoMedioAtual: medioAtual,
            quantidadeEntrada,
            custoEntrada: custoMovimento,
          });
  const ultimoCusto = entrada.custoUnitario === null ? ultimoAtual : custoMovimento;
  return { quantidade, custoMedio, ultimoCusto, custoMovimento };
}

// ---------------------------------------------------------------- Ordem das travas

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Ordena os itens por `produto_id` na mesma ordem em que o Postgres ordena `uuid`
 * (bytes; igual ao texto hexadecimal minúsculo) e normaliza o id para minúsculas.
 * É a ordem do `INSERT ... ON CONFLICT` e do `SELECT ... FOR UPDATE` dos saldos
 * (seção 13.1, item 3 e 4), que evita deadlock entre transações com os mesmos produtos.
 *
 * Produto repetido é recusado: quem chama soma os itens antes (13.1, item 2), ou
 * decide o que fazer quando os custos diferem.
 */
export function ordenarItensPorProduto<T extends { produtoId: string }>(itens: readonly T[]): T[] {
  const normalizados = itens.map((item) => ({ ...item, produtoId: item.produtoId.toLowerCase() }));
  const invalidos = normalizados.filter((i) => !UUID.test(i.produtoId)).map((i) => i.produtoId);
  if (invalidos.length > 0) throw new ErroEstoque("produto_invalido", "Identificador de produto inválido.", invalidos);

  const vistos = new Set<string>();
  const repetidos = new Set<string>();
  for (const { produtoId } of normalizados) {
    if (vistos.has(produtoId)) repetidos.add(produtoId);
    vistos.add(produtoId);
  }
  if (repetidos.size > 0) {
    throw new ErroEstoque("produto_repetido", "O mesmo produto aparece mais de uma vez.", [...repetidos]);
  }
  return normalizados.sort((a, b) => (a.produtoId < b.produtoId ? -1 : a.produtoId > b.produtoId ? 1 : 0));
}
