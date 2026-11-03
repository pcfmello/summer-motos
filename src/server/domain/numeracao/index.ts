/**
 * Formatação da numeração (regra 4.11) e do código sequencial do produto (regra 4.7).
 * O número vem do contador atômico em `sequencias`; aqui só se formata.
 */

/** O `bigint` do Postgres pode chegar como number, bigint ou string. */
export type NumeroSequencial = number | bigint | string;

function paraInteiroPositivo(valor: NumeroSequencial, nome: string): bigint {
  let n: bigint | null = null;
  if (typeof valor === "bigint") n = valor;
  else if (typeof valor === "number" && Number.isSafeInteger(valor)) n = BigInt(valor);
  else if (typeof valor === "string" && /^\d+$/.test(valor.trim())) n = BigInt(valor.trim());
  if (n === null || n < BigInt(1)) throw new Error(`${nome} deve ser um inteiro maior que zero.`);
  return n;
}

/** `123` → `#000123`. Acima de 6 dígitos o número aparece inteiro (`#1234567`). */
export function formatarNumeroDocumento(numero: NumeroSequencial): string {
  return `#${paraInteiroPositivo(numero, "O número do documento").toString().padStart(6, "0")}`;
}

/** Lê o que o usuário digita na busca (`#000123`, `000123`, `123`). Devolve null se não for um número de documento. */
export function interpretarNumeroDocumento(texto: string): bigint | null {
  const m = /^#?(\d+)$/.exec(texto.trim());
  if (!m) return null;
  const n = BigInt(m[1]);
  return n >= BigInt(1) ? n : null;
}

/** Código interno gerado: sequencial de 6 dígitos (`000001`). Acima de 999.999, o número inteiro. */
export function formatarCodigoProduto(sequencial: NumeroSequencial): string {
  return paraInteiroPositivo(sequencial, "O sequencial do código").toString().padStart(6, "0");
}
