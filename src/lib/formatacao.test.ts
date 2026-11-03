import Decimal from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  decimalParaTextoEdicao,
  formatarCnpj,
  formatarCpf,
  formatarData,
  formatarDataHora,
  formatarMoeda,
  ehStringDecimal,
  formatarNumero,
  formatarNumeroDocumento,
  formatarPercentual,
  formatarQuantidade,
  parseDecimalBR,
} from "./formatacao";

// Intl usa espaço não separável entre "R$" e o número, e antes da unidade.
const nbsp = "\u00A0";

describe("formatarMoeda", () => {
  it("formata string decimal no padrão R$ 1.234,56", () => {
    expect(formatarMoeda("1234.56")).toBe(`R$${nbsp}1.234,56`);
  });

  it("completa duas casas e aceita Decimal", () => {
    expect(formatarMoeda("10")).toBe(`R$${nbsp}10,00`);
    expect(formatarMoeda(new Decimal("0.5"))).toBe(`R$${nbsp}0,50`);
  });

  it("arredonda half-up em 2 casas", () => {
    expect(formatarMoeda("2.345")).toBe(`R$${nbsp}2,35`);
    expect(formatarMoeda("2.344")).toBe(`R$${nbsp}2,34`);
    // 1.005 em float vira 1.00499999…; com Decimal fica correto
    expect(formatarMoeda("1.005")).toBe(`R$${nbsp}1,01`);
  });

  it("mantém precisão em valores grandes de numeric(14,2)", () => {
    expect(formatarMoeda("999999999999.99")).toBe(`R$${nbsp}999.999.999.999,99`);
  });

  it("formata negativos e zero", () => {
    expect(formatarMoeda("-15.9")).toBe(`-R$${nbsp}15,90`);
    expect(formatarMoeda("0")).toBe(`R$${nbsp}0,00`);
    expect(formatarMoeda("-0.001")).toBe(`R$${nbsp}0,00`);
  });
});

describe("formatarQuantidade", () => {
  it("mostra até 4 casas, sem zeros à direita", () => {
    expect(formatarQuantidade("1.5")).toBe("1,5");
    expect(formatarQuantidade("10.0000")).toBe("10");
    expect(formatarQuantidade("0.125")).toBe("0,125");
    expect(formatarQuantidade("2.12345")).toBe("2,1235");
  });

  it("usa separador de milhar e acrescenta a unidade", () => {
    expect(formatarQuantidade("1250", "UN")).toBe(`1.250${nbsp}UN`);
    expect(formatarQuantidade("1.5", "LT")).toBe(`1,5${nbsp}LT`);
  });

  it("respeita casas máximas menores", () => {
    expect(formatarQuantidade("1.256", undefined, 2)).toBe("1,26");
  });
});

describe("formatarNumero", () => {
  it("formata sem símbolo, com casas mínimas e máximas", () => {
    expect(formatarNumero("1234.5", 2, 2)).toBe("1.234,50");
    expect(formatarNumero("1234.5")).toBe("1.234,5");
  });
});

describe("formatarPercentual", () => {
  it("recebe o percentual cheio e exibe até 2 casas", () => {
    expect(formatarPercentual("12.5")).toBe("12,5%");
    expect(formatarPercentual("35")).toBe("35%");
    expect(formatarPercentual("7.1234")).toBe("7,12%");
    expect(formatarPercentual("0")).toBe("0%");
  });
});

describe("formatarData e formatarDataHora", () => {
  it("exibem no fuso de São Paulo", () => {
    // 02:30 UTC de 3/11 ainda é 23:30 de 2/11 em São Paulo (UTC−3)
    expect(formatarData("2026-11-03T02:30:00Z")).toBe("02/11/2026");
    expect(formatarDataHora("2026-11-03T02:30:00Z")).toBe("02/11/2026 23:30");
  });

  it("aceitam Date e usam 24 horas", () => {
    expect(formatarDataHora(new Date("2026-01-15T17:05:00Z"))).toBe("15/01/2026 14:05");
  });

  it("rejeitam data inválida", () => {
    expect(() => formatarData("ontem")).toThrow(RangeError);
  });
});

describe("formatarNumeroDocumento, formatarCnpj e formatarCpf", () => {
  it("formata a numeração com 6 dígitos", () => {
    expect(formatarNumeroDocumento(123)).toBe("#000123");
    expect(formatarNumeroDocumento("1234567")).toBe("#1234567");
  });

  it("formata CNPJ numérico e alfanumérico", () => {
    expect(formatarCnpj("11222333000181")).toBe("11.222.333/0001-81");
    expect(formatarCnpj("12abc34501de35")).toBe("12.ABC.345/01DE-35");
    expect(formatarCnpj("123")).toBe("123");
  });

  it("formata CPF", () => {
    expect(formatarCpf("12345678909")).toBe("123.456.789-09");
  });
});

describe("parseDecimalBR", () => {
  it("converte texto pt-BR em string decimal com ponto", () => {
    expect(parseDecimalBR("1.234,56")).toBe("1234.56");
    expect(parseDecimalBR("1234,56")).toBe("1234.56");
    expect(parseDecimalBR("10")).toBe("10");
    expect(parseDecimalBR(",5")).toBe("0.5");
    expect(parseDecimalBR("5,")).toBe("5");
    expect(parseDecimalBR("1.234.567,8")).toBe("1234567.8");
  });

  it("ignora espaços e o prefixo R$", () => {
    expect(parseDecimalBR("  R$ 1.234,56 ")).toBe("1234.56");
    expect(parseDecimalBR(`R$${nbsp}10,00`)).toBe("10");
  });

  it("trata ponto como milhar quando forma grupos de 3 dígitos", () => {
    expect(parseDecimalBR("1.500")).toBe("1500");
    expect(parseDecimalBR("12.345.678")).toBe("12345678");
  });

  it("trata ponto como decimal fora do padrão de milhar", () => {
    expect(parseDecimalBR("1.5")).toBe("1.5");
    expect(parseDecimalBR("0.125")).toBe("0.125");
    expect(parseDecimalBR(".75")).toBe("0.75");
  });

  it("rejeita texto inválido", () => {
    for (const invalido of ["", "   ", "abc", "1,2,3", "1.2,5", "12.34.5", "1,2a", ",", "R$", "1e3", "--1"]) {
      expect(parseDecimalBR(invalido), invalido).toBeNull();
    }
  });

  it("limita casas decimais e pode fixá-las", () => {
    expect(parseDecimalBR("10,5", { casas: 2, fixo: true })).toBe("10.50");
    expect(parseDecimalBR("10", { casas: 2, fixo: true })).toBe("10.00");
    expect(parseDecimalBR("1,555", { casas: 2 })).toBeNull();
    expect(parseDecimalBR("1,5555", { casas: 4 })).toBe("1.5555");
    expect(parseDecimalBR("1,55555", { casas: 4 })).toBeNull();
  });

  it("só aceita negativo quando permitido", () => {
    expect(parseDecimalBR("-10,5")).toBeNull();
    expect(parseDecimalBR("-10,5", { permitirNegativo: true })).toBe("-10.5");
    expect(parseDecimalBR("-0", { permitirNegativo: true })).toBe("0");
  });

  it("preserva precisão sem passar por float", () => {
    expect(parseDecimalBR("0,1")).toBe("0.1");
    expect(parseDecimalBR("123456789012,34")).toBe("123456789012.34");
    expect(parseDecimalBR("0,000001")).toBe("0.000001");
  });
});

describe("decimalParaTextoEdicao", () => {
  it("troca o ponto pela vírgula", () => {
    expect(decimalParaTextoEdicao("1234.5")).toBe("1234,5");
    expect(decimalParaTextoEdicao("10")).toBe("10");
  });
});

describe("ehStringDecimal", () => {
  it("reconhece só string decimal com ponto", () => {
    expect(ehStringDecimal("1234.56")).toBe(true);
    expect(ehStringDecimal("-0.5")).toBe(true);
    expect(ehStringDecimal("10")).toBe(true);
    expect(ehStringDecimal("1,5")).toBe(false);
    expect(ehStringDecimal("")).toBe(false);
    expect(ehStringDecimal("1.")).toBe(false);
  });
});
