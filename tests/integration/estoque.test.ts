/**
 * Regras de estoque garantidas pelo banco (regras 4.2 a 4.5, seções 6 e 13 do modelo).
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  entradaItens,
  entradasEstoque,
  estoqueReservas,
  estoqueSaldos,
} from "../../src/server/db/schema";
import { erroPg, limparTabelas } from "./_banco";
import {
  abrirBanco,
  criarCenario,
  criarItemPecaOs,
  criarMovimento,
  criarOs,
  type EmpresaTeste,
} from "./_cenario";

const { pool, db } = abrirBanco();
const CHECK = "23514";
const UNIQUE = "23505";
const FK = "23503";
const IMUTAVEL = "23001";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

describe("movimentações: sinal e custo por tipo", () => {
  it("entrada é positiva, saída é negativa, ajuste aceita os dois sinais", async () => {
    const { a } = await criarCenario(db);
    expect(
      await erroPg(criarMovimento(db, a, { tipo: "saida_venda", quantidade: "1", saldoApos: "1" })),
    ).toEqual({ code: CHECK, constraint: "movimentacoes_estoque_sinal_check" });
    expect(
      await erroPg(criarMovimento(db, a, { tipo: "saldo_inicial", quantidade: "-1", saldoApos: "-1" })),
    ).toEqual({ code: CHECK, constraint: "movimentacoes_estoque_sinal_check" });
    expect(
      await erroPg(
        criarMovimento(db, a, { tipo: "ajuste_inventario", quantidade: "-2", saldoApos: "3" }),
      ),
    ).toBeNull();
  });

  it("saldo inicial aceita custo nulo (D25 do modelo); entrada de compra exige custo", async () => {
    const { a } = await criarCenario(db);
    expect(await erroPg(criarMovimento(db, a, { custoUnitario: null }))).toBeNull();
    expect(
      await erroPg(criarMovimento(db, a, { tipo: "entrada_compra", custoUnitario: null })),
    ).toEqual({ code: CHECK, constraint: "movimentacoes_estoque_custo_entrada_check" });
  });
});

describe("estorno", () => {
  async function saida(a: EmpresaTeste) {
    return criarMovimento(db, a, { tipo: "saida_venda", quantidade: "-2.0000", saldoApos: "3" });
  }
  const estorno = (a: EmpresaTeste, estornoDeId: string, extra: Record<string, unknown> = {}) =>
    criarMovimento(db, a, {
      tipo: "estorno",
      quantidade: "2.0000",
      saldoApos: "5",
      estornoDeId,
      motivo: "venda cancelada",
      ...extra,
    });

  it("é total, do mesmo produto e depósito, e acontece uma vez só", async () => {
    const { a } = await criarCenario(db);
    const original = await saida(a);
    expect(await erroPg(estorno(a, original.id))).toBeNull();
    expect(await erroPg(estorno(a, original.id))).toEqual({
      code: UNIQUE,
      constraint: "movimentacoes_estoque_estorno_de_id_key",
    });
  });

  it("recusa estorno parcial, de outro produto ou de outro depósito", async () => {
    const { a } = await criarCenario(db);
    const original = await saida(a);
    expect(await erroPg(estorno(a, original.id, { quantidade: "1.0000" }))).toEqual({ code: CHECK });
    expect(await erroPg(estorno(a, original.id, { produtoId: a.produto2.id }))).toEqual({
      code: CHECK,
    });
    expect(await erroPg(estorno(a, original.id, { depositoId: a.garantia.id }))).toEqual({
      code: CHECK,
    });
  });
});

describe("reservas", () => {
  async function cenarioReserva() {
    const { a, usuario } = await criarCenario(db);
    const os = await criarOs(db, a, usuario.id);
    const item = await criarItemPecaOs(db, a, os.id, a.produto.id);
    const reservar = (extra: Partial<typeof estoqueReservas.$inferInsert> = {}) =>
      db
        .insert(estoqueReservas)
        .values({
          empresaId: a.empresa.id,
          produtoId: a.produto.id,
          depositoId: a.loja.id,
          quantidade: "1.0000",
          osItemId: item.id,
          ...extra,
        })
        .returning();
    return { a, item, reservar };
  }

  it("um item tem no máximo uma reserva ativa", async () => {
    const { reservar } = await cenarioReserva();
    await reservar();
    expect(await erroPg(reservar())).toEqual({
      code: UNIQUE,
      constraint: "estoque_reservas_os_item_id_vigente_key",
    });
  });

  it("item com reserva consumida não ganha outra reserva (B1); com reserva liberada, ganha", async () => {
    const { a, reservar } = await cenarioReserva();
    const [reserva] = await reservar();
    const baixa = await criarMovimento(db, a, { tipo: "saida_os", quantidade: "-1", saldoApos: "4" });
    await db
      .update(estoqueReservas)
      .set({ status: "consumida", consumidaEm: new Date(), movimentacaoId: baixa.id })
      .where(eq(estoqueReservas.id, reserva.id));
    expect(await erroPg(reservar())).toEqual({
      code: UNIQUE,
      constraint: "estoque_reservas_os_item_id_vigente_key",
    });

    const outro = await cenarioReserva();
    const [primeira] = await outro.reservar();
    await db
      .update(estoqueReservas)
      .set({ status: "liberada", liberadaEm: new Date() })
      .where(eq(estoqueReservas.id, primeira.id));
    expect(await erroPg(outro.reservar())).toBeNull();
  });

  it("status final da reserva não volta", async () => {
    const { reservar } = await cenarioReserva();
    const [reserva] = await reservar();
    await db
      .update(estoqueReservas)
      .set({ status: "liberada", liberadaEm: new Date() })
      .where(eq(estoqueReservas.id, reserva.id));
    expect(
      await erroPg(
        db
          .update(estoqueReservas)
          .set({ status: "ativa", liberadaEm: null })
          .where(eq(estoqueReservas.id, reserva.id)),
      ),
    ).toEqual({ code: IMUTAVEL });
  });

  it("reserva ativa não tem datas de baixa nem de liberação", async () => {
    const { reservar } = await cenarioReserva();
    expect(await erroPg(reservar({ liberadaEm: new Date() }))).toEqual({
      code: CHECK,
      constraint: "estoque_reservas_ativa_check",
    });
  });

  it("o produto da reserva é o produto do item", async () => {
    const { a, reservar } = await cenarioReserva();
    expect(await erroPg(reservar({ produtoId: a.produto2.id }))).toEqual({
      code: FK,
      constraint: "estoque_reservas_os_item_id_fk",
    });
  });

  it("não reserva no depósito Garantia", async () => {
    const { a, reservar } = await cenarioReserva();
    expect(await erroPg(reservar({ depositoId: a.garantia.id }))).toEqual({
      code: FK,
      constraint: "estoque_reservas_deposito_id_fk",
    });
  });

  it("a quantidade reservada do saldo nunca fica negativa", async () => {
    const { a } = await criarCenario(db);
    expect(
      await erroPg(
        db.insert(estoqueSaldos).values({
          empresaId: a.empresa.id,
          produtoId: a.produto.id,
          depositoId: a.loja.id,
          quantidadeReservada: "-1",
        }),
      ),
    ).toEqual({ code: CHECK, constraint: "estoque_saldos_quantidade_reservada_check" });
  });
});

describe("entradas", () => {
  const CHAVE = "35261100000000000100550010000001231000001234";

  function entradaXml(a: EmpresaTeste, usuarioId: string) {
    return db
      .insert(entradasEstoque)
      .values({
        empresaId: a.empresa.id,
        depositoId: a.loja.id,
        origem: "xml",
        chaveAcesso: CHAVE,
        xmlChave: `empresas/${a.empresa.id}/xml/${CHAVE}.xml`,
        usuarioId,
      })
      .returning();
  }

  it("o mesmo XML não entra duas vezes; um rascunho cancelado não impede reimportar", async () => {
    const { a, usuario } = await criarCenario(db);
    const [primeira] = await entradaXml(a, usuario.id);
    expect(await erroPg(entradaXml(a, usuario.id))).toEqual({
      code: UNIQUE,
      constraint: "entradas_estoque_empresa_id_chave_acesso_key",
    });
    await db
      .update(entradasEstoque)
      .set({ status: "cancelada" })
      .where(eq(entradasEstoque.id, primeira.id));
    expect(await erroPg(entradaXml(a, usuario.id))).toBeNull();
  });

  it("entrada confirmada não vira cancelada", async () => {
    const { a, usuario } = await criarCenario(db);
    const [entrada] = await entradaXml(a, usuario.id);
    await db
      .update(entradasEstoque)
      .set({ status: "confirmada", confirmadaEm: new Date(), confirmadaPor: usuario.id })
      .where(eq(entradasEstoque.id, entrada.id));
    expect(
      await erroPg(
        db
          .update(entradasEstoque)
          .set({ status: "cancelada" })
          .where(and(eq(entradasEstoque.id, entrada.id))),
      ),
    ).toEqual({ code: CHECK, constraint: "entradas_estoque_cancelada_check" });
  });

  it("quantidade em estoque = quantidade comprada × fator", async () => {
    const { a, usuario } = await criarCenario(db);
    const [entrada] = await entradaXml(a, usuario.id);
    const item = (numeroItem: number, quantidadeEstoque: string) =>
      db.insert(entradaItens).values({
        empresaId: a.empresa.id,
        entradaId: entrada.id,
        numeroItem,
        produtoId: a.produto.id,
        unidadeCompra: "CX",
        fator: "10.0000",
        quantidadeCompra: "2.0000",
        quantidadeEstoque,
        valorProduto: "100.00",
        custoUnitario: "5.000000",
      });
    expect(await erroPg(item(1, "20.0000"))).toBeNull();
    expect(await erroPg(item(2, "21.0000"))).toEqual({
      code: CHECK,
      constraint: "entrada_itens_quantidade_estoque_calculo_check",
    });
  });
});
