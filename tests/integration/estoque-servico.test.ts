/**
 * Serviço de estoque (`servicos/estoque.ts`): saldo inicial pelo caminho oficial
 * (regra 4.2, seção 13 do modelo, D030). Postgres real, commits reais.
 */
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { depositos, estoqueSaldos, movimentacoesEstoque, outbox, produtos } from "../../src/server/db/schema";
import { Decimal } from "../../src/server/domain/decimal";
import { ErroEstoque } from "../../src/server/domain/estoque";
import {
  type ContextoEstoque,
  type ItemSaldoInicial,
  lancarSaldoInicial,
} from "../../src/server/servicos/estoque";
import { erroPg, limparTabelas } from "./_banco";
import { abrirBanco, criarCenario, type EmpresaTeste } from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();
const FK = "23503";
const MOTIVO = { motivo: "Seed de demonstração" };

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function saldoDe(e: EmpresaTeste, produtoId: string) {
  const [saldo] = await db
    .select()
    .from(estoqueSaldos)
    .where(and(eq(estoqueSaldos.empresaId, e.empresa.id), eq(estoqueSaldos.produtoId, produtoId)));
  return saldo;
}

async function movimentosDe(e: EmpresaTeste, produtoId: string) {
  return db
    .select()
    .from(movimentacoesEstoque)
    .where(and(eq(movimentacoesEstoque.empresaId, e.empresa.id), eq(movimentacoesEstoque.produtoId, produtoId)))
    .orderBy(asc(movimentacoesEstoque.saldoApos));
}

async function cenario() {
  const c = await criarCenario(db);
  const ctx: ContextoEstoque = { empresaId: c.a.empresa.id, usuario: { id: c.usuario.id } };
  const lancar = (itens: readonly ItemSaldoInicial[], opcoes: { motivo: string; depositoId?: string } = MOTIVO) =>
    withTransaction((tx) => lancarSaldoInicial(tx, ctx, itens, opcoes), { esperaLockMs: 30_000 });
  return { ...c, ctx, lancar };
}

describe("lancarSaldoInicial", () => {
  it("grava saldo e movimento juntos, no depósito padrão", async () => {
    const { a, lancar, usuario } = await cenario();
    const movimentos = await lancar([{ produtoId: a.produto.id, quantidade: "5", custoUnitario: "12.5" }]);

    expect(movimentos).toHaveLength(1);
    expect(await saldoDe(a, a.produto.id)).toMatchObject({
      depositoId: a.loja.id,
      quantidade: "5.0000",
      quantidadeReservada: "0.0000",
      custoMedio: "12.500000",
      ultimoCusto: "12.500000",
    });
    const [mov] = await movimentosDe(a, a.produto.id);
    expect(mov).toMatchObject({
      id: movimentos[0].movimentacaoId,
      depositoId: a.loja.id,
      tipo: "saldo_inicial",
      quantidade: "5.0000",
      custoUnitario: "12.500000",
      saldoApos: "5.0000",
      custoMedioApos: "12.500000",
      origemTipo: null,
      origemId: null,
      motivo: "Seed de demonstração",
      usuarioId: usuario.id,
    });
  });

  it("grava um evento na outbox por produto, na mesma transação", async () => {
    const { a, lancar } = await cenario();
    const movimentos = await lancar([
      { produtoId: a.produto2.id, quantidade: "2", custoUnitario: "30" },
      { produtoId: a.produto.id, quantidade: "1.5", custoUnitario: null },
    ]);
    const eventos = await db.select().from(outbox).where(eq(outbox.empresaId, a.empresa.id));
    expect(eventos).toHaveLength(2);
    for (const m of movimentos) {
      expect(eventos.find((e) => e.produtoId === m.produtoId)).toMatchObject({
        tipo: "produto.disponivel_alterado",
        processadoEm: null,
        payload: { deposito_id: a.loja.id, movimentacao_id: m.movimentacaoId, tipo_movimento: "saldo_inicial" },
      });
    }
  });

  it("transação desfeita não deixa saldo, movimento nem outbox", async () => {
    const { a, ctx } = await cenario();
    await expect(
      withTransaction(async (tx) => {
        await lancarSaldoInicial(tx, ctx, [{ produtoId: a.produto.id, quantidade: "5", custoUnitario: "1" }], MOTIVO);
        throw new Error("falha depois do lançamento");
      }),
    ).rejects.toThrow(/falha depois/);
    expect(await saldoDe(a, a.produto.id)).toBeUndefined();
    expect(await movimentosDe(a, a.produto.id)).toHaveLength(0);
    expect(await db.select().from(outbox)).toHaveLength(0);
  });

  it("dois lançamentos seguidos somam e recalculam o custo médio (regra 4.5)", async () => {
    const { a, lancar } = await cenario();
    await lancar([{ produtoId: a.produto.id, quantidade: "10", custoUnitario: "5" }]);
    await lancar([{ produtoId: a.produto.id, quantidade: "10", custoUnitario: "7" }]);

    expect(await saldoDe(a, a.produto.id)).toMatchObject({
      quantidade: "20.0000",
      custoMedio: "6.000000",
      ultimoCusto: "7.000000",
    });
    const movs = await movimentosDe(a, a.produto.id);
    expect(movs.map((m) => [m.saldoApos, m.custoUnitario, m.custoMedioApos])).toEqual([
      ["10.0000", "5.000000", "5.000000"],
      ["20.0000", "7.000000", "6.000000"],
    ]);
  });

  it("custo nulo sem custo conhecido grava nulo; o lançamento seguinte com custo define o médio (D25 do modelo)", async () => {
    const { a, lancar } = await cenario();
    await lancar([{ produtoId: a.produto.id, quantidade: "4", custoUnitario: null }]);
    expect(await saldoDe(a, a.produto.id)).toMatchObject({ quantidade: "4.0000", custoMedio: null, ultimoCusto: null });
    const [mov] = await movimentosDe(a, a.produto.id);
    expect(mov).toMatchObject({ custoUnitario: null, custoMedioApos: null });

    await lancar([{ produtoId: a.produto.id, quantidade: "1", custoUnitario: "9.99" }]);
    expect(await saldoDe(a, a.produto.id)).toMatchObject({
      quantidade: "5.0000",
      custoMedio: "9.990000",
      ultimoCusto: "9.990000",
    });
  });

  it("custo nulo sobre saldo com custo entra pelo médio atual, e o kardex grava esse custo", async () => {
    const { a, lancar } = await cenario();
    await lancar([{ produtoId: a.produto.id, quantidade: "5", custoUnitario: "10" }]);
    await lancar([{ produtoId: a.produto.id, quantidade: "5", custoUnitario: null }]);
    expect(await saldoDe(a, a.produto.id)).toMatchObject({
      quantidade: "10.0000",
      custoMedio: "10.000000",
      ultimoCusto: "10.000000",
    });
    const movs = await movimentosDe(a, a.produto.id);
    expect(movs[1]).toMatchObject({ custoUnitario: "10.000000", custoMedioApos: "10.000000" });
  });

  it("lançamentos concorrentes nos mesmos produtos, em ordens invertidas, não perdem atualização nem travam", async () => {
    const { a, lancar } = await cenario();
    const N = 8;
    // o saldo ainda não existe: as transações disputam também o INSERT da linha;
    // metade manda [produto, produto2], metade [produto2, produto] (a ordem das travas é do serviço)
    await Promise.all(
      Array.from({ length: N }, (_, i) => {
        const itens: ItemSaldoInicial[] = [
          { produtoId: a.produto.id, quantidade: "1", custoUnitario: i % 2 === 0 ? "10" : "20" },
          { produtoId: a.produto2.id, quantidade: "2", custoUnitario: "3" },
        ];
        return lancar(i % 2 === 0 ? itens : [...itens].reverse()).then(() => esperar(i % 3));
      }),
    );

    const saldo = await saldoDe(a, a.produto.id);
    expect(saldo.quantidade).toBe(`${N}.0000`);
    // metade a 10, metade a 20: a média é 15, com o arredondamento em 6 casas de cada passo,
    // que depende da ordem em que as transações pegaram a trava
    expect(new Decimal(saldo.custoMedio as string).minus(15).abs().lte("0.00001")).toBe(true);
    expect((await saldoDe(a, a.produto2.id)).quantidade).toBe(`${2 * N}.0000`);

    // cada movimento viu o saldo do anterior: saldos após 1, 2, ..., N, sem repetição
    const movs = await movimentosDe(a, a.produto.id);
    expect(movs.map((m) => m.saldoApos)).toEqual(Array.from({ length: N }, (_, i) => `${i + 1}.0000`));
    expect(await db.select().from(outbox)).toHaveLength(2 * N);
  });

  it("aceita o id do produto em maiúsculas (normaliza antes de travar e gravar)", async () => {
    const { a, lancar } = await cenario();
    await lancar([{ produtoId: a.produto.id.toUpperCase(), quantidade: "1", custoUnitario: "1" }]);
    expect((await saldoDe(a, a.produto.id)).quantidade).toBe("1.0000");
  });

  it("produto de outra empresa é recusado, listando o produto, e nada é gravado", async () => {
    const { a, b, lancar } = await cenario();
    const r = lancar([
      { produtoId: a.produto.id, quantidade: "1", custoUnitario: "1" },
      { produtoId: b.produto.id, quantidade: "1", custoUnitario: "1" },
    ]);
    await expect(r).rejects.toBeInstanceOf(ErroEstoque);
    await expect(r).rejects.toMatchObject({ codigo: "produto_invalido", produtos: [b.produto.id] });
    expect(await db.select().from(estoqueSaldos)).toHaveLength(0);
    expect(await db.select().from(movimentacoesEstoque)).toHaveLength(0);
    expect(await db.select().from(outbox)).toHaveLength(0);
  });

  it("a FK composta continua barrando o saldo com produto de outra empresa no banco", async () => {
    const { a, b } = await cenario();
    expect(
      await erroPg(
        db.insert(estoqueSaldos).values({ empresaId: a.empresa.id, produtoId: b.produto.id, depositoId: a.loja.id }),
      ),
    ).toEqual({ code: FK, constraint: "estoque_saldos_produto_id_fk" });
  });

  it("produto inativo é recusado", async () => {
    const { a, lancar } = await cenario();
    await db.update(produtos).set({ ativo: false }).where(eq(produtos.id, a.produto2.id));
    await expect(
      lancar([
        { produtoId: a.produto.id, quantidade: "1", custoUnitario: "1" },
        { produtoId: a.produto2.id, quantidade: "1", custoUnitario: "1" },
      ]),
    ).rejects.toMatchObject({ codigo: "produto_invalido", produtos: [a.produto2.id] });
  });

  it("recusa depósito não vendável, de outra empresa ou inativo", async () => {
    const { a, b, lancar } = await cenario();
    const item = [{ produtoId: a.produto.id, quantidade: "1", custoUnitario: "1" }];
    await expect(lancar(item, { ...MOTIVO, depositoId: a.garantia.id })).rejects.toMatchObject({
      codigo: "deposito_invalido",
    });
    await expect(lancar(item, { ...MOTIVO, depositoId: b.loja.id })).rejects.toMatchObject({
      codigo: "deposito_invalido",
    });
    await db.update(depositos).set({ ativo: false }).where(eq(depositos.id, a.loja.id));
    await expect(lancar(item)).rejects.toMatchObject({ codigo: "deposito_invalido" });
  });

  it("recusa quantidade negativa ou zero, custo negativo, produto repetido e motivo vazio", async () => {
    const { a, lancar } = await cenario();
    const negativo = lancar([
      { produtoId: a.produto.id, quantidade: "-1", custoUnitario: "1" },
      { produtoId: a.produto2.id, quantidade: "0", custoUnitario: "1" },
    ]);
    await expect(negativo).rejects.toBeInstanceOf(ErroEstoque);
    await expect(negativo).rejects.toMatchObject({
      codigo: "movimento_invalido",
      produtos: expect.arrayContaining([a.produto.id, a.produto2.id]),
    });
    await expect(lancar([{ produtoId: a.produto.id, quantidade: "1", custoUnitario: "-1" }])).rejects.toMatchObject({
      codigo: "movimento_invalido",
    });
    await expect(
      lancar([
        { produtoId: a.produto.id, quantidade: "1", custoUnitario: "1" },
        { produtoId: a.produto.id, quantidade: "2", custoUnitario: "1" },
      ]),
    ).rejects.toMatchObject({ codigo: "produto_repetido", produtos: [a.produto.id] });
    await expect(
      lancar([{ produtoId: a.produto.id, quantidade: "1", custoUnitario: "1" }], { motivo: "  " }),
    ).rejects.toMatchObject({ codigo: "movimento_invalido" });
    expect(await db.select().from(movimentacoesEstoque)).toHaveLength(0);
  });

  it("lista vazia não faz nada", async () => {
    const { lancar } = await cenario();
    expect(await lancar([])).toEqual([]);
    expect(await db.select().from(outbox)).toHaveLength(0);
  });
});
