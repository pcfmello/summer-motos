/**
 * Banco (fatia 0.4): o que o próprio Postgres garante, mesmo com bug na aplicação.
 *
 * - append-only em movimentacoes_estoque, auditoria e comissao_ajustes (D008, 7.11);
 * - FK composta de isolamento entre empresas (D003, 1.5);
 * - updated_at por gatilho (D005);
 * - busca sem acento com f_unaccent + pg_trgm e collation pt-BR;
 * - withTransaction: rollback, nível de isolamento e retentativa.
 */
import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acertosComissao,
  auditoria,
  comissaoAjustes,
  movimentacoesEstoque,
  produtos,
  sequencias,
  tenants,
  vendaItens,
  vendedores,
} from "../../src/server/db/schema";
import { erroPg, limparTabelas } from "./_banco";
import { abrirBanco, criarCenario as criarCenarioBase, criarMovimento, criarVenda as criarVendaBase, type EmpresaTeste } from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();

/** 23001 = restrict_violation, usado por bloquear_alteracao(). */
const APPEND_ONLY = "23001";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

const criarCenario = () => criarCenarioBase(db);
const criarVenda = (e: EmpresaTeste, usuarioId: string, extra: Parameters<typeof criarVendaBase>[3] = {}) =>
  criarVendaBase(db, e, usuarioId, extra);

describe("append-only (D008)", () => {
  it("movimentacoes_estoque recusa UPDATE e DELETE", async () => {
    const { a } = await criarCenario();
    const mov = await criarMovimento(db, a);

    expect(
      await erroPg(
        db.update(movimentacoesEstoque).set({ quantidade: "50" }).where(eq(movimentacoesEstoque.id, mov.id)),
      ),
    ).toEqual({ code: APPEND_ONLY });
    expect(
      await erroPg(db.delete(movimentacoesEstoque).where(eq(movimentacoesEstoque.id, mov.id))),
    ).toEqual({ code: APPEND_ONLY });

    const [depois] = await db
      .select()
      .from(movimentacoesEstoque)
      .where(eq(movimentacoesEstoque.id, mov.id));
    expect(depois.quantidade).toBe("5.0000");
  });

  it("auditoria recusa UPDATE e DELETE", async () => {
    const { a, usuario } = await criarCenario();
    const [registro] = await db
      .insert(auditoria)
      .values({
        empresaId: a.empresa.id,
        usuarioId: usuario.id,
        entidade: "produtos",
        entidadeId: a.produto.id,
        acao: "preco_alterado",
        antes: { preco_venda: "10.00" },
        depois: { preco_venda: "12.00" },
      })
      .returning();

    expect(
      await erroPg(db.update(auditoria).set({ acao: "outra" }).where(eq(auditoria.id, registro.id))),
    ).toEqual({ code: APPEND_ONLY });
    expect(await erroPg(db.delete(auditoria).where(eq(auditoria.id, registro.id)))).toEqual({
      code: APPEND_ONLY,
    });
  });

  it("comissao_ajustes só aceita preencher o acerto, uma vez", async () => {
    const { a, usuario } = await criarCenario();
    const [vendedor] = await db
      .insert(vendedores)
      .values({ empresaId: a.empresa.id, nome: "Vendedor", percentualComissao: "3.0000" })
      .returning();
    const venda = await criarVenda(a, usuario.id, {
      vendedorId: vendedor.id,
      comissaoVendedorPercentual: "3.0000",
      comissaoVendedorBase: "10.00",
      comissaoVendedorValor: "0.30",
    });
    const acerto = (numero: number) => ({
      empresaId: a.empresa.id,
      numero,
      beneficiarioTipo: "vendedor" as const,
      vendedorId: vendedor.id,
      periodoInicio: "2026-10-01",
      periodoFim: "2026-10-31",
      valor: "10.00",
      forma: "pix" as const,
      pagoPor: usuario.id,
    });
    const [acerto1, acerto2] = await db
      .insert(acertosComissao)
      .values([acerto(1), acerto(2)])
      .returning();
    const [ajuste] = await db
      .insert(comissaoAjustes)
      .values({
        empresaId: a.empresa.id,
        vendedorId: vendedor.id,
        vendaId: venda.id,
        valor: "-0.30",
        motivo: "venda cancelada depois do acerto",
        usuarioId: usuario.id,
      })
      .returning();
    const porId = eq(comissaoAjustes.id, ajuste.id);

    // mudar outra coluna, mesmo junto com o acerto: recusado
    expect(
      await erroPg(
        db.update(comissaoAjustes).set({ acertoComissaoId: acerto1.id, valor: "-9.99" }).where(porId),
      ),
    ).toEqual({ code: APPEND_ONLY });
    // preencher o acerto pela primeira vez: aceito
    expect(
      await erroPg(db.update(comissaoAjustes).set({ acertoComissaoId: acerto1.id }).where(porId)),
    ).toBeNull();
    // trocar o acerto já preenchido: recusado
    expect(
      await erroPg(db.update(comissaoAjustes).set({ acertoComissaoId: acerto2.id }).where(porId)),
    ).toEqual({ code: APPEND_ONLY });
    expect(await erroPg(db.delete(comissaoAjustes).where(porId))).toEqual({ code: APPEND_ONLY });

    const [depois] = await db.select().from(comissaoAjustes).where(porId);
    expect(depois.acertoComissaoId).toBe(acerto1.id);
    expect(depois.valor).toBe("-0.30");
  });
});

describe("FK composta de isolamento (D003)", () => {
  it("venda_itens da empresa A não aponta para produto da empresa B", async () => {
    const { a, b, usuario } = await criarCenario();
    const venda = await criarVenda(a, usuario.id);
    const item = (produtoId: string) => ({
      empresaId: a.empresa.id,
      vendaId: venda.id,
      ordem: 1,
      produtoId,
      codigo: "000001",
      descricao: "Pastilha de freio",
      unidade: "UN",
      quantidade: "1.0000",
      precoUnitario: "10.00",
      valorBruto: "10.00",
      valorTotal: "10.00",
    });

    expect(await erroPg(db.insert(vendaItens).values(item(b.produto.id)))).toEqual({
      code: "23503",
      constraint: "venda_itens_produto_id_fk",
    });
    // controle: o produto da própria empresa é aceito
    expect(await erroPg(db.insert(vendaItens).values(item(a.produto.id)))).toBeNull();
  });

  it("a venda da empresa A não usa cliente nem depósito da empresa B", async () => {
    const { a, b, usuario } = await criarCenario();
    expect(await erroPg(criarVenda(a, usuario.id, { clienteId: b.cliente.id }))).toEqual({
      code: "23503",
      constraint: "vendas_cliente_id_fk",
    });
    expect(await erroPg(criarVenda(a, usuario.id, { depositoId: b.loja.id }))).toEqual({
      code: "23503",
      constraint: "vendas_deposito_id_fk",
    });
  });
});

describe("updated_at por gatilho (D005)", () => {
  it("muda no UPDATE e o created_at fica", async () => {
    const antigo = new Date("2020-01-01T00:00:00Z");
    const [tenant] = await db
      .insert(tenants)
      .values({ nome: "Antes", createdAt: antigo, updatedAt: antigo })
      .returning();

    await db.update(tenants).set({ nome: "Depois" }).where(eq(tenants.id, tenant.id));

    const [depois] = await db.select().from(tenants).where(eq(tenants.id, tenant.id));
    expect(depois.nome).toBe("Depois");
    expect(depois.createdAt.toISOString()).toBe(antigo.toISOString());
    expect(depois.updatedAt.getTime()).toBeGreaterThan(antigo.getTime());
  });
});

describe("busca e ordenação pt-BR", () => {
  async function criarProdutos(descricoes: string[]) {
    const { a } = await criarCenario();
    await db.insert(produtos).values(
      descricoes.map((descricao, i) => ({
        empresaId: a.empresa.id,
        codigo: `P${i + 1}`,
        descricao,
      })),
    );
    return a.empresa.id;
  }

  async function buscar(empresaId: string, termo: string) {
    const r = await db.execute<{ descricao: string }>(sql`
      select descricao from produtos
       where empresa_id = ${empresaId}
         and f_unaccent(lower(descricao)) like '%' || f_unaccent(lower(${termo})) || '%'
       order by descricao`);
    return r.rows.map((l) => l.descricao);
  }

  it("encontra 'óleo' procurando 'oleo' (e 'Câmara' com 'CAMARA')", async () => {
    const empresaId = await criarProdutos([
      "Óleo Motul 5100 10W40 1L",
      "Câmara de ar aro 18",
      "Corrente 428H",
    ]);
    expect(await buscar(empresaId, "oleo")).toEqual(["Óleo Motul 5100 10W40 1L"]);
    expect(await buscar(empresaId, "CAMARA")).toEqual(["Câmara de ar aro 18"]);
    expect(await buscar(empresaId, "pneu")).toEqual([]);
  });

  it("a expressão da busca casa com o índice GIN de trigramas", async () => {
    await criarProdutos(["Óleo Motul 5100 10W40 1L"]);
    // Com poucas linhas o planner prefere o btree de empresa_id; sem esse filtro e sem
    // seq scan, só o GIN atende, o que prova que a expressão é a mesma do índice.
    const plano = await withTransaction(async (tx) => {
      await tx.execute(sql`set local enable_seqscan = off`);
      const r = await tx.execute<{ "QUERY PLAN": string }>(sql`
        explain select id from produtos
         where f_unaccent(lower(descricao)) like '%' || f_unaccent(lower('oleo')) || '%'`);
      return r.rows.map((l) => l["QUERY PLAN"]).join("\n");
    });
    expect(plano).toContain("produtos_busca_descricao_trgm");
  });

  it("ordena descrição, nome e razão social com a collation pt-BR (ICU)", async () => {
    const colunas = await pool.query<{ tabela: string; coluna: string; collation_name: string }>(
      `select table_name as tabela, column_name as coluna, collation_name
         from information_schema.columns
        where table_schema = 'public'
          and (table_name, column_name) in (('produtos', 'descricao'), ('clientes', 'nome'), ('fornecedores', 'razao_social'))
        order by table_name`,
    );
    expect(colunas.rows.map((c) => c.collation_name)).toEqual([
      "pt-BR-x-icu",
      "pt-BR-x-icu",
      "pt-BR-x-icu",
    ]);

    const empresaId = await criarProdutos(["Zebra", "Bola", "Ábaco", "abacate"]);
    const ordem = await db
      .select({ descricao: produtos.descricao })
      .from(produtos)
      .where(eq(produtos.empresaId, empresaId))
      .orderBy(asc(produtos.descricao));
    // com collation "C" seria Bola, Corrente…, Pastilha…, Zebra, abacate, Ábaco
    expect(ordem.map((p) => p.descricao)).toEqual([
      "abacate",
      "Ábaco",
      "Bola",
      "Corrente 428H Empresa A",
      "Pastilha de freio Empresa A",
      "Zebra",
    ]);
  });
});

describe("withTransaction", () => {
  it("desfaz tudo se a função lançar", async () => {
    await expect(
      withTransaction(async (tx) => {
        await tx.insert(tenants).values({ nome: "Não pode ficar" });
        throw new Error("falhou no meio");
      }),
    ).rejects.toThrow("falhou no meio");
    expect(await db.select().from(tenants)).toEqual([]);
  });

  it("usa READ COMMITTED por padrão e aceita outro nível", async () => {
    const nivel = (r: { rows: Record<string, unknown>[] }) => r.rows[0].transaction_isolation;
    expect(await withTransaction(async (tx) => nivel(await tx.execute(sql`show transaction_isolation`)))).toBe(
      "read committed",
    );
    expect(
      await withTransaction(async (tx) => nivel(await tx.execute(sql`show transaction_isolation`)), {
        isolamento: "serializable",
      }),
    ).toBe("serializable");
  });

  it("repete a transação no conflito de serialização, se pedido", async () => {
    const { a } = await criarCenario();
    await db.insert(sequencias).values({ empresaId: a.empresa.id, chave: "venda" });
    const porChave = sql`${sequencias.empresaId} = ${a.empresa.id} and ${sequencias.chave} = 'venda'`;

    // as duas leem antes de qualquer uma gravar: a segunda a gravar recebe 40001
    let leram = 0;
    let liberar!: () => void;
    const barreira = new Promise<void>((resolve) => (liberar = resolve));
    let execucoes = 0;
    const incrementar = () =>
      withTransaction(
        async (tx) => {
          execucoes++;
          const [atual] = await tx.select().from(sequencias).where(porChave);
          if (++leram === 2) liberar();
          await barreira;
          await tx
            .update(sequencias)
            .set({ ultimoValor: atual.ultimoValor + 1 })
            .where(porChave);
        },
        { isolamento: "serializable", tentativas: 3 },
      );

    await Promise.all([incrementar(), incrementar()]);

    const [final] = await db.select().from(sequencias).where(porChave);
    expect(final.ultimoValor).toBe(2);
    expect(execucoes).toBe(3);
  });

  it("limita a espera por trava (lock_timeout): 5 s por padrão, configurável", async () => {
    const valor = (r: { rows: Record<string, unknown>[] }) => r.rows[0].lock_timeout;
    expect(await withTransaction(async (tx) => valor(await tx.execute(sql`show lock_timeout`)))).toBe("5s");

    // outra transação segura a linha; a nossa desiste em 200 ms com 55P03
    const { a } = await criarCenario();
    const segurando = await pool.connect();
    try {
      await segurando.query("begin");
      await segurando.query("select 1 from empresas where id = $1 for update", [a.empresa.id]);
      const inicio = Date.now();
      expect(
        await erroPg(
          withTransaction(
            (tx) => tx.execute(sql`select 1 from empresas where id = ${a.empresa.id} for update`),
            { esperaLockMs: 200 },
          ),
        ),
      ).toEqual({ code: "55P03" });
      expect(Date.now() - inicio).toBeLessThan(3000);
    } finally {
      await segurando.query("rollback");
      segurando.release();
    }
  });

  it("sem retentativa, o conflito chega a quem chamou", async () => {
    let chamadas = 0;
    const conflito = Object.assign(new Error("could not serialize"), { code: "40001" });
    await expect(
      withTransaction(async () => {
        chamadas++;
        throw conflito;
      }),
    ).rejects.toBe(conflito);
    expect(chamadas).toBe(1);
  });
});
