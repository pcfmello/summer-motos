import { describe, expect, it } from "vitest";
import { TIPOS_MOVIMENTACAO } from "../../db/schema/estoque";
import { Decimal } from "../decimal";
import {
  ErroEstoque,
  TIPOS_MOVIMENTO,
  aplicarEntrada,
  calcularDisponivel,
  ordenarItensPorProduto,
  validarMovimento,
} from "./index";

describe("TIPOS_MOVIMENTO", () => {
  it("é a mesma lista do CHECK do banco (regra 4.2)", () => {
    expect([...TIPOS_MOVIMENTO]).toEqual([...TIPOS_MOVIMENTACAO]);
  });
});

describe("validarMovimento: tipo, sinal e casas (regra 4.2, CHECK de 6.3)", () => {
  it.each([
    ["saldo_inicial", "5"],
    ["entrada_compra", "0.0001"],
    ["entrada_manual", "10"],
    ["devolucao_cliente", "1"],
    ["saida_venda", "-1"],
    ["saida_os", "-0.5"],
    ["devolucao_fornecedor", "-2"],
    ["ajuste_manual", "-3"],
    ["ajuste_manual", "3"],
    ["ajuste_inventario", "-1.25"],
    ["ajuste_inventario", "4"],
    ["estorno", "-1"],
    ["estorno", "1"],
  ] as const)("%s com %s é válido", (tipo, quantidade) => {
    expect(validarMovimento({ tipo, quantidade, custoUnitario: "1" })).toEqual({ ok: true });
  });

  it.each([
    ["saldo_inicial", "-5"],
    ["entrada_compra", "-1"],
    ["entrada_manual", "-0.0001"],
    ["devolucao_cliente", "-1"],
    ["saida_venda", "1"],
    ["saida_os", "0.5"],
    ["devolucao_fornecedor", "2"],
  ] as const)("%s com %s tem o sinal errado", (tipo, quantidade) => {
    expect(validarMovimento({ tipo, quantidade, custoUnitario: "1" })).toMatchObject({ ok: false, erro: "sinal" });
  });

  it.each(["saldo_inicial", "saida_venda", "ajuste_manual", "estorno"] as const)("%s com quantidade zero é recusado", (tipo) => {
    expect(validarMovimento({ tipo, quantidade: "0", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "quantidade_zero",
    });
    expect(validarMovimento({ tipo, quantidade: "-0.0000", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "quantidade_zero",
    });
  });

  it("recusa tipo desconhecido", () => {
    expect(validarMovimento({ tipo: "saida_balcao" as never, quantidade: "1", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "tipo",
    });
  });

  it("recusa quantidade com mais de 4 casas e custo com mais de 6 (não arredonda em silêncio)", () => {
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1.00001", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "casas_quantidade",
    });
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1", custoUnitario: "1.0000001" })).toMatchObject({
      ok: false,
      erro: "casas_custo",
    });
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1.1234", custoUnitario: "1.123456" })).toEqual({
      ok: true,
    });
  });

  it("recusa custo negativo e texto que não é número", () => {
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1", custoUnitario: "-0.01" })).toMatchObject({
      ok: false,
      erro: "custo_negativo",
    });
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1,5", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "formato",
    });
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1", custoUnitario: "abc" })).toMatchObject({
      ok: false,
      erro: "formato",
    });
  });

  it("saldo inicial aceita custo nulo (D25 do modelo, D026); entradas de compra e manual exigem custo", () => {
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1", custoUnitario: null })).toEqual({ ok: true });
    expect(validarMovimento({ tipo: "entrada_compra", quantidade: "1", custoUnitario: null })).toMatchObject({
      ok: false,
      erro: "custo_obrigatorio",
    });
    expect(validarMovimento({ tipo: "entrada_manual", quantidade: "1", custoUnitario: null })).toMatchObject({
      ok: false,
      erro: "custo_obrigatorio",
    });
  });

  it("recusa valores acima do limite das colunas (numeric(14,4) e numeric(16,6))", () => {
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "10000000000", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "limite",
    });
    expect(validarMovimento({ tipo: "saida_venda", quantidade: "-10000000000", custoUnitario: "1" })).toMatchObject({
      ok: false,
      erro: "limite",
    });
    expect(validarMovimento({ tipo: "saldo_inicial", quantidade: "1", custoUnitario: "10000000000" })).toMatchObject({
      ok: false,
      erro: "limite",
    });
    expect(
      validarMovimento({ tipo: "saldo_inicial", quantidade: "9999999999.9999", custoUnitario: "9999999999.999999" }),
    ).toEqual({ ok: true });
  });

  it("aceita Decimal além de string", () => {
    expect(
      validarMovimento({ tipo: "saida_venda", quantidade: new Decimal("-2"), custoUnitario: new Decimal("3.5") }),
    ).toEqual({ ok: true });
  });
});

describe("calcularDisponivel (regra 4.2)", () => {
  it.each([
    ["10", "3", "7.0000"],
    ["5", "5", "0.0000"],
    ["2.5", "0.75", "1.7500"],
    ["-2", "0", "-2.0000"],
  ])("quantidade %s − reservada %s = %s", (quantidade, reservada, esperado) => {
    expect(calcularDisponivel(quantidade, reservada).toFixed(4)).toBe(esperado);
  });

  it("rejeita reserva negativa", () => {
    expect(() => calcularDisponivel("10", "-1")).toThrow(/reservada/i);
  });
});

describe("aplicarEntrada (regras 4.2 e 4.5, D25 do modelo)", () => {
  const saldoVazio = { quantidade: "0", custoMedio: null, ultimoCusto: null };

  it("primeira entrada com custo: médio e último custo = custo da entrada", () => {
    const r = aplicarEntrada(saldoVazio, { quantidade: "10", custoUnitario: "12.5" });
    expect(r.quantidade.toFixed(4)).toBe("10.0000");
    expect(r.custoMedio?.toFixed(6)).toBe("12.500000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("12.500000");
  });

  it("segunda entrada recalcula o médio ponderado", () => {
    const r = aplicarEntrada(
      { quantidade: "10.0000", custoMedio: "5.000000", ultimoCusto: "5.000000" },
      { quantidade: "10", custoUnitario: "7" },
    );
    expect(r.quantidade.toFixed(4)).toBe("20.0000");
    expect(r.custoMedio?.toFixed(6)).toBe("6.000000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("7.000000");
  });

  it("arredonda o médio em 6 casas (half-up)", () => {
    const r = aplicarEntrada(
      { quantidade: "1", custoMedio: "1", ultimoCusto: "1" },
      { quantidade: "2", custoUnitario: "2" },
    );
    expect(r.custoMedio?.toFixed(6)).toBe("1.666667");
  });

  it("saldo ≤ 0 antes da entrada: médio = custo da entrada", () => {
    for (const quantidade of ["0", "-3"]) {
      const r = aplicarEntrada(
        { quantidade, custoMedio: "99", ultimoCusto: "99" },
        { quantidade: "4", custoUnitario: "10" },
      );
      expect(r.custoMedio?.toFixed(6)).toBe("10.000000");
    }
    const negativo = aplicarEntrada(
      { quantidade: "-3", custoMedio: "99", ultimoCusto: "99" },
      { quantidade: "4", custoUnitario: "10" },
    );
    expect(negativo.quantidade.toFixed(4)).toBe("1.0000");
  });

  it("médio nulo com saldo positivo é tratado como saldo ≤ 0: vale o custo da entrada", () => {
    const r = aplicarEntrada(
      { quantidade: "8", custoMedio: null, ultimoCusto: null },
      { quantidade: "2", custoUnitario: "3.25" },
    );
    expect(r.custoMedio?.toFixed(6)).toBe("3.250000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("3.250000");
  });

  it("entrada sem custo num saldo sem custo: tudo continua nulo", () => {
    const r = aplicarEntrada(saldoVazio, { quantidade: "3", custoUnitario: null });
    expect(r.quantidade.toFixed(4)).toBe("3.0000");
    expect(r.custoMovimento).toBeNull();
    expect(r.custoMedio).toBeNull();
    expect(r.ultimoCusto).toBeNull();
  });

  it("entrada sem custo num saldo positivo com médio: entra pelo médio atual (D026), que não muda", () => {
    const r = aplicarEntrada(
      { quantidade: "5", custoMedio: "4.000000", ultimoCusto: "4.500000" },
      { quantidade: "5", custoUnitario: null },
    );
    expect(r.quantidade.toFixed(4)).toBe("10.0000");
    expect(r.custoMovimento?.toFixed(6)).toBe("4.000000");
    expect(r.custoMedio?.toFixed(6)).toBe("4.000000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("4.500000");
  });

  it("entrada sem custo com saldo ≤ 0: entra pelo último custo (13.7 do modelo), que não muda", () => {
    const r = aplicarEntrada(
      { quantidade: "0", custoMedio: "4.000000", ultimoCusto: "4.500000" },
      { quantidade: "2", custoUnitario: null },
    );
    expect(r.custoMovimento?.toFixed(6)).toBe("4.500000");
    expect(r.custoMedio?.toFixed(6)).toBe("4.500000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("4.500000");
  });

  it("entrada sem custo com saldo positivo e médio nulo: usa o último custo se houver, senão nulo", () => {
    const comUltimo = aplicarEntrada(
      { quantidade: "3", custoMedio: null, ultimoCusto: "7" },
      { quantidade: "1", custoUnitario: null },
    );
    expect(comUltimo.custoMovimento?.toFixed(6)).toBe("7.000000");
    expect(comUltimo.custoMedio?.toFixed(6)).toBe("7.000000");
    const semNada = aplicarEntrada({ quantidade: "3", custoMedio: null, ultimoCusto: null }, { quantidade: "1", custoUnitario: null });
    expect(semNada.custoMovimento).toBeNull();
    expect(semNada.custoMedio).toBeNull();
  });

  it("entrada com custo: o custo do movimento é o informado", () => {
    const r = aplicarEntrada(saldoVazio, { quantidade: "1", custoUnitario: "2.5" });
    expect(r.custoMovimento?.toFixed(6)).toBe("2.500000");
  });

  it("recusa saldo após acima do limite de numeric(14,4)", () => {
    expect(() =>
      aplicarEntrada({ quantidade: "9999999999", custoMedio: null, ultimoCusto: null }, { quantidade: "1", custoUnitario: null }),
    ).toThrow(/limite/i);
  });

  it("custo zero (bonificação) é custo conhecido", () => {
    const r = aplicarEntrada(
      { quantidade: "5", custoMedio: "8", ultimoCusto: "8" },
      { quantidade: "5", custoUnitario: "0" },
    );
    expect(r.custoMedio?.toFixed(6)).toBe("4.000000");
    expect(r.ultimoCusto?.toFixed(6)).toBe("0.000000");
  });

  it("rejeita quantidade ≤ 0 e custo negativo", () => {
    expect(() => aplicarEntrada(saldoVazio, { quantidade: "0", custoUnitario: "1" })).toThrow(/quantidade/i);
    expect(() => aplicarEntrada(saldoVazio, { quantidade: "-1", custoUnitario: "1" })).toThrow(/quantidade/i);
    expect(() => aplicarEntrada(saldoVazio, { quantidade: "1", custoUnitario: "-1" })).toThrow(/custo/i);
  });
});

describe("ordenarItensPorProduto (seção 13.1: travas em ordem de produto_id)", () => {
  const A = "0b4e8f8a-0000-4000-8000-000000000001";
  const B = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const C = "f47ac10b-58cc-4372-a567-0e02b2c3d479";

  it("ordena como o Postgres ordena uuid (texto minúsculo) e normaliza a caixa", () => {
    const itens = [{ produtoId: C.toUpperCase() }, { produtoId: A }, { produtoId: B }];
    expect(ordenarItensPorProduto(itens).map((i) => i.produtoId)).toEqual([A, B, C]);
  });

  it("não altera a lista recebida", () => {
    const itens = [{ produtoId: C }, { produtoId: A }];
    ordenarItensPorProduto(itens);
    expect(itens.map((i) => i.produtoId)).toEqual([C, A]);
  });

  it("recusa produto repetido (inclusive com caixa diferente) com ErroEstoque", () => {
    const repetido = () => ordenarItensPorProduto([{ produtoId: A }, { produtoId: B }, { produtoId: A.toUpperCase() }]);
    expect(repetido).toThrow(ErroEstoque);
    try {
      repetido();
    } catch (erro) {
      expect((erro as ErroEstoque).codigo).toBe("produto_repetido");
      expect((erro as ErroEstoque).produtos).toEqual([A]);
    }
  });

  it("recusa id que não é uuid", () => {
    expect(() => ordenarItensPorProduto([{ produtoId: "123" }])).toThrow(ErroEstoque);
  });
});
