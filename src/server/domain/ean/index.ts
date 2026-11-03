/**
 * Códigos de barras e GTIN (regra 4.7).
 * - EAN-13 interno: `200` + sequencial de 9 dígitos + DV GS1. Nunca é copiado para o GTIN fiscal.
 * - GTIN fiscal: GTIN-8/12/13/14 com DV válido, sem prefixo de uso interno. Vazio = `SEM GTIN` na nota.
 */
import { paraDecimal } from "../decimal";

const SO_DIGITOS = /^\d+$/;

/** Dígito verificador GS1 (módulo 10) de uma base de qualquer tamanho: pesos 3 e 1 a partir da direita. */
export function calcularDigitoGs1(base: string): number {
  if (!SO_DIGITOS.test(base)) throw new Error("A base do código GS1 deve conter só dígitos.");
  let soma = 0;
  for (let i = base.length - 1, posicao = 0; i >= 0; i--, posicao++) {
    soma += Number(base[i]) * (posicao % 2 === 0 ? 3 : 1);
  }
  return (10 - (soma % 10)) % 10;
}

/** Confere o último dígito de um código GS1 completo. */
export function validarDigitoGs1(codigo: string): boolean {
  if (codigo.length < 2 || !SO_DIGITOS.test(codigo)) return false;
  return calcularDigitoGs1(codigo.slice(0, -1)) === Number(codigo.slice(-1));
}

const PREFIXO_EAN_INTERNO = "200";
const MAX_SEQUENCIAL_EAN = BigInt(999_999_999);

/** EAN-13 interno a partir do contador `sequencias` (chave `ean`), de 1 a 999.999.999. */
export function gerarEan13Interno(sequencial: number | bigint): string {
  if (typeof sequencial === "number" && !Number.isSafeInteger(sequencial)) {
    throw new Error("Sequencial do EAN interno deve ser um inteiro.");
  }
  const n = BigInt(sequencial);
  if (n < BigInt(1) || n > MAX_SEQUENCIAL_EAN) {
    throw new Error("Sequencial do EAN interno deve estar entre 1 e 999.999.999.");
  }
  const base = PREFIXO_EAN_INTERNO + n.toString().padStart(9, "0");
  return base + calcularDigitoGs1(base);
}

export function normalizarGtin(entrada: string): string {
  return entrada.replace(/\s/g, "");
}

const TAMANHOS_GTIN = new Set([8, 12, 13, 14]);

/** GTIN-8/12/13/14 com DV válido (inclui o EAN interno; para a nota use `validarGtinFiscal`). */
export function ehGtinValido(codigo: string): boolean {
  return TAMANHOS_GTIN.has(codigo.length) && validarDigitoGs1(codigo);
}

export function ehEan13Valido(codigo: string): boolean {
  return codigo.length === 13 && validarDigitoGs1(codigo);
}

export type ErroGtinFiscal = "formato" | "zerado" | "digito_verificador" | "uso_interno";

/**
 * Valida o `gtin_fiscal`. Vazio (ou nulo) é válido e vira `valor: null` (`SEM GTIN` na nota).
 * Rejeita o EAN-13 começando com 2 (uso interno/restrito), como pede a regra 4.7, em qualquer forma
 * (a verificação é feita sobre a forma canônica de 14 dígitos).
 * Pergunta em aberto: a GS1 também restringe GTIN-12 começando com 2 e GTIN-8 começando com 0 ou 2;
 * por ora seguimos a especificação e o CHECK do banco, que só barram o EAN-13 com 2.
 */
export function validarGtinFiscal(
  entrada: string | null | undefined,
): { ok: true; valor: string | null } | { ok: false; erro: ErroGtinFiscal; mensagem: string } {
  const gtin = normalizarGtin(entrada ?? "");
  if (gtin === "") return { ok: true, valor: null };
  if (!SO_DIGITOS.test(gtin) || !TAMANHOS_GTIN.has(gtin.length)) {
    return { ok: false, erro: "formato", mensagem: "GTIN deve ter 8, 12, 13 ou 14 dígitos." };
  }
  if (/^0+$/.test(gtin)) return { ok: false, erro: "zerado", mensagem: "GTIN não pode ser todo zero." };
  if (!validarDigitoGs1(gtin)) {
    return { ok: false, erro: "digito_verificador", mensagem: "GTIN inválido: dígito verificador não confere." };
  }
  // forma canônica de 14 dígitos: "02…" é um EAN-13 começando com 2, inclusive disfarçado de GTIN-14 ("0" + EAN)
  if (gtin.padStart(14, "0").startsWith("02")) {
    return {
      ok: false,
      erro: "uso_interno",
      mensagem: "GTIN começando com 2 é de uso interno e não vale na nota fiscal. Deixe vazio para SEM GTIN.",
    };
  }
  return { ok: true, valor: gtin };
}

// ---------------------------------------------------------------- Etiqueta

export type TipoCodigoBarras = "fabricante" | "interno" | "embalagem";
export type SimbologiaEtiqueta = "ean13" | "ean8" | "upca" | "code128";

export interface CodigoBarrasProduto {
  codigo: string;
  tipo: TipoCodigoBarras;
  /** `numeric(14,4)` do banco: quantas unidades o código representa. */
  fator: string;
}

function simbologiaGs1(codigo: string): SimbologiaEtiqueta | null {
  if (!validarDigitoGs1(codigo)) return null;
  if (codigo.length === 13) return "ean13";
  if (codigo.length === 8) return "ean8";
  if (codigo.length === 12) return "upca";
  return null;
}

/**
 * Código de barras da etiqueta (Entrega 1): EAN de fabricante, senão o EAN interno,
 * senão Code128 do código interno. Só considera códigos de fator 1 (a etiqueta é da unidade);
 * entre vários candidatos do mesmo tipo, vale o primeiro da lista.
 */
export function escolherCodigoEtiqueta(produto: {
  codigoInterno: string;
  codigosBarras: readonly CodigoBarrasProduto[];
}): { simbologia: SimbologiaEtiqueta; valor: string } {
  const unitarios = produto.codigosBarras.filter((c) => paraDecimal(c.fator).equals(1));
  for (const tipo of ["fabricante", "interno"] as const) {
    for (const c of unitarios) {
      if (c.tipo !== tipo) continue;
      const simbologia = simbologiaGs1(c.codigo);
      if (simbologia) return { simbologia, valor: c.codigo };
    }
  }
  return { simbologia: "code128", valor: produto.codigoInterno };
}
