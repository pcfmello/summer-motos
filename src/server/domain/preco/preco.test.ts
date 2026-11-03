import { describe, expect, it } from "vitest";
import {
  type ConfigArredondamento,
  aplicarArredondamento,
  calcularMargem,
  calcularPrecoSugerido,
  calcularPrecoTabela,
  resolverMarkup,
} from "./index";

const terminacao90Cima: ConfigArredondamento = { modo: "terminacao", centavos: "0.90", direcao: "cima" };
const terminacao90Proximo: ConfigArredondamento = { modo: "terminacao", centavos: "0.90", direcao: "proximo" };

describe("aplicarArredondamento", () => {
  it.each([
    // [config, entrada, esperado]
    [{ modo: "nenhum" }, "12.345", "12.35"],
    [{ modo: "nenhum" }, "12.344", "12.34"],

    [terminacao90Cima, "37.12", "37.90"],
    [terminacao90Cima, "37.90", "37.90"],
    [terminacao90Cima, "37.91", "38.90"],
    [terminacao90Cima, "37.899", "37.90"],
    [terminacao90Cima, "0.50", "0.90"],
    [terminacao90Cima, "10.00", "10.90"],
    [{ modo: "terminacao", centavos: "0.90" }, "37.12", "37.90"], // direção padrão: cima
    [{ modo: "terminacao", centavos: "0.99", direcao: "cima" }, "12.00", "12.99"],
    [{ modo: "terminacao", centavos: "0.00", direcao: "cima" }, "12.01", "13.00"],
    [{ modo: "terminacao", centavos: "0.00", direcao: "cima" }, "12.00", "12.00"],

    [terminacao90Proximo, "37.12", "36.90"],
    [terminacao90Proximo, "37.50", "37.90"],
    [terminacao90Proximo, "37.40", "37.90"], // empate: para cima
    [terminacao90Proximo, "37.90", "37.90"],
    [terminacao90Proximo, "0.30", "0.90"], // nunca abaixo de zero
    [{ modo: "terminacao", centavos: "0.00", direcao: "proximo" }, "0.30", "1.00"], // nunca zera um preço positivo

    [{ modo: "multiplo", centavos: "0.50", direcao: "cima" }, "12.01", "12.50"],
    [{ modo: "multiplo", centavos: "0.50", direcao: "cima" }, "12.50", "12.50"],
    [{ modo: "multiplo", centavos: "0.50", direcao: "cima" }, "12.51", "13.00"],
    [{ modo: "multiplo", centavos: "0.50" }, "12.01", "12.50"], // direção padrão: cima
    [{ modo: "multiplo", centavos: "0.50", direcao: "proximo" }, "12.24", "12.00"],
    [{ modo: "multiplo", centavos: "0.50", direcao: "proximo" }, "12.25", "12.50"],
    [{ modo: "multiplo", centavos: "0.50", direcao: "proximo" }, "0.20", "0.50"], // nunca zera um preço positivo
    [{ modo: "multiplo", centavos: "1.00", direcao: "cima" }, "12.01", "13.00"],
    [{ modo: "multiplo", centavos: "1.00", direcao: "proximo" }, "12.49", "12.00"],
    [{ modo: "multiplo", centavos: "1.00", direcao: "proximo" }, "12.50", "13.00"],
  ] as [ConfigArredondamento, string, string][])("%j: %s → %s", (config, entrada, esperado) => {
    expect(aplicarArredondamento(entrada, config).toFixed(2)).toBe(esperado);
  });

  it.each([
    [{ modo: "nenhum" }],
    [terminacao90Cima],
    [terminacao90Proximo],
    [{ modo: "multiplo", centavos: "0.50", direcao: "cima" }],
  ] as [ConfigArredondamento][])("preço zero continua zero com %j", (config) => {
    expect(aplicarArredondamento("0", config).toFixed(2)).toBe("0.00");
  });

  it.each([
    [{ modo: "terminacao", centavos: "1.00", direcao: "cima" }],
    [{ modo: "terminacao", centavos: "-0.10", direcao: "cima" }],
    [{ modo: "terminacao", centavos: "0.905", direcao: "cima" }],
    [{ modo: "multiplo", centavos: "0", direcao: "cima" }],
    [{ modo: "multiplo", centavos: "-0.50", direcao: "cima" }],
    [{ modo: "multiplo", centavos: "0.001", direcao: "cima" }],
  ] as [ConfigArredondamento][])("rejeita a config %j", (config) => {
    expect(() => aplicarArredondamento("10", config)).toThrow(/arredondamento/i);
  });

  it("rejeita preço negativo", () => {
    expect(() => aplicarArredondamento("-1", { modo: "nenhum" })).toThrow(/negativo/i);
  });
});

describe("resolverMarkup (herança da categoria)", () => {
  it.each([
    ["60", "80", { markup: "60", origem: "produto" }],
    ["0", "80", { markup: "0", origem: "produto" }], // zero é markup próprio, não herda
    [null, "80", { markup: "80", origem: "categoria" }],
    [undefined, "45.5", { markup: "45.5", origem: "categoria" }],
    ["60", null, { markup: "60", origem: "produto" }],
  ])("produto %j, categoria %j", (markupProduto, markupCategoria, esperado) => {
    const r = resolverMarkup(markupProduto, markupCategoria);
    expect(r && { markup: r.markup.toString(), origem: r.origem }).toEqual(esperado);
  });

  it("sem markup no produto nem na categoria devolve null", () => {
    expect(resolverMarkup(null, null)).toBeNull();
    expect(resolverMarkup(undefined, undefined)).toBeNull();
  });

  it("rejeita markup negativo", () => {
    expect(() => resolverMarkup("-1", null)).toThrow(/markup/i);
  });
});

describe("calcularPrecoSugerido (regra 4.9)", () => {
  it.each([
    ["25.00", "60", null, { modo: "nenhum" }, "40.00", "produto"],
    ["25.00", "60", null, terminacao90Cima, "40.90", "produto"],
    ["10.123456", "45.5", null, { modo: "nenhum" }, "14.73", "produto"], // 14.72962848
    ["10", null, "80", { modo: "nenhum" }, "18.00", "categoria"],
    ["10", "0", "80", { modo: "nenhum" }, "10.00", "produto"],
    ["0.05", "100", null, { modo: "nenhum" }, "0.10", "produto"],
  ] as [string, string | null, string | null, ConfigArredondamento, string, string][])(
    "custo %s, markup %j, categoria %j, %j → %s",
    (ultimoCusto, markupProduto, markupCategoria, arredondamento, preco, origem) => {
      const r = calcularPrecoSugerido({ ultimoCusto, markupProduto, markupCategoria, arredondamento });
      expect(r).not.toBeNull();
      expect(r!.preco.toFixed(2)).toBe(preco);
      expect(r!.origemMarkup).toBe(origem);
    },
  );

  it("sem markup resolvido não sugere preço", () => {
    expect(
      calcularPrecoSugerido({ ultimoCusto: "10", markupProduto: null, markupCategoria: null, arredondamento: { modo: "nenhum" } }),
    ).toBeNull();
  });

  it("sem último custo (zero) não sugere preço", () => {
    expect(
      calcularPrecoSugerido({ ultimoCusto: "0", markupProduto: "50", markupCategoria: null, arredondamento: terminacao90Cima }),
    ).toBeNull();
  });

  it("rejeita custo negativo", () => {
    expect(() =>
      calcularPrecoSugerido({ ultimoCusto: "-1", markupProduto: "50", markupCategoria: null, arredondamento: { modo: "nenhum" } }),
    ).toThrow(/custo/i);
  });
});

describe("calcularMargem", () => {
  it.each([
    // preço, custo, lucro, margem, markup
    ["100.00", "60.000000", "40.00", "40.0000", "66.6667"],
    ["50.00", "60", "-10.00", "-20.0000", "-16.6667"],
    ["50.00", "33.333333", "16.67", "33.3333", "50.0000"],
    ["10.00", "0", "10.00", "100.0000", null],
    ["10.00", "10", "0.00", "0.0000", "0.0000"],
  ])("preço %s, custo %s", (preco, custo, lucro, margem, markup) => {
    const r = calcularMargem({ preco, custo });
    expect(r.lucro.toFixed(2)).toBe(lucro);
    expect(r.margemPercentual?.toFixed(4) ?? null).toBe(margem);
    expect(r.markupPercentual?.toFixed(4) ?? null).toBe(markup);
  });

  it("preço zero não tem margem", () => {
    const r = calcularMargem({ preco: "0", custo: "5" });
    expect(r.margemPercentual).toBeNull();
    expect(r.lucro.toFixed(2)).toBe("-5.00");
  });

  it("rejeita valores negativos", () => {
    expect(() => calcularMargem({ preco: "-1", custo: "1" })).toThrow(/preço/i);
    expect(() => calcularMargem({ preco: "1", custo: "-1" })).toThrow(/custo/i);
  });
});

describe("calcularPrecoTabela", () => {
  const valores = { precoBase: "50.00", ultimoCusto: "10.333333", custoMedio: "9.500000" };

  it.each([
    ["preco_base", "0", "50.00"],
    ["preco_base", "-10", "45.00"],
    ["preco_base", "5.5", "52.75"],
    ["ultimo_custo", "30", "13.43"], // 13.4333329
    ["custo_medio", "20", "11.40"],
    ["custo_medio", "0", "9.50"],
  ] as const)("base %s com %s%% → %s", (base, percentual, esperado) => {
    const r = calcularPrecoTabela({ tabela: { base, percentual }, ...valores });
    expect(r).toEqual({ preco: expect.anything(), origem: "tabela" });
    expect(r!.preco.toFixed(2)).toBe(esperado);
  });

  it.each([
    ["preco_base", { precoBase: "0" }],
    ["ultimo_custo", { ultimoCusto: "0" }], // produto importado sem custo: não pode ir de graça para o canal
    ["custo_medio", { custoMedio: "0.000000" }],
  ] as const)("base %s zero e sem preço fixo → sem preço (null)", (base, zerado) => {
    expect(
      calcularPrecoTabela({ tabela: { base, percentual: "30" }, ...valores, ...zerado, arredondamento: terminacao90Cima }),
    ).toBeNull();
  });

  it("preço fixo tem prioridade mesmo com a base zero", () => {
    const r = calcularPrecoTabela({
      tabela: { base: "ultimo_custo", percentual: "30" },
      precoFixo: "19.90",
      ...valores,
      ultimoCusto: "0",
    });
    expect(r?.origem).toBe("fixo");
    expect(r?.preco.toFixed(2)).toBe("19.90");
  });

  it("o preço fixo do item tem prioridade", () => {
    const r = calcularPrecoTabela({ tabela: { base: "preco_base", percentual: "10" }, precoFixo: "25.00", ...valores });
    expect(r?.origem).toBe("fixo");
    expect(r?.preco.toFixed(2)).toBe("25.00");
  });

  it("preço fixo zero é um preço fixo, não ausência", () => {
    const r = calcularPrecoTabela({ tabela: { base: "preco_base", percentual: "10" }, precoFixo: "0", ...valores });
    expect(r?.origem).toBe("fixo");
    expect(r?.preco.toFixed(2)).toBe("0.00");
  });

  it("aplica o arredondamento opcional só ao preço calculado, nunca ao fixo", () => {
    const calculado = calcularPrecoTabela({
      tabela: { base: "ultimo_custo", percentual: "30" },
      ...valores,
      arredondamento: terminacao90Cima,
    });
    expect(calculado?.preco.toFixed(2)).toBe("13.90");

    const fixo = calcularPrecoTabela({
      tabela: { base: "ultimo_custo", percentual: "30" },
      precoFixo: "13.43",
      ...valores,
      arredondamento: terminacao90Cima,
    });
    expect(fixo?.preco.toFixed(2)).toBe("13.43");
  });

  it.each([["-100"], ["-150"]])("rejeita percentual %s (≤ −100)", (percentual) => {
    expect(() => calcularPrecoTabela({ tabela: { base: "preco_base", percentual }, ...valores })).toThrow(/percentual/i);
  });

  it("rejeita preço fixo negativo", () => {
    expect(() =>
      calcularPrecoTabela({ tabela: { base: "preco_base", percentual: "0" }, precoFixo: "-1", ...valores }),
    ).toThrow(/preço fixo/i);
  });
});
