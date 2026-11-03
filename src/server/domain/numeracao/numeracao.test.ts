import { describe, expect, it } from "vitest";
import { formatarCodigoProduto, formatarNumeroDocumento, interpretarNumeroDocumento } from "./index";

describe("formatarNumeroDocumento", () => {
  it.each([
    [1, "#000001"],
    [123, "#000123"],
    [999_999, "#999999"],
    [1_234_567, "#1234567"], // não corta acima de 6 dígitos
    [BigInt(123), "#000123"],
    ["123", "#000123"], // bigint do Postgres pode vir como string
  ])("%s → %s", (numero, esperado) => {
    expect(formatarNumeroDocumento(numero)).toBe(esperado);
  });

  it.each([[0], [-1], [1.5], [Number.NaN], ["12a"], [""], ["-3"], [BigInt(0)]])("rejeita %s", (numero) => {
    expect(() => formatarNumeroDocumento(numero)).toThrow(/número/i);
  });
});

describe("interpretarNumeroDocumento", () => {
  it.each([
    ["#000123", BigInt(123)],
    ["000123", BigInt(123)],
    ["123", BigInt(123)],
    [" #42 ", BigInt(42)],
    ["#1234567", BigInt(1234567)],
  ])("%j → %s", (texto, esperado) => {
    expect(interpretarNumeroDocumento(texto)).toBe(esperado);
  });

  it.each([[""], ["#"], ["abc"], ["#12a"], ["#0"], ["-5"], ["1.5"]])("%j não é número de documento", (texto) => {
    expect(interpretarNumeroDocumento(texto)).toBeNull();
  });
});

describe("formatarCodigoProduto (regra 4.7)", () => {
  it.each([
    [1, "000001"],
    [BigInt(42), "000042"],
    [999_999, "999999"],
    [1_000_000, "1000000"],
  ])("%s → %s", (sequencial, esperado) => {
    expect(formatarCodigoProduto(sequencial)).toBe(esperado);
  });

  it.each([[0], [-1], [2.5]])("rejeita %s", (sequencial) => {
    expect(() => formatarCodigoProduto(sequencial)).toThrow();
  });
});
