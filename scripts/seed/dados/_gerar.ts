/**
 * Geradores determinísticos dos códigos fictícios do seed, sempre pelas funções
 * do domínio (o dígito verificador nunca é escrito à mão).
 */
import { calcularDigitosCnpj, calcularDigitosCpf } from "../../../src/server/domain/documentos";
import { calcularDigitoGs1 } from "../../../src/server/domain/ean";

/**
 * EAN-13 de "fabricante" fictício: `789` (prefixo GS1 Brasil) + 4 dígitos do
 * fabricante + 5 dígitos do item + DV GS1. Nunca cai nas faixas de circulação
 * restrita (02, 04, 20–29), então passa no `validarGtinFiscal`. É fictício: o seed
 * **não** o copia para o `gtin_fiscal`, porque a SEFAZ confere o GTIN no cadastro da GS1.
 */
export function eanFabricante(fabricante: string, item: number): string {
  if (!/^\d{4}$/.test(fabricante)) throw new Error(`Código de fabricante inválido: ${fabricante}`);
  if (!Number.isInteger(item) || item < 1 || item > 99_999) throw new Error(`Item de EAN inválido: ${item}`);
  const base = `789${fabricante}${String(item).padStart(5, "0")}`;
  return base + calcularDigitoGs1(base);
}

/** GTIN-14 da embalagem (caixa): indicador + os 12 primeiros dígitos do EAN-13 da unidade + DV. */
export function gtin14Embalagem(ean13: string, indicador = 1): string {
  if (!/^\d{13}$/.test(ean13)) throw new Error(`EAN-13 inválido: ${ean13}`);
  if (!Number.isInteger(indicador) || indicador < 1 || indicador > 8) throw new Error("Indicador deve ser de 1 a 8.");
  const base = `${indicador}${ean13.slice(0, 12)}`;
  return base + calcularDigitoGs1(base);
}

/** CPF válido a partir de uma base fictícia de 9 dígitos. */
export function cpf(base: string): string {
  return base + calcularDigitosCpf(base);
}

/** CNPJ válido (numérico ou alfanumérico) a partir de uma base fictícia de 12 caracteres. */
export function cnpj(base: string): string {
  return base + calcularDigitosCnpj(base);
}
