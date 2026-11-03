import { describe, expect, it } from "vitest";
import {
  calcularDigitosCnpj,
  normalizarCest,
  normalizarCnpj,
  normalizarCpf,
  normalizarNcm,
  normalizarPlaca,
  validarCest,
  validarCnpj,
  validarCpf,
  validarNcm,
  validarOrigem,
  validarPlaca,
} from "./index";

describe("CPF", () => {
  it.each([
    ["529.982.247-25", "52998224725"],
    ["52998224725", "52998224725"],
    [" 111.444.777-35 ", "11144477735"],
    ["390.533.447-05", "39053344705"],
  ])("aceita %j", (entrada, esperado) => {
    expect(validarCpf(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    ["529.982.247-24", "digito_verificador"],
    ["52998224735", "digito_verificador"],
    ["111.111.111-11", "sequencia_repetida"],
    ["00000000000", "sequencia_repetida"],
    ["99999999999", "sequencia_repetida"],
    ["5299822472", "formato"],
    ["529982247255", "formato"],
    ["5299822472A", "formato"],
    ["", "formato"],
  ])("rejeita %j com erro %s", (entrada, erro) => {
    const r = validarCpf(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBe(erro);
      expect(r.mensagem).toMatch(/CPF/);
    }
  });

  it("normalizarCpf tira a máscara e os espaços", () => {
    expect(normalizarCpf(" 529.982.247-25 ")).toBe("52998224725");
  });
});

describe("CNPJ numérico e alfanumérico", () => {
  it.each([
    // exemplo publicado pela Receita Federal para o CNPJ alfanumérico
    ["12.ABC.345/01DE-35", "12ABC34501DE35"],
    ["12ABC34501DE35", "12ABC34501DE35"],
    ["12abc34501de35", "12ABC34501DE35"],
    ["AB12CD34EF5602", "AB12CD34EF5602"],
    // numéricos clássicos
    ["11.222.333/0001-81", "11222333000181"],
    ["11222333000181", "11222333000181"],
    ["00.000.000/0001-91", "00000000000191"],
  ])("aceita %j", (entrada, esperado) => {
    expect(validarCnpj(entrada)).toEqual({ ok: true, valor: esperado });
  });

  it.each([
    ["12ABC34501DE36", "digito_verificador"],
    ["11222333000182", "digito_verificador"],
    ["11.222.333/0001-18", "digito_verificador"],
    ["00000000000000", "sequencia_repetida"],
    ["AAAAAAAAAAAAAA", "formato"],
    ["11111111111111", "sequencia_repetida"],
    ["12ABC34501DE3", "formato"],
    ["12ABC34501DE355", "formato"],
    // os dois DVs são sempre numéricos
    ["12ABC34501DEA5", "formato"],
    ["12ABC34501DE3A", "formato"],
    ["12ABC345@1DE35", "formato"],
    ["12ÁBC34501DE35", "formato"],
    ["", "formato"],
  ])("rejeita %j com erro %s", (entrada, erro) => {
    const r = validarCnpj(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erro).toBe(erro);
      expect(r.mensagem).toMatch(/CNPJ/);
    }
  });

  it("normalizarCnpj tira a máscara e põe em maiúsculas", () => {
    expect(normalizarCnpj(" 12.abc.345/01de-35 ")).toBe("12ABC34501DE35");
  });

  it.each([
    ["12ABC34501DE", "35"],
    ["112223330001", "81"],
    ["AB12CD34EF56", "02"],
  ])("calcularDigitosCnpj(%s) = %s", (base, dv) => {
    expect(calcularDigitosCnpj(base)).toBe(dv);
  });

  it("calcularDigitosCnpj exige 12 caracteres [0-9A-Z]", () => {
    expect(() => calcularDigitosCnpj("12ABC")).toThrow();
    expect(() => calcularDigitosCnpj("12abc34501de")).toThrow();
  });
});

describe("placa", () => {
  it.each([
    ["ABC-1234", "ABC1234", "antiga"],
    ["abc1234", "ABC1234", "antiga"],
    ["BRA2E19", "BRA2E19", "mercosul"],
    [" bra 2e19 ", "BRA2E19", "mercosul"],
    ["RIO2A18", "RIO2A18", "mercosul"],
  ])("aceita %j", (entrada, valor, padrao) => {
    expect(validarPlaca(entrada)).toEqual({ ok: true, valor, padrao });
  });

  it.each([["AB1234"], ["ABCD123"], ["1BC1234"], ["ABC12345"], ["ABCA234"], ["ABC1A2B"], [""]])(
    "rejeita %j",
    (entrada) => {
      const r = validarPlaca(entrada);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.erro).toBe("formato");
    },
  );

  it("normalizarPlaca tira hífen e espaço e põe em maiúsculas", () => {
    expect(normalizarPlaca(" bra-2e19 ")).toBe("BRA2E19");
  });
});

describe("NCM", () => {
  it.each([
    ["8714.10.00", "87141000"],
    ["87141000", "87141000"],
    [" 4011.40.00 ", "40114000"],
  ])("aceita %j", (entrada, valor) => {
    expect(validarNcm(entrada)).toEqual({ ok: true, valor });
  });

  it.each([["8714100"], ["871410000"], ["8714.10.0A"], [""]])("rejeita %j", (entrada) => {
    const r = validarNcm(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/NCM/);
  });

  it("normalizarNcm tira os pontos", () => {
    expect(normalizarNcm("8714.10.00")).toBe("87141000");
  });
});

describe("CEST", () => {
  it.each([
    ["01.075.00", "0107500"],
    ["0107500", "0107500"],
  ])("aceita %j", (entrada, valor) => {
    expect(validarCest(entrada)).toEqual({ ok: true, valor });
  });

  it.each([["010750"], ["01075000"], ["01.075.0X"], [""]])("rejeita %j", (entrada) => {
    const r = validarCest(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/CEST/);
  });

  it("normalizarCest tira os pontos", () => {
    expect(normalizarCest("01.075.00")).toBe("0107500");
  });
});

describe("origem da mercadoria", () => {
  it.each([
    [0, 0],
    [8, 8],
    ["2", 2],
    [" 5 ", 5],
  ])("aceita %j", (entrada, valor) => {
    expect(validarOrigem(entrada)).toEqual({ ok: true, valor });
  });

  it.each([[-1], [9], [1.5], ["10"], ["a"], [""], [Number.NaN]])("rejeita %j", (entrada) => {
    const r = validarOrigem(entrada);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/origem/i);
  });
});
