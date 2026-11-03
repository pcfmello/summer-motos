import { describe, expect, it } from "vitest";
import { calcularDisponivel, calcularQuantidadePublicada } from "./index";

describe("calcularDisponivel", () => {
  it.each([
    ["10", "3", "7.0000"],
    ["10", "0", "10.0000"],
    ["5", "5", "0.0000"],
    ["2.5", "0.75", "1.7500"],
    ["-2", "0", "-2.0000"], // empresa que permite estoque negativo
    ["1", "3", "-2.0000"],
  ])("quantidade %s − reservada %s = %s", (quantidade, quantidadeReservada, esperado) => {
    expect(calcularDisponivel(quantidade, quantidadeReservada).toFixed(4)).toBe(esperado);
  });

  it("rejeita reserva negativa", () => {
    expect(() => calcularDisponivel("10", "-1")).toThrow(/reservada/i);
  });
});

describe("calcularQuantidadePublicada (regra 4.14)", () => {
  it.each([
    ["10", "2", "8"],
    ["10", "0", "10"],
    ["2", "2", "0"],
    ["1", "3", "0"],
    ["-5", "0", "0"],
    ["0", "0", "0"],
    ["7.5", "0", "7"], // fração não é publicada (o canal só aceita unidade inteira)
    ["7.9999", "0.5", "7"],
    ["3", "0.5", "2"],
  ])("disponível %s, segurança %s → %s", (disponivel, estoqueSeguranca, esperado) => {
    const r = calcularQuantidadePublicada({ disponivel, estoqueSeguranca });
    expect(r.toString()).toBe(esperado);
    expect(r.isInteger()).toBe(true);
    expect(r.isNegative()).toBe(false);
  });

  it("rejeita estoque de segurança negativo", () => {
    expect(() => calcularQuantidadePublicada({ disponivel: "10", estoqueSeguranca: "-1" })).toThrow(/segurança/i);
  });
});
