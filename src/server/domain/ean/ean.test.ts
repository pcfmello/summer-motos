import { describe, expect, it } from "vitest";
import {
  calcularDigitoGs1,
  ehEan13Valido,
  ehGtinValido,
  escolherCodigoEtiqueta,
  gerarEan13Interno,
  normalizarGtin,
  validarDigitoGs1,
  validarGtinFiscal,
} from "./index";

describe("calcularDigitoGs1 (módulo 10)", () => {
  it.each([
    ["400638133393", 1],
    ["789100031550", 7],
    ["789490001151", 7],
    ["9638507", 4],
    ["03600029145", 2],
    ["1001234567890", 2],
    ["200000000001", 5],
    ["000000000000", 0],
  ])("%s → %i", (base, dv) => {
    expect(calcularDigitoGs1(base)).toBe(dv);
  });

  it.each([[""], ["12a4"], ["12 34"]])("rejeita a base %j", (base) => {
    expect(() => calcularDigitoGs1(base)).toThrow();
  });
});

describe("validarDigitoGs1", () => {
  it.each([
    ["4006381333931", true],
    ["4006381333932", false],
    ["96385074", true],
    ["036000291452", true],
    ["10012345678902", true],
    ["1", false],
    ["", false],
    ["40063813339A1", false],
  ])("%j → %s", (codigo, esperado) => {
    expect(validarDigitoGs1(codigo)).toBe(esperado);
  });
});

describe("gerarEan13Interno", () => {
  it.each([
    [1, "2000000000015"],
    [42, "2000000000428"],
    [123, "2000000001234"],
    [999_999_999, "2009999999997"],
    [BigInt(123), "2000000001234"],
  ])("sequencial %s → %s", (sequencial, esperado) => {
    const ean = gerarEan13Interno(sequencial);
    expect(ean).toBe(esperado);
    expect(ean).toHaveLength(13);
    expect(ean.startsWith("200")).toBe(true);
    expect(validarDigitoGs1(ean)).toBe(true);
  });

  it.each([[0], [-1], [1_000_000_000], [1.5], [Number.NaN], [BigInt(0)]])(
    "rejeita o sequencial %s",
    (sequencial) => {
      expect(() => gerarEan13Interno(sequencial)).toThrow();
    },
  );
});

describe("validarGtinFiscal", () => {
  it.each([
    ["7891000315507", "7891000315507"],
    ["96385074", "96385074"],
    ["036000291452", "036000291452"],
    ["10012345678902", "10012345678902"],
    [" 7891000315507 ", "7891000315507"],
  ])("aceita %j", (entrada, valor) => {
    expect(validarGtinFiscal(entrada)).toEqual({ ok: true, valor });
  });

  it.each([[""], ["   "], [null], [undefined]])("vazio %j vira SEM GTIN (valor null)", (entrada) => {
    expect(validarGtinFiscal(entrada)).toEqual({ ok: true, valor: null });
  });

  it.each([
    ["2000000000015", "uso_interno"],
    ["2001234567893", "uso_interno"],
    ["7891000315508", "digito_verificador"],
    ["0000000000000", "zerado"],
    ["00000000", "zerado"],
    ["789100031550", "digito_verificador"],
    ["1234567", "formato"],
    ["123456789", "formato"],
    ["12345678901", "formato"],
    ["123456789012345", "formato"],
    ["78910003155A7", "formato"],
  ])("rejeita %j com erro %s", (entrada, erro) => {
    const r = validarGtinFiscal(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBe(erro);
      expect(r.mensagem).toMatch(/GTIN/);
    }
  });

  it("o EAN interno gerado nunca passa como GTIN fiscal, nem disfarçado de GTIN-14 com zero à esquerda", () => {
    for (const s of [1, 500, 999_999_999]) {
      const ean = gerarEan13Interno(s);
      expect(validarGtinFiscal(ean).ok).toBe(false);
      const gtin14 = "0" + ean;
      expect(validarDigitoGs1(gtin14)).toBe(true);
      expect(validarGtinFiscal(gtin14)).toMatchObject({ ok: false, erro: "uso_interno" });
    }
  });

  it.each([
    ["02001234567893", "uso_interno"], // EAN-13 com 2 na forma GTIN-14
    ["02000000000015", "uso_interno"],
  ])("rejeita %j (forma canônica de 14 dígitos começa com 02)", (entrada, erro) => {
    expect(validarGtinFiscal(entrada)).toMatchObject({ ok: false, erro });
  });

  it.each([
    ["07891000315507"], // GTIN-14 de um EAN-13 comum
    ["17891000315504"], // indicador 1: embalagem de um EAN-13 comum
    ["0036000291452"], // UPC-A em 13 dígitos
  ])("aceita %j com zeros à esquerda ou indicador", (entrada) => {
    expect(validarGtinFiscal(entrada)).toEqual({ ok: true, valor: entrada });
  });

  // pergunta em aberto: ainda NÃO rejeitamos GTIN-12 com 2 nem GTIN-8 com 0 ou 2
  it.each([["200000000004"], ["20000004"]])("por ora aceita %j (GTIN-12/8 com 2)", (entrada) => {
    expect(validarGtinFiscal(entrada).ok).toBe(true);
  });

  it("normalizarGtin tira espaços", () => {
    expect(normalizarGtin(" 789 1000 315507 ")).toBe("7891000315507");
  });
});

describe("ehEan13Valido e ehGtinValido", () => {
  it.each([
    ["7891000315507", true, true],
    ["2000000000015", true, true],
    ["96385074", false, true],
    ["036000291452", false, true],
    ["10012345678902", false, true],
    ["7891000315508", false, false],
    ["ABC123", false, false],
    ["", false, false],
  ])("%j → EAN-13 %s, GTIN %s", (codigo, ean13, gtin) => {
    expect(ehEan13Valido(codigo)).toBe(ean13);
    expect(ehGtinValido(codigo)).toBe(gtin);
  });
});

describe("escolherCodigoEtiqueta", () => {
  it("prefere o EAN de fabricante", () => {
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [
          { codigo: "2000000000015", tipo: "interno", fator: "1" },
          { codigo: "7891000315507", tipo: "fabricante", fator: "1" },
        ],
      }),
    ).toEqual({ simbologia: "ean13", valor: "7891000315507" });
  });

  it("aceita EAN-8 e UPC-A de fabricante", () => {
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [{ codigo: "96385074", tipo: "fabricante", fator: "1" }],
      }),
    ).toEqual({ simbologia: "ean8", valor: "96385074" });
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [{ codigo: "036000291452", tipo: "fabricante", fator: "1" }],
      }),
    ).toEqual({ simbologia: "upca", valor: "036000291452" });
  });

  it("sem fabricante válido, usa o EAN interno", () => {
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [
          { codigo: "7891000315508", tipo: "fabricante", fator: "1" },
          { codigo: "2000000000015", tipo: "interno", fator: "1" },
        ],
      }),
    ).toEqual({ simbologia: "ean13", valor: "2000000000015" });
  });

  it("ignora código de embalagem e código com fator diferente de 1", () => {
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [
          { codigo: "7891000315507", tipo: "embalagem", fator: "10" },
          { codigo: "7894900011517", tipo: "fabricante", fator: "12.0000" },
        ],
      }),
    ).toEqual({ simbologia: "code128", valor: "000123" });
  });

  it("sem nenhum código de barras, gera Code128 do código interno", () => {
    expect(escolherCodigoEtiqueta({ codigoInterno: "CG160-REL", codigosBarras: [] })).toEqual({
      simbologia: "code128",
      valor: "CG160-REL",
    });
  });

  it("entre vários fabricantes válidos, fica com o primeiro da lista", () => {
    expect(
      escolherCodigoEtiqueta({
        codigoInterno: "000123",
        codigosBarras: [
          { codigo: "7894900011517", tipo: "fabricante", fator: "1.0000" },
          { codigo: "7891000315507", tipo: "fabricante", fator: "1" },
        ],
      }),
    ).toEqual({ simbologia: "ean13", valor: "7894900011517" });
  });
});
