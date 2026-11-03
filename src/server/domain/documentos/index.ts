/**
 * Validação de documentos (regra 4.12): CPF, CNPJ numérico e alfanumérico, placa, NCM, CEST e origem.
 * Cada `validar*` normaliza a entrada e devolve um resultado tipado; nenhum lança erro.
 */

export type ErroDocumento = "formato" | "digito_verificador" | "sequencia_repetida";

export type ResultadoValidacao<T, E extends string = ErroDocumento> =
  | { ok: true; valor: T }
  | { ok: false; erro: E; mensagem: string };

const falha = <E extends string>(erro: E, mensagem: string) => ({ ok: false as const, erro, mensagem });

const todosIguais = (texto: string) => texto.split("").every((c) => c === texto[0]);

// ---------------------------------------------------------------- CPF

export function normalizarCpf(entrada: string): string {
  return entrada.replace(/[\s.\-/]/g, "");
}

function digitoCpf(base: string): number {
  let soma = 0;
  for (let i = 0; i < base.length; i++) soma += Number(base[i]) * (base.length + 1 - i);
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function validarCpf(entrada: string): ResultadoValidacao<string> {
  const cpf = normalizarCpf(entrada);
  if (!/^\d{11}$/.test(cpf)) return falha("formato", "CPF deve ter 11 dígitos.");
  if (todosIguais(cpf)) return falha("sequencia_repetida", "CPF inválido: todos os dígitos são iguais.");
  const d1 = digitoCpf(cpf.slice(0, 9));
  const d2 = digitoCpf(cpf.slice(0, 9) + d1);
  if (cpf.slice(9) !== `${d1}${d2}`) return falha("digito_verificador", "CPF inválido: dígito verificador não confere.");
  return { ok: true, valor: cpf };
}

// ---------------------------------------------------------------- CNPJ

/** Tira a máscara (`.`, `/`, `-` e espaços) e põe em maiúsculas. Não remove outros caracteres. */
export function normalizarCnpj(entrada: string): string {
  return entrada.replace(/[\s.\-/]/g, "").toUpperCase();
}

const BASE_CNPJ = /^[0-9A-Z]{12}$/;
const FORMATO_CNPJ = /^[0-9A-Z]{12}[0-9]{2}$/;

/** DV do CNPJ pelo algoritmo da Receita: valor = código ASCII − 48; pesos 2 a 9 da direita para a esquerda; módulo 11. */
function digitoCnpj(base: string): number {
  let soma = 0;
  let peso = 2;
  for (let i = base.length - 1; i >= 0; i--) {
    soma += (base.charCodeAt(i) - 48) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** Calcula os 2 DVs (numéricos) de uma base de 12 caracteres `[0-9A-Z]`. */
export function calcularDigitosCnpj(base: string): string {
  if (!BASE_CNPJ.test(base)) throw new Error("A base do CNPJ deve ter 12 caracteres [0-9A-Z].");
  const d1 = digitoCnpj(base);
  const d2 = digitoCnpj(base + d1);
  return `${d1}${d2}`;
}

/** CNPJ numérico ou alfanumérico (a partir de julho de 2026). Devolve 14 caracteres sem máscara. */
export function validarCnpj(entrada: string): ResultadoValidacao<string> {
  const cnpj = normalizarCnpj(entrada);
  if (!FORMATO_CNPJ.test(cnpj)) {
    return falha("formato", "CNPJ deve ter 12 letras ou números seguidos de 2 dígitos verificadores.");
  }
  if (todosIguais(cnpj)) return falha("sequencia_repetida", "CNPJ inválido: todos os caracteres são iguais.");
  if (cnpj.slice(12) !== calcularDigitosCnpj(cnpj.slice(0, 12))) {
    return falha("digito_verificador", "CNPJ inválido: dígito verificador não confere.");
  }
  return { ok: true, valor: cnpj };
}

// ---------------------------------------------------------------- Placa

export type PadraoPlaca = "antiga" | "mercosul";

export function normalizarPlaca(entrada: string): string {
  return entrada.replace(/[\s-]/g, "").toUpperCase();
}

const FORMATO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;

export function validarPlaca(
  entrada: string,
): { ok: true; valor: string; padrao: PadraoPlaca } | { ok: false; erro: "formato"; mensagem: string } {
  const placa = normalizarPlaca(entrada);
  if (!FORMATO_PLACA.test(placa)) {
    return falha("formato", "Placa inválida: use o padrão antigo (ABC1234) ou o Mercosul (ABC1D23).");
  }
  return { ok: true, valor: placa, padrao: /[A-Z]/.test(placa[4]) ? "mercosul" : "antiga" };
}

// ---------------------------------------------------------------- NCM, CEST e origem

export function normalizarNcm(entrada: string): string {
  return entrada.replace(/[\s.]/g, "");
}

export function validarNcm(entrada: string): ResultadoValidacao<string, "formato"> {
  const ncm = normalizarNcm(entrada);
  if (!/^\d{8}$/.test(ncm)) return falha("formato", "NCM deve ter 8 dígitos.");
  return { ok: true, valor: ncm };
}

export function normalizarCest(entrada: string): string {
  return entrada.replace(/[\s.]/g, "");
}

export function validarCest(entrada: string): ResultadoValidacao<string, "formato"> {
  const cest = normalizarCest(entrada);
  if (!/^\d{7}$/.test(cest)) return falha("formato", "CEST deve ter 7 dígitos.");
  return { ok: true, valor: cest };
}

/** Origem da mercadoria (tabela A do ICMS): inteiro de 0 a 8. */
export function validarOrigem(entrada: number | string): ResultadoValidacao<number, "formato"> {
  const texto = typeof entrada === "number" ? String(entrada) : entrada.trim();
  if (!/^[0-8]$/.test(texto)) return falha("formato", "Origem da mercadoria deve ser um número de 0 a 8.");
  return { ok: true, valor: Number(texto) };
}
