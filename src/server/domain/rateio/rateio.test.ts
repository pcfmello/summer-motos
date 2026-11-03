import { describe, expect, it } from "vitest";
import { Decimal, somar } from "../decimal";
import { calcularTotaisDocumento, calcularTotalItem, ratearDesconto, ratearProporcional } from "./index";

const str = (valores: Decimal[]) => valores.map((v) => v.toFixed(2));

describe("calcularTotalItem", () => {
  it.each([
    ["2", "10.00", "0", "20.00", "20.00"],
    ["3", "3.33", "0", "9.99", "9.99"],
    ["1.5", "10.33", "0", "15.50", "15.50"], // 15.495 → 15.50 (half-up)
    ["0.3333", "10", "0", "3.33", "3.33"], // 3.333 → 3.33
    ["2", "10.00", "5.00", "20.00", "15.00"],
    ["1", "10.00", "10.00", "10.00", "0.00"],
    ["0.125", "1.00", "0", "0.13", "0.13"], // 0.125 → 0.13
  ])("%s × %s − %s → bruto %s, total %s", (quantidade, precoUnitario, desconto, bruto, total) => {
    const r = calcularTotalItem({ quantidade, precoUnitario, desconto });
    expect(r.bruto.toFixed(2)).toBe(bruto);
    expect(r.desconto.toFixed(2)).toBe(new Decimal(desconto).toFixed(2));
    expect(r.total.toFixed(2)).toBe(total);
  });

  it("desconto é opcional", () => {
    expect(calcularTotalItem({ quantidade: "2", precoUnitario: "1.25" }).total.toFixed(2)).toBe("2.50");
  });

  it.each([
    [{ quantidade: "1", precoUnitario: "10", desconto: "10.01" }, /desconto do item/i],
    [{ quantidade: "1", precoUnitario: "10", desconto: "-1" }, /desconto do item/i],
    [{ quantidade: "0", precoUnitario: "10" }, /quantidade/i],
    [{ quantidade: "-1", precoUnitario: "10" }, /quantidade/i],
    [{ quantidade: "1", precoUnitario: "-0.01" }, /preço/i],
  ])("rejeita %j", (entrada, mensagem) => {
    expect(() => calcularTotalItem(entrada)).toThrow(mensagem);
  });

  // NF-e: vProd = qCom × vUnCom com os valores gravados (preço numeric(14,2), quantidade numeric(14,4))
  it.each([
    [{ quantidade: "10", precoUnitario: "1.005" }, /preço unitário.*2 casas/i],
    [{ quantidade: "1", precoUnitario: "0.001" }, /preço unitário.*2 casas/i],
    [{ quantidade: "1.00005", precoUnitario: "10" }, /quantidade.*4 casas/i],
    [{ quantidade: "0.33333", precoUnitario: "10" }, /quantidade.*4 casas/i],
  ])("rejeita casas demais em %j", (entrada, mensagem) => {
    expect(() => calcularTotalItem(entrada)).toThrow(mensagem);
  });

  it("zeros à direita não contam como casas (string do numeric)", () => {
    expect(calcularTotalItem({ quantidade: "2.50000000", precoUnitario: "4.0000" }).total.toFixed(2)).toBe("10.00");
  });
});

describe("ratearProporcional", () => {
  it.each([
    // [total, pesos, esperado]
    ["10.00", ["100.00", "100.00", "100.00"], ["3.34", "3.33", "3.33"]], // sobra 0.01 → primeiro (empate)
    ["10.00", ["50.00", "100.00", "50.00"], ["2.50", "5.00", "2.50"]],
    ["1.00", ["1.00", "1.00", "1.00"], ["0.34", "0.33", "0.33"]],
    ["0.02", ["1.00", "1.00", "1.00"], ["0.00", "0.01", "0.01"]], // 0.0067 → 0.01 cada; sobra −0.01 vai para o maior (primeiro)
    ["5.00", ["30.00"], ["5.00"]],
    ["0.00", ["30.00", "20.00"], ["0.00", "0.00"]],
    ["10.00", ["0.00", "40.00", "60.00"], ["0.00", "4.00", "6.00"]],
    ["0.10", ["33.33", "33.33", "33.34"], ["0.03", "0.03", "0.04"]],
    ["7.77", ["10.00", "20.00", "70.00"], ["0.78", "1.55", "5.44"]],
  ])("rateia %s por %j", (total, pesos, esperado) => {
    const r = ratearProporcional(total, pesos);
    expect(str(r)).toEqual(esperado);
    expect(somar(r).toFixed(2)).toBe(new Decimal(total).toFixed(2));
  });

  it("a diferença de centavos vai para o maior peso, não para o primeiro", () => {
    const r = ratearProporcional("10.00", ["100.00", "100.00", "100.01"]);
    expect(str(r)).toEqual(["3.33", "3.33", "3.34"]);
  });

  it("lista vazia com total zero devolve lista vazia", () => {
    expect(ratearProporcional("0", [])).toEqual([]);
  });

  it.each([
    ["1.00", [] as string[], /sem itens/i],
    ["1.00", ["0.00", "0.00"], /valor zero/i],
    ["-1.00", ["10.00"], /negativo/i],
    ["1.00", ["10.00", "-1.00"], /negativo/i],
  ])("rejeita total %s com pesos %j", (total, pesos, mensagem) => {
    expect(() => ratearProporcional(total, pesos)).toThrow(mensagem);
  });

  it("frete pode ser maior que o valor dos itens", () => {
    const r = ratearProporcional("100.00", ["10.00", "30.00"]);
    expect(str(r)).toEqual(["25.00", "75.00"]);
  });

  it("aceita outro número de casas (custo)", () => {
    const r = ratearProporcional("1", ["1", "1", "1"], 6);
    expect(r.map((v) => v.toFixed(6))).toEqual(["0.333334", "0.333333", "0.333333"]);
  });
});

describe("ratearDesconto (regra 4.10)", () => {
  it.each([
    ["0.00", ["10.00", "20.00"], ["0.00", "0.00"]],
    ["3.00", ["50.00"], ["3.00"]],
    ["10.00", ["10.00", "20.00", "70.00"], ["1.00", "2.00", "7.00"]],
    ["100.00", ["10.00", "20.00", "70.00"], ["10.00", "20.00", "70.00"]], // desconto igual ao total
    ["5.00", ["0.00", "15.00", "15.00"], ["0.00", "2.50", "2.50"]],
    ["0.01", ["1.00", "1.00", "1.00"], ["0.01", "0.00", "0.00"]],
  ])("desconto %s sobre %j", (desconto, valores, esperado) => {
    const r = ratearDesconto(desconto, valores);
    expect(str(r)).toEqual(esperado);
    expect(somar(r).toFixed(2)).toBe(new Decimal(desconto).toFixed(2));
  });

  it("nenhum item recebe desconto maior que o próprio valor", () => {
    const valores = ["0.01", "0.01", "0.01", "99.97"];
    for (const desconto of ["0.03", "50.00", "99.99", "100.00"]) {
      const r = ratearDesconto(desconto, valores);
      r.forEach((d, i) => expect(d.lte(valores[i])).toBe(true));
      expect(somar(r).toFixed(2)).toBe(new Decimal(desconto).toFixed(2));
    }
  });

  it("invariantes em 500 casos pseudoaleatórios: soma exata e desconto ≤ valor do item", () => {
    let semente = 20261103;
    const aleatorio = (max: number) => {
      semente = (semente * 48271) % 2147483647; // Park-Miller, cabe em number sem perda
      return semente % max;
    };
    for (let caso = 0; caso < 500; caso++) {
      const n = 1 + aleatorio(8);
      const valores = Array.from({ length: n }, () => new Decimal(aleatorio(5000)).div(100));
      const total = somar(valores);
      const desconto = total.mul(aleatorio(101)).div(100).toDecimalPlaces(2);
      const r = ratearDesconto(desconto, valores);
      expect(somar(r).toFixed(2)).toBe(desconto.toFixed(2));
      r.forEach((d, i) => {
        expect(d.gte(0)).toBe(true);
        expect(d.lte(valores[i])).toBe(true);
      });
    }
  });

  it.each([
    ["30.01", ["10.00", "20.00"], /maior que o total/i],
    ["0.01", ["0.00"], /maior que o total/i],
    ["-0.01", ["10.00"], /negativo/i],
    ["1.00", [] as string[], /maior que o total/i],
  ])("rejeita desconto %s sobre %j", (desconto, valores, mensagem) => {
    expect(() => ratearDesconto(desconto, valores)).toThrow(mensagem);
  });

  it("valores desiguais: a sobra pode deixar o maior item com menos desconto que os outros", () => {
    // cada parte arredonda para 0,01 (soma 0,05); o −0,02 sai do maior (1,01) e, no limite de zero, do próximo
    expect(str(ratearDesconto("0.03", ["1.01", "1.00", "1.00", "1.00", "1.00"]))).toEqual([
      "0.00",
      "0.00",
      "0.01",
      "0.01",
      "0.01",
    ]);
  });

  it("aceita desconto com mais de 2 casas arredondando antes (half-up)", () => {
    // 1.005 → 1.01; cada metade 0.505 → 0.51 (soma 1.02); o −0.01 vai para o primeiro (empate)
    expect(str(ratearDesconto("1.005", ["10.00", "10.00"]))).toEqual(["0.50", "0.51"]);
  });
});

describe("calcularTotaisDocumento", () => {
  it("aplica desconto do item, rateia o desconto do documento e fecha os totais", () => {
    const r = calcularTotaisDocumento({
      itens: [
        { quantidade: "2", precoUnitario: "45.90", desconto: "1.80" }, // 91.80 − 1.80 = 90.00
        { quantidade: "1", precoUnitario: "30.00" }, // 30.00
        { quantidade: "0.5", precoUnitario: "39.90" }, // 19.95
      ],
      descontoDocumento: "14.00",
    });

    expect(r.itens.map((i) => i.total.toFixed(2))).toEqual(["90.00", "30.00", "19.95"]);
    expect(r.itens.map((i) => i.descontoRateado.toFixed(2))).toEqual(["9.00", "3.00", "2.00"]);
    expect(r.itens.map((i) => i.totalLiquido.toFixed(2))).toEqual(["81.00", "27.00", "17.95"]);
    expect(r.totalBruto.toFixed(2)).toBe("141.75");
    expect(r.totalDescontoItens.toFixed(2)).toBe("1.80");
    expect(r.subtotal.toFixed(2)).toBe("139.95");
    expect(r.descontoDocumento.toFixed(2)).toBe("14.00");
    expect(r.total.toFixed(2)).toBe("125.95");
    expect(somar(r.itens.map((i) => i.totalLiquido)).toFixed(2)).toBe(r.total.toFixed(2));
  });

  it("sem desconto de documento", () => {
    const r = calcularTotaisDocumento({ itens: [{ quantidade: "1", precoUnitario: "10" }] });
    expect(r.total.toFixed(2)).toBe("10.00");
    expect(r.itens[0].descontoRateado.toFixed(2)).toBe("0.00");
  });

  it("documento sem itens e sem desconto tem total zero", () => {
    const r = calcularTotaisDocumento({ itens: [] });
    expect(r.total.toFixed(2)).toBe("0.00");
    expect(r.itens).toEqual([]);
  });

  it("rejeita item com casas demais no preço ou na quantidade", () => {
    expect(() =>
      calcularTotaisDocumento({ itens: [{ quantidade: "1", precoUnitario: "10" }, { quantidade: "10", precoUnitario: "1.005" }] }),
    ).toThrow(/preço unitário.*2 casas/i);
    expect(() => calcularTotaisDocumento({ itens: [{ quantidade: "0.12345", precoUnitario: "10" }] })).toThrow(
      /quantidade.*4 casas/i,
    );
  });

  it("desconto do documento maior que o subtotal é erro", () => {
    expect(() =>
      calcularTotaisDocumento({ itens: [{ quantidade: "1", precoUnitario: "10" }], descontoDocumento: "10.01" }),
    ).toThrow(/maior que o total/i);
  });
});
