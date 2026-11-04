/**
 * Numeração (regra 4.11, D009) e auditoria (modelo 10.2), fatia 0.7.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { auditoria, sequencias } from "../../src/server/db/schema";
import { registrarAuditoria } from "../../src/server/servicos/auditoria";
import { proximoNumero } from "../../src/server/servicos/sequencias";
import { erroPg, limparTabelas } from "./_banco";
import { abrirBanco, criarCenario, criarMembro, criarUsuario } from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("proximoNumero", () => {
  it("N transações simultâneas na mesma empresa: números únicos e sem buraco", async () => {
    const { a } = await criarCenario(db);
    const ctx = { empresaId: a.empresa.id };
    const N = 25;
    // a linha da sequência ainda não existe: as primeiras disputam também o INSERT
    const numeros = await Promise.all(
      Array.from({ length: N }, (_, i) =>
        withTransaction(
          async (tx) => {
            const n = await proximoNumero(tx, ctx, "venda");
            await esperar(i % 3); // segura a trava um pouco, intercalando as transações
            return n;
          },
          { esperaLockMs: 30_000 },
        ),
      ),
    );
    expect([...numeros].sort((x, y) => x - y)).toEqual(Array.from({ length: N }, (_, i) => i + 1));
  });

  it("transação desfeita não deixa buraco", async () => {
    const { a } = await criarCenario(db);
    const ctx = { empresaId: a.empresa.id };
    expect(await withTransaction((tx) => proximoNumero(tx, ctx, "os"))).toBe(1);
    await expect(
      withTransaction(async (tx) => {
        expect(await proximoNumero(tx, ctx, "os")).toBe(2);
        throw new Error("documento falhou");
      }),
    ).rejects.toThrow("documento falhou");
    expect(await withTransaction((tx) => proximoNumero(tx, ctx, "os"))).toBe(2);
  });

  it("concorrência com parte das transações desfeitas: os confirmados ficam em sequência", async () => {
    const { a } = await criarCenario(db);
    const ctx = { empresaId: a.empresa.id };
    const resultados = await Promise.allSettled(
      Array.from({ length: 12 }, (_, i) =>
        withTransaction(
          async (tx) => {
            const n = await proximoNumero(tx, ctx, "orcamento");
            if (i % 3 === 0) throw new Error("desfeita");
            return n;
          },
          { esperaLockMs: 30_000 },
        ),
      ),
    );
    const confirmados = resultados
      .filter((r): r is PromiseFulfilledResult<number> => r.status === "fulfilled")
      .map((r) => r.value)
      .sort((x, y) => x - y);
    expect(confirmados).toEqual(Array.from({ length: 8 }, (_, i) => i + 1));
  });

  it("empresas e chaves diferentes têm sequências independentes", async () => {
    const { a, b } = await criarCenario(db);
    const proximo = (empresaId: string, chave: "venda" | "os") =>
      withTransaction((tx) => proximoNumero(tx, { empresaId }, chave));
    expect(await proximo(a.empresa.id, "venda")).toBe(1);
    expect(await proximo(a.empresa.id, "venda")).toBe(2);
    expect(await proximo(b.empresa.id, "venda")).toBe(1);
    expect(await proximo(a.empresa.id, "os")).toBe(1);
    const linhas = await db.select().from(sequencias).where(eq(sequencias.empresaId, a.empresa.id));
    expect(Object.fromEntries(linhas.map((l) => [l.chave, l.ultimoValor]))).toEqual({ venda: 2, os: 1 });
  });

  it("continua de onde a linha existente parou (ex.: depois da importação)", async () => {
    const { a } = await criarCenario(db);
    await db.insert(sequencias).values({ empresaId: a.empresa.id, chave: "produto", ultimoValor: 4210 });
    expect(await withTransaction((tx) => proximoNumero(tx, { empresaId: a.empresa.id }, "produto"))).toBe(4211);
  });

  it("recusa chave fora da lista e empresa inexistente", async () => {
    await criarCenario(db);
    await expect(
      withTransaction((tx) => proximoNumero(tx, { empresaId: crypto.randomUUID() }, "venda")),
    ).rejects.toThrow();
    await expect(
      // @ts-expect-error chave fora do catálogo
      withTransaction((tx) => proximoNumero(tx, { empresaId: crypto.randomUUID() }, "nota")),
    ).rejects.toThrow(/desconhecida/);
  });
});

describe("registrarAuditoria", () => {
  it("grava antes/depois sem campos sensíveis, em qualquer nível", async () => {
    const { a, usuario } = await criarCenario(db);
    const ctx = { empresaId: a.empresa.id, usuario: { id: usuario.id } };
    const { id } = await withTransaction((tx) =>
      registrarAuditoria(tx, ctx, {
        entidade: "canais_venda",
        entidadeId: a.produto.id,
        acao: "canal_config_alterada",
        antes: {
          nome: "Mercado Livre",
          credenciais_cifrado: Buffer.from("segredo"),
          credenciaisCifrado: Buffer.from("segredo"),
          webhook_segredo_cifrado: Buffer.from("x"),
          pin_hash: "scrypt$abc",
          pinHash: "scrypt$abc",
          hash: "deadbeef",
          senha: "123",
          password: "123",
          config: { access_token: "APP_USR-1", refreshToken: "r", janela_agrupamento_segundos: 10 },
          itens: [{ api_chave_hash: "h", prefixo: "sk_live" }],
        },
        depois: { nome: "ML Loja", estoque_seguranca: "2.0000", criado: new Date("2026-11-03T12:00:00Z") },
      }),
    );
    const [linha] = await db.select().from(auditoria).where(eq(auditoria.id, id));
    expect(linha!.antes).toEqual({
      nome: "Mercado Livre",
      config: { janela_agrupamento_segundos: 10 },
      itens: [{ prefixo: "sk_live" }],
    });
    expect(linha!.depois).toEqual({ nome: "ML Loja", estoque_seguranca: "2.0000", criado: "2026-11-03T12:00:00.000Z" });
    expect(JSON.stringify(linha)).not.toMatch(/segredo|scrypt|deadbeef|APP_USR|"123"/);
    expect(linha).toMatchObject({ usuarioId: usuario.id, empresaId: a.empresa.id, autorizadoPor: null });
  });

  it("com lista de campos permitidos, grava só eles (e ainda sem os sensíveis)", async () => {
    const { a, usuario } = await criarCenario(db);
    const { id } = await withTransaction((tx) =>
      registrarAuditoria(
        tx,
        { empresaId: a.empresa.id, usuario: { id: usuario.id } },
        {
          entidade: "produtos",
          entidadeId: a.produto.id,
          acao: "preco_alterado",
          antes: { preco_venda: "10.00", descricao: "x", pin_hash: "h" },
          depois: { preco_venda: "12.00", descricao: "y", pin_hash: "h" },
          campos: ["preco_venda", "pin_hash"],
        },
      ),
    );
    const [linha] = await db.select().from(auditoria).where(eq(auditoria.id, id));
    expect(linha!.antes).toEqual({ preco_venda: "10.00" });
    expect(linha!.depois).toEqual({ preco_venda: "12.00" });
  });

  it("autorizado_por precisa ser membro da mesma empresa (FK) e a auditoria é append-only", async () => {
    const { a, b, usuario } = await criarCenario(db);
    const ctx = { empresaId: a.empresa.id, usuario: null };
    const estranho = await criarUsuario(db, "estranho@teste.local");
    await criarMembro(db, b.empresa.id, estranho.id, "dono");

    const entrada = {
      entidade: "vendas",
      entidadeId: a.produto.id,
      acao: "desconto_acima_limite" as const,
      depois: { percentual: "15.0000" },
    };
    expect(
      await erroPg(withTransaction((tx) => registrarAuditoria(tx, ctx, { ...entrada, autorizadoPor: estranho.id }))),
    ).toMatchObject({ code: "23503" });

    const { id } = await withTransaction((tx) => registrarAuditoria(tx, ctx, { ...entrada, autorizadoPor: usuario.id }));
    expect(await erroPg(db.update(auditoria).set({ acao: "x" }).where(eq(auditoria.id, id)))).toMatchObject({
      code: "23001",
    });
    expect(await erroPg(db.delete(auditoria).where(and(eq(auditoria.id, id))))).toMatchObject({ code: "23001" });
  });

  it("desfeita junto com a transação da mudança auditada", async () => {
    const { a, usuario } = await criarCenario(db);
    await expect(
      withTransaction(async (tx) => {
        await registrarAuditoria(
          tx,
          { empresaId: a.empresa.id, usuario: { id: usuario.id } },
          { entidade: "produtos", entidadeId: a.produto.id, acao: "codigo_alterado", depois: { codigo: "X" } },
        );
        throw new Error("falhou");
      }),
    ).rejects.toThrow("falhou");
    expect(await db.select().from(auditoria)).toHaveLength(0);
  });
});
