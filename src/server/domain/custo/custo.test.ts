import { describe, expect, it } from "vitest";
import { Decimal, somar } from "../decimal";
import {
  calcularCustoEntradaManual,
  calcularCustoEntradaUnitario,
  calcularCustoMedio,
  converterParaUnidadeEstoque,
  ratearFrete,
} from "./index";

describe("calcularCustoMedio (regra 4.5)", () => {
  it.each([
    // saldoAntes, custoMedioAtual, quantidadeEntrada, custoEntrada, esperado
    ["10", "5.000000", "10", "7.000000", "6.000000"],
    ["3", "10", "1", "12", "10.500000"],
    ["1", "1", "2", "2", "1.666667"],
    ["0.5", "40", "1.5", "44", "43.000000"],
    ["100", "2.50", "0.0001", "1000", "2.500997"],
    ["5", "8", "5", "0", "4.000000"], // bonificação com custo zero
  ])(
    "saldo %s a %s + entrada %s a %s → %s",
    (saldoAntes, custoMedioAtual, quantidadeEntrada, custoEntrada, esperado) => {
      expect(
        calcularCustoMedio({ saldoAntes, custoMedioAtual, quantidadeEntrada, custoEntrada }).toFixed(6),
      ).toBe(esperado);
    },
  );

  it.each([
    ["0", "5"],
    ["-3", "5"],
    ["-0.0001", "999"],
  ])("saldo %s (≤ 0) antes da entrada → custo da entrada", (saldoAntes, custoMedioAtual) => {
    expect(
      calcularCustoMedio({ saldoAntes, custoMedioAtual, quantidadeEntrada: "4", custoEntrada: "12.345678" }).toFixed(6),
    ).toBe("12.345678");
  });

  it("arredonda o custo da entrada em 6 casas quando o saldo é ≤ 0", () => {
    expect(
      calcularCustoMedio({ saldoAntes: "0", custoMedioAtual: "0", quantidadeEntrada: "3", custoEntrada: "1.23456789" }).toFixed(
        6,
      ),
    ).toBe("1.234568");
  });

  it.each([
    [{ saldoAntes: "1", custoMedioAtual: "1", quantidadeEntrada: "0", custoEntrada: "1" }, /quantidade/i],
    [{ saldoAntes: "1", custoMedioAtual: "1", quantidadeEntrada: "-1", custoEntrada: "1" }, /quantidade/i],
    [{ saldoAntes: "1", custoMedioAtual: "1", quantidadeEntrada: "1", custoEntrada: "-0.01" }, /custo/i],
    [{ saldoAntes: "1", custoMedioAtual: "-1", quantidadeEntrada: "1", custoEntrada: "1" }, /custo médio/i],
  ])("rejeita %j", (entrada, mensagem) => {
    expect(() => calcularCustoMedio(entrada)).toThrow(mensagem);
  });
});

describe("converterParaUnidadeEstoque (regra 4.6)", () => {
  it.each([
    ["2", "10", "20.0000"], // 2 CX com 10 → 20 UN
    ["1", "1", "1.0000"],
    ["3", "0.5", "1.5000"], // 3 frascos de 500 ml em LT
    ["1.5", "12", "18.0000"],
    ["0.33333", "1", "0.3333"],
  ])("%s × fator %s → %s", (quantidade, fator, esperado) => {
    expect(converterParaUnidadeEstoque(quantidade, fator).toFixed(4)).toBe(esperado);
  });

  it.each([
    ["0", "10", /quantidade/i],
    ["-1", "10", /quantidade/i],
    ["1", "0", /fator/i],
    ["1", "-2", /fator/i],
  ])("rejeita %s × %s", (quantidade, fator, mensagem) => {
    expect(() => converterParaUnidadeEstoque(quantidade, fator)).toThrow(mensagem);
  });
});

describe("calcularCustoEntradaUnitario", () => {
  it("soma IPI, ST, frete, seguro e outras, desconta e divide pela quantidade convertida", () => {
    // 2 CX × 10 UN; 200 + 10 + 15 + 8 + 2 + 1 − 16 = 220 → 220 ÷ 20 = 11
    const r = calcularCustoEntradaUnitario({
      valorItem: "200.00",
      ipi: "10.00",
      st: "15.00",
      frete: "8.00",
      seguro: "2.00",
      outrasDespesas: "1.00",
      desconto: "16.00",
      quantidade: "2",
      fator: "10",
    });
    expect(r.quantidadeEstoque.toFixed(4)).toBe("20.0000");
    expect(r.custoTotal.toFixed(2)).toBe("220.00");
    expect(r.custoUnitario.toFixed(6)).toBe("11.000000");
  });

  it("componentes opcionais valem zero e o fator padrão é 1", () => {
    const r = calcularCustoEntradaUnitario({ valorItem: "10.00", quantidade: "3" });
    expect(r.quantidadeEstoque.toFixed(4)).toBe("3.0000");
    expect(r.custoUnitario.toFixed(6)).toBe("3.333333");
  });

  it("quantidade fracionada (óleo em litro)", () => {
    const r = calcularCustoEntradaUnitario({ valorItem: "89.70", quantidade: "6", fator: "0.5" });
    expect(r.quantidadeEstoque.toFixed(4)).toBe("3.0000");
    expect(r.custoUnitario.toFixed(6)).toBe("29.900000");
  });

  it("custo zero (bonificação) é aceito", () => {
    const r = calcularCustoEntradaUnitario({ valorItem: "10.00", desconto: "10.00", quantidade: "1" });
    expect(r.custoUnitario.toFixed(6)).toBe("0.000000");
  });

  it.each([
    [{ valorItem: "10", desconto: "10.01", quantidade: "1" }, /negativo/i],
    [{ valorItem: "-1", quantidade: "1" }, /valor do item/i],
    [{ valorItem: "10", ipi: "-1", quantidade: "1" }, /ipi/i],
    [{ valorItem: "10", quantidade: "0" }, /quantidade/i],
    [{ valorItem: "10", quantidade: "1", fator: "0" }, /fator/i],
  ])("rejeita %j", (entrada, mensagem) => {
    expect(() => calcularCustoEntradaUnitario(entrada)).toThrow(mensagem);
  });
});

describe("ratearFrete", () => {
  it("rateia pelo valor dos itens e fecha a soma", () => {
    const r = ratearFrete("10.00", ["100.00", "100.00", "100.00"]);
    expect(r.map((v) => v.toFixed(2))).toEqual(["3.34", "3.33", "3.33"]);
  });

  it("frete zero não distribui nada", () => {
    expect(ratearFrete("0", ["10", "20"]).map((v) => v.toFixed(2))).toEqual(["0.00", "0.00"]);
  });
});

describe("calcularCustoEntradaManual", () => {
  it("sem frete, o custo é o informado convertido para a unidade de estoque", () => {
    const r = calcularCustoEntradaManual({
      itens: [
        { quantidade: "2", fator: "10", custoUnitario: "50.00" }, // CX com 10 a R$ 50 → R$ 5/UN
        { quantidade: "3", custoUnitario: "7.333333" },
      ],
    });
    expect(r.itens.map((i) => i.quantidadeEstoque.toFixed(4))).toEqual(["20.0000", "3.0000"]);
    expect(r.itens.map((i) => i.freteRateado.toFixed(2))).toEqual(["0.00", "0.00"]);
    expect(r.itens.map((i) => i.custoUnitarioEstoque.toFixed(6))).toEqual(["5.000000", "7.333333"]);
  });

  it("rateia o frete total pelo valor dos itens e soma ao custo", () => {
    const r = calcularCustoEntradaManual({
      itens: [
        { quantidade: "10", custoUnitario: "8.00" }, // valor 80
        { quantidade: "1", fator: "4", custoUnitario: "20.00" }, // valor 20, 4 UN
      ],
      freteTotal: "10.00",
    });
    expect(r.itens.map((i) => i.valorItem.toFixed(2))).toEqual(["80.00", "20.00"]);
    expect(r.itens.map((i) => i.freteRateado.toFixed(2))).toEqual(["8.00", "2.00"]);
    // (80 + 8) ÷ 10 = 8.80; (20 + 2) ÷ 4 = 5.50
    expect(r.itens.map((i) => i.custoUnitarioEstoque.toFixed(6))).toEqual(["8.800000", "5.500000"]);
    expect(somar(r.itens.map((i) => i.freteRateado)).toFixed(2)).toBe("10.00");
  });

  it("frete com itens de custo zero e outros não", () => {
    const r = calcularCustoEntradaManual({
      itens: [
        { quantidade: "1", custoUnitario: "0" },
        { quantidade: "2", custoUnitario: "5" },
      ],
      freteTotal: "1.00",
    });
    expect(r.itens.map((i) => i.freteRateado.toFixed(2))).toEqual(["0.00", "1.00"]);
    expect(r.itens.map((i) => i.custoUnitarioEstoque.toFixed(6))).toEqual(["0.000000", "5.500000"]);
  });

  it("frete com todos os itens de custo zero é erro", () => {
    expect(() =>
      calcularCustoEntradaManual({ itens: [{ quantidade: "1", custoUnitario: "0" }], freteTotal: "5" }),
    ).toThrow(/valor zero/i);
  });

  it("rejeita custo unitário negativo", () => {
    expect(() => calcularCustoEntradaManual({ itens: [{ quantidade: "1", custoUnitario: "-1" }] })).toThrow(/custo/i);
  });

  it("mantém a precisão do custo (não arredonda o valor do item antes de dividir)", () => {
    const r = calcularCustoEntradaManual({ itens: [{ quantidade: "3", custoUnitario: "0.333333" }] });
    expect(r.itens[0].custoUnitarioEstoque.toFixed(6)).toBe("0.333333");
    expect(r.itens[0].valorItem.toFixed(2)).toBe("1.00");
    expect(Decimal.isDecimal(r.itens[0].custoUnitarioEstoque)).toBe(true);
  });
});
