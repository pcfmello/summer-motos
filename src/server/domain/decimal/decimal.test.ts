import { describe, expect, it } from "vitest";
import {
  CASAS,
  Decimal,
  arredondarAliquota,
  arredondarCusto,
  arredondarDinheiro,
  arredondarQuantidade,
  paraDecimal,
  paraNumeric,
  somar,
} from "./index";

describe("Decimal configurado", () => {
  it("usa ROUND_HALF_UP", () => {
    expect(Decimal.rounding).toBe(Decimal.ROUND_HALF_UP);
  });

  it("não sofre o erro de ponto flutuante de 0.1 + 0.2", () => {
    expect(new Decimal("0.1").plus("0.2").toString()).toBe("0.3");
  });
});

describe("paraDecimal", () => {
  it.each([
    ["123.4500", "123.45"],
    ["0", "0"],
    ["-10.5", "-10.5"],
    ["+3", "3"],
    ["  7.25  ", "7.25"],
    ["000012.300000", "12.3"],
  ])("converte a string numeric %j", (entrada, esperado) => {
    expect(paraDecimal(entrada).toString()).toBe(esperado);
  });

  it("aceita um Decimal e devolve o mesmo valor", () => {
    const d = new Decimal("1.5");
    expect(paraDecimal(d).equals(d)).toBe(true);
  });

  it.each([
    [""],
    ["abc"],
    ["1,50"],
    ["1e5"],
    ["0x10"],
    ["NaN"],
    ["Infinity"],
    ["1.2.3"],
    ["."],
    ["1."],
  ])("rejeita a string inválida %j", (entrada) => {
    expect(() => paraDecimal(entrada)).toThrow(/valor decimal inválido/i);
  });

  it("rejeita um Decimal não finito", () => {
    expect(() => paraDecimal(new Decimal(Infinity))).toThrow(/valor decimal inválido/i);
    expect(() => paraDecimal(new Decimal(NaN))).toThrow(/valor decimal inválido/i);
  });
});

describe("arredondamentos half-up", () => {
  it.each([
    ["1.005", "1.01"],
    ["1.004", "1"],
    ["2.675", "2.68"],
    ["-1.005", "-1.01"],
    ["10", "10"],
  ])("dinheiro: %s → %s", (entrada, esperado) => {
    expect(arredondarDinheiro(entrada).toString()).toBe(esperado);
  });

  it.each([
    ["1.00005", "1.0001"],
    ["1.00004", "1"],
    ["0.33333333", "0.3333"],
  ])("quantidade: %s → %s", (entrada, esperado) => {
    expect(arredondarQuantidade(entrada).toString()).toBe(esperado);
  });

  it.each([
    ["1.0000005", "1.000001"],
    ["1.0000004", "1"],
    ["3.333333333", "3.333333"],
  ])("custo: %s → %s", (entrada, esperado) => {
    expect(arredondarCusto(entrada).toString()).toBe(esperado);
  });

  it.each([
    ["18.00005", "18.0001"],
    ["7.6", "7.6"],
  ])("alíquota: %s → %s", (entrada, esperado) => {
    expect(arredondarAliquota(entrada).toString()).toBe(esperado);
  });

  it("as casas seguem o tipo do numeric no banco", () => {
    expect(CASAS).toEqual({ dinheiro: 2, quantidade: 4, custo: 6, aliquota: 4 });
  });
});

describe("paraNumeric", () => {
  it.each([
    ["10", "dinheiro", "10.00"],
    ["1.005", "dinheiro", "1.01"],
    ["2", "quantidade", "2.0000"],
    ["0.123456789", "custo", "0.123457"],
    ["18", "aliquota", "18.0000"],
    ["-0.001", "dinheiro", "0.00"],
    ["-0", "quantidade", "0.0000"],
    ["-5.5", "quantidade", "-5.5000"],
  ] as const)("%s como %s → %s", (entrada, tipo, esperado) => {
    expect(paraNumeric(entrada, tipo)).toBe(esperado);
  });

  it("aceita Decimal", () => {
    expect(paraNumeric(new Decimal("1").div(3), "custo")).toBe("0.333333");
  });
});

describe("somar", () => {
  it("soma strings e Decimals sem perda", () => {
    expect(somar(["0.1", "0.2", new Decimal("0.3")]).toString()).toBe("0.6");
  });

  it("lista vazia soma zero", () => {
    expect(somar([]).toString()).toBe("0");
  });
});
