/**
 * Formatação e leitura de valores no padrão brasileiro (pt-BR).
 *
 * - Dinheiro, quantidade e percentual chegam do servidor como string decimal
 *   ("1234.56", vinda de `numeric` no Postgres) ou `Decimal`. Nunca use `float`
 *   para fazer conta com eles: aqui só formatamos.
 * - Datas são sempre exibidas em America/Sao_Paulo, independente do fuso do
 *   servidor ou do navegador.
 * - `parseDecimalBR` converte o que o usuário digitou ("1.234,56") em string
 *   decimal com ponto ("1234.56"), que é o que vai para a server action.
 */
import Decimal from "decimal.js";

export const FUSO_HORARIO = "America/Sao_Paulo";
const LOCALE = "pt-BR";

export type ValorDecimal = Decimal.Value;

const moeda = new Intl.NumberFormat(LOCALE, {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dataCurta = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO_HORARIO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const horaCurta = new Intl.DateTimeFormat(LOCALE, {
  timeZone: FUSO_HORARIO,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function paraDecimal(valor: ValorDecimal): Decimal {
  return valor instanceof Decimal ? valor : new Decimal(valor);
}

/**
 * Intl aceita string decimal exata (Intl.NumberFormat v3), o que evita passar
 * por `number`. O arredondamento já foi feito com Decimal (half-up).
 */
function formatarComIntl(formatador: Intl.NumberFormat, valor: Decimal): string {
  const texto = valor.isZero() ? "0" : valor.toFixed();
  return formatador.format(texto as Intl.StringNumericLiteral);
}

/** R$ 1.234,56 — arredonda half-up em 2 casas. */
export function formatarMoeda(valor: ValorDecimal): string {
  const d = paraDecimal(valor).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  return formatarComIntl(moeda, d);
}

const formatadoresNumero = new Map<string, Intl.NumberFormat>();

/**
 * Número pt-BR sem símbolo: formatarNumero("1234.5", 2, 2) → "1.234,50".
 * Arredonda half-up em `casasMaximas`.
 */
export function formatarNumero(
  valor: ValorDecimal,
  casasMinimas = 0,
  casasMaximas = 4,
): string {
  const chave = `${casasMinimas}:${casasMaximas}`;
  let formatador = formatadoresNumero.get(chave);
  if (!formatador) {
    formatador = new Intl.NumberFormat(LOCALE, {
      minimumFractionDigits: casasMinimas,
      maximumFractionDigits: casasMaximas,
    });
    formatadoresNumero.set(chave, formatador);
  }
  const d = paraDecimal(valor).toDecimalPlaces(casasMaximas, Decimal.ROUND_HALF_UP);
  return formatarComIntl(formatador, d);
}

/**
 * 1,5 · 10 · 0,125 — até 4 casas (padrão), sem zeros à direita.
 * Com `unidade`, acrescenta a sigla: "1,5 LT".
 */
export function formatarQuantidade(
  valor: ValorDecimal,
  unidade?: string,
  casasMaximas = 4,
): string {
  const texto = formatarNumero(valor, 0, casasMaximas);
  return unidade ? `${texto}\u00A0${unidade}` : texto;
}

const percentual = new Intl.NumberFormat(LOCALE, {
  style: "percent",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/**
 * Recebe o percentual "cheio" (12.5 = 12,5%), como fica no banco (`numeric(7,4)`).
 * Exibe até 2 casas: "12,5%".
 */
export function formatarPercentual(valor: ValorDecimal): string {
  const fracao = paraDecimal(valor)
    .toDecimalPlaces(2, Decimal.ROUND_HALF_UP)
    .dividedBy(100);
  return formatarComIntl(percentual, fracao);
}

function paraData(valor: Date | string): Date {
  const data = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(data.getTime())) {
    throw new RangeError(`Data inválida: ${String(valor)}`);
  }
  return data;
}

/** 03/11/2026, no fuso de São Paulo. */
export function formatarData(valor: Date | string): string {
  return dataCurta.format(paraData(valor));
}

/** 03/11/2026 14:05, no fuso de São Paulo. */
export function formatarDataHora(valor: Date | string): string {
  const data = paraData(valor);
  return `${dataCurta.format(data)} ${horaCurta.format(data)}`;
}

/** Número sequencial de documento: 123 → "#000123". */
export function formatarNumeroDocumento(numero: number | string): string {
  return `#${String(numero).padStart(6, "0")}`;
}

/**
 * CNPJ (numérico ou alfanumérico, 14 caracteres sem máscara) → 12.ABC.345/01DE-35.
 * Não valida: a validação fica em `server/domain/documentos`.
 */
export function formatarCnpj(cnpj: string): string {
  const limpo = cnpj.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (limpo.length !== 14) return cnpj;
  return `${limpo.slice(0, 2)}.${limpo.slice(2, 5)}.${limpo.slice(5, 8)}/${limpo.slice(8, 12)}-${limpo.slice(12)}`;
}

/** CPF (11 dígitos sem máscara) → 123.456.789-09. Não valida. */
export function formatarCpf(cpf: string): string {
  const limpo = cpf.replace(/\D/g, "");
  if (limpo.length !== 11) return cpf;
  return `${limpo.slice(0, 3)}.${limpo.slice(3, 6)}.${limpo.slice(6, 9)}-${limpo.slice(9)}`;
}

export type OpcoesParseDecimal = {
  /** Máximo de casas decimais aceitas. Mais casas que isso = texto inválido. */
  casas?: number;
  /** Devolve sempre com `casas` casas ("10.50" em vez de "10.5"). */
  fixo?: boolean;
  /** Aceita sinal de menos. Padrão: false. */
  permitirNegativo?: boolean;
};

// Parte inteira com separador de milhar pt-BR: 1.234.567 (não começa com 0: "0.125" é decimal)
const INTEIRO_COM_MILHAR = /^[1-9]\d{0,2}(\.\d{3})+$/;
const INTEIRO_SIMPLES = /^\d+$/;
const DECIMAL_COM_PONTO = /^\d*\.\d+$/;

/**
 * Converte o texto digitado no padrão brasileiro em string decimal com ponto.
 *
 * Aceita:
 * - "1.234,56", "1234,56", ",5", "10" → vírgula é o separador decimal;
 * - "1.234" e "1.234.567" → ponto como separador de milhar (padrão pt-BR);
 * - "1.5" ou "0.125" → ponto decimal (teclado numérico em layout americano),
 *   quando o texto não tem vírgula e não forma grupos de milhar de 3 dígitos;
 * - espaços e o prefixo "R$" são ignorados.
 *
 * Devolve `null` para texto vazio ou inválido (letras, duas vírgulas, milhar
 * mal agrupado, casas demais). Nunca passa por `parseFloat`.
 */
export function parseDecimalBR(
  texto: string,
  opcoes: OpcoesParseDecimal = {},
): string | null {
  const { casas, fixo = false, permitirNegativo = false } = opcoes;

  let limpo = texto.replace(/R\$/gi, "").replace(/[\s\u00A0]/g, "");
  if (limpo === "") return null;

  let negativo = false;
  if (limpo.startsWith("-")) {
    if (!permitirNegativo) return null;
    negativo = true;
    limpo = limpo.slice(1);
  }
  if (limpo === "") return null;

  let normalizado: string;
  const partesVirgula = limpo.split(",");

  if (partesVirgula.length > 2) return null;

  if (partesVirgula.length === 2) {
    const [inteiro, fracao] = partesVirgula;
    if (!/^\d*$/.test(fracao)) return null;
    let inteiroNormalizado: string;
    if (inteiro === "") inteiroNormalizado = "0";
    else if (INTEIRO_SIMPLES.test(inteiro)) inteiroNormalizado = inteiro;
    else if (INTEIRO_COM_MILHAR.test(inteiro)) inteiroNormalizado = inteiro.replace(/\./g, "");
    else return null;
    if (fracao === "" && inteiro === "") return null;
    normalizado = fracao === "" ? inteiroNormalizado : `${inteiroNormalizado}.${fracao}`;
  } else if (INTEIRO_SIMPLES.test(limpo)) {
    normalizado = limpo;
  } else if (INTEIRO_COM_MILHAR.test(limpo)) {
    normalizado = limpo.replace(/\./g, "");
  } else if (DECIMAL_COM_PONTO.test(limpo)) {
    normalizado = limpo.startsWith(".") ? `0${limpo}` : limpo;
  } else {
    return null;
  }

  let valor = new Decimal(normalizado);
  if (casas !== undefined && valor.decimalPlaces() > casas) return null;
  if (negativo) valor = valor.negated();
  if (valor.isZero()) valor = new Decimal(0); // evita "-0"

  return fixo && casas !== undefined ? valor.toFixed(casas) : valor.toFixed();
}

/**
 * Caminho inverso de `parseDecimalBR`, para preencher o campo em edição:
 * "1234.5" → "1234,5" (sem separador de milhar, que atrapalha a digitação).
 */
export function decimalParaTextoEdicao(valor: string): string {
  return valor.replace(".", ",");
}

/** String decimal com ponto, como a que vai para o servidor: "1234.56", "-0.5", "10". */
export function ehStringDecimal(valor: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(valor);
}
