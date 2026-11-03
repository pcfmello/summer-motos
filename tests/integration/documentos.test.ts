/**
 * Documentos comerciais (seção 7 do modelo): depósito vendável, status finais,
 * comissões congeladas e as contas de cada linha (regra 4.10).
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  acertosComissao,
  depositos,
  mecanicos,
  orcamentoItens,
  orcamentos,
  ordensServico,
  osItens,
  vendaItens,
  vendas,
  vendedores,
} from "../../src/server/db/schema";
import { erroPg, limparTabelas } from "./_banco";
import {
  abrirBanco,
  criarCenario,
  criarItemServicoOs,
  criarOs,
  criarVenda,
  type EmpresaTeste,
} from "./_cenario";

const { pool, db } = abrirBanco();
const CHECK = "23514";
const FK = "23503";
const IMUTAVEL = "23001";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

async function criarVendedor(a: EmpresaTeste) {
  const [vendedor] = await db
    .insert(vendedores)
    .values({ empresaId: a.empresa.id, nome: "Vendedor", percentualComissao: "3.0000" })
    .returning();
  return vendedor;
}

async function criarAcerto(
  a: EmpresaTeste,
  usuarioId: string,
  numero: number,
  beneficiario: { mecanicoId: string } | { vendedorId: string },
) {
  const [acerto] = await db
    .insert(acertosComissao)
    .values({
      empresaId: a.empresa.id,
      numero,
      beneficiarioTipo: "mecanicoId" in beneficiario ? "mecanico" : "vendedor",
      ...beneficiario,
      periodoInicio: "2026-10-01",
      periodoFim: "2026-10-31",
      valor: "20.00",
      forma: "pix",
      pagoPor: usuarioId,
    })
    .returning();
  return acerto;
}

describe("depósito Garantia fora da venda (D28 do modelo)", () => {
  it("venda e OS só usam depósito vendável", async () => {
    const { a, usuario } = await criarCenario(db);
    expect(await erroPg(criarVenda(db, a, usuario.id, { depositoId: a.garantia.id }))).toEqual({
      code: FK,
      constraint: "vendas_deposito_id_fk",
    });
    expect(await erroPg(criarOs(db, a, usuario.id, { depositoId: a.garantia.id }))).toEqual({
      code: FK,
      constraint: "ordens_servico_deposito_id_fk",
    });
    expect(await erroPg(criarVenda(db, a, usuario.id, { depositoVendavel: false }))).toEqual({
      code: CHECK,
      constraint: "vendas_deposito_vendavel_check",
    });
  });

  it("o depósito nasce não vendável se nada for dito", async () => {
    const { a } = await criarCenario(db);
    const [novo] = await db
      .insert(depositos)
      .values({ empresaId: a.empresa.id, nome: "Oficina" })
      .returning();
    expect(novo.vendavel).toBe(false);
  });
});

describe("status finais não voltam", () => {
  it("OS entregue ou cancelada não muda de status, mas aceita outros campos", async () => {
    const { a, usuario } = await criarCenario(db);
    const entregue = await criarOs(db, a, usuario.id, { status: "entregue", entregueEm: new Date() });
    expect(
      await erroPg(db.update(ordensServico).set({ status: "aberta" }).where(eq(ordensServico.id, entregue.id))),
    ).toEqual({ code: IMUTAVEL });
    expect(
      await erroPg(
        db.update(ordensServico).set({ quitadaEm: new Date() }).where(eq(ordensServico.id, entregue.id)),
      ),
    ).toBeNull();

    const cancelada = await criarOs(db, a, usuario.id, {
      status: "cancelada",
      canceladaEm: new Date(),
      motivoCancelamento: "cliente desistiu",
    });
    expect(
      await erroPg(
        db.update(ordensServico).set({ status: "em_execucao" }).where(eq(ordensServico.id, cancelada.id)),
      ),
    ).toEqual({ code: IMUTAVEL });
  });

  it("venda cancelada não volta a finalizada", async () => {
    const { a, usuario } = await criarCenario(db);
    const venda = await criarVenda(db, a, usuario.id, {
      status: "cancelada",
      canceladaEm: new Date(),
      canceladaPor: usuario.id,
      motivoCancelamento: "erro de digitação",
    });
    expect(
      await erroPg(db.update(vendas).set({ status: "finalizada" }).where(eq(vendas.id, venda.id))),
    ).toEqual({ code: IMUTAVEL });
  });
});

describe("comissão congelada não muda", () => {
  it("serviço da OS: valor e mecânico ficam; o acerto é preenchido uma vez", async () => {
    const { a, usuario } = await criarCenario(db);
    const [mecanico, outro] = await db
      .insert(mecanicos)
      .values([
        { empresaId: a.empresa.id, nome: "Mecânico 1" },
        { empresaId: a.empresa.id, nome: "Mecânico 2" },
      ])
      .returning();
    const os = await criarOs(db, a, usuario.id);
    const item = await criarItemServicoOs(db, a, os.id);
    const porId = eq(osItens.id, item.id);
    await db.update(osItens).set({ mecanicoId: mecanico.id, comissaoCongeladaEm: new Date() }).where(porId);

    expect(await erroPg(db.update(osItens).set({ comissaoValor: "25.00" }).where(porId))).toEqual({
      code: IMUTAVEL,
    });
    expect(await erroPg(db.update(osItens).set({ mecanicoId: outro.id }).where(porId))).toEqual({
      code: IMUTAVEL,
    });

    const acerto1 = await criarAcerto(a, usuario.id, 1, { mecanicoId: mecanico.id });
    const acerto2 = await criarAcerto(a, usuario.id, 2, { mecanicoId: mecanico.id });
    expect(await erroPg(db.update(osItens).set({ acertoId: acerto1.id }).where(porId))).toBeNull();
    expect(await erroPg(db.update(osItens).set({ acertoId: acerto2.id }).where(porId))).toEqual({
      code: IMUTAVEL,
    });
  });

  it("venda: comissão do vendedor fixa desde a finalização; acerto preenchido uma vez", async () => {
    const { a, usuario } = await criarCenario(db);
    const vendedor = await criarVendedor(a);
    const venda = await criarVenda(db, a, usuario.id, {
      vendedorId: vendedor.id,
      comissaoVendedorPercentual: "3.0000",
      comissaoVendedorBase: "10.00",
      comissaoVendedorValor: "0.30",
    });
    const porId = eq(vendas.id, venda.id);
    expect(
      await erroPg(
        db
          .update(vendas)
          .set({ comissaoVendedorPercentual: "5.0000", comissaoVendedorValor: "0.50" })
          .where(porId),
      ),
    ).toEqual({ code: IMUTAVEL });

    const acerto1 = await criarAcerto(a, usuario.id, 1, { vendedorId: vendedor.id });
    const acerto2 = await criarAcerto(a, usuario.id, 2, { vendedorId: vendedor.id });
    expect(await erroPg(db.update(vendas).set({ acertoComissaoId: acerto1.id }).where(porId))).toBeNull();
    expect(await erroPg(db.update(vendas).set({ acertoComissaoId: acerto2.id }).where(porId))).toEqual({
      code: IMUTAVEL,
    });
  });

  it("OS entregue: comissão do vendedor fixa", async () => {
    const { a, usuario } = await criarCenario(db);
    const vendedor = await criarVendedor(a);
    const os = await criarOs(db, a, usuario.id, { vendedorId: vendedor.id });
    const porId = eq(ordensServico.id, os.id);
    // a entrega congela a comissão: permitido
    expect(
      await erroPg(
        db
          .update(ordensServico)
          .set({
            status: "entregue",
            entregueEm: new Date(),
            comissaoVendedorPercentual: "3.0000",
            comissaoVendedorBase: "10.00",
            comissaoVendedorValor: "0.30",
          })
          .where(porId),
      ),
    ).toBeNull();
    expect(
      await erroPg(db.update(ordensServico).set({ comissaoVendedorBase: "20.00", comissaoVendedorValor: "0.60" }).where(porId)),
    ).toEqual({ code: IMUTAVEL });
  });
});

describe("contas de cada linha (regra 4.10)", () => {
  it("item de venda: bruto = round(qtd × preço, 2) half-up; total = bruto − descontos", async () => {
    const { a, usuario } = await criarCenario(db);
    const venda = await criarVenda(db, a, usuario.id);
    const item = (ordem: number, valores: { valorBruto: string; descontoItem?: string; valorTotal: string }) =>
      db.insert(vendaItens).values({
        empresaId: a.empresa.id,
        vendaId: venda.id,
        ordem,
        produtoId: a.produto.id,
        codigo: "000001",
        descricao: "Óleo a granel",
        unidade: "LT",
        quantidade: "0.5000",
        precoUnitario: "0.25",
        ...valores,
      });
    // 0,5 × 0,25 = 0,125 → 0,13 (half-up)
    expect(await erroPg(item(1, { valorBruto: "0.13", valorTotal: "0.13" }))).toBeNull();
    expect(await erroPg(item(2, { valorBruto: "0.12", valorTotal: "0.12" }))).toEqual({
      code: CHECK,
      constraint: "venda_itens_valor_bruto_check",
    });
    expect(await erroPg(item(3, { valorBruto: "0.13", descontoItem: "0.03", valorTotal: "0.13" }))).toEqual({
      code: CHECK,
      constraint: "venda_itens_valor_total_calculo_check",
    });
  });

  it("item de OS e de orçamento seguem a mesma conta", async () => {
    const { a, usuario } = await criarCenario(db);
    const os = await criarOs(db, a, usuario.id);
    expect(
      await erroPg(
        db.insert(osItens).values({
          empresaId: a.empresa.id,
          ordemServicoId: os.id,
          ordem: 1,
          tipo: "servico",
          descricao: "Revisão",
          quantidade: "2.0000",
          precoUnitario: "50.00",
          valorBruto: "100.00",
          descontoItem: "10.00",
          valorTotal: "100.00",
          comissaoValor: "20.00",
        }),
      ),
    ).toEqual({ code: CHECK, constraint: "os_itens_valor_total_calculo_check" });

    const [orcamento] = await db
      .insert(orcamentos)
      .values({
        empresaId: a.empresa.id,
        numero: 1,
        clienteId: a.cliente.id,
        tabelaPrecoId: a.tabela.id,
        validade: "2026-11-10",
        usuarioId: usuario.id,
      })
      .returning();
    expect(
      await erroPg(
        db.insert(orcamentoItens).values({
          empresaId: a.empresa.id,
          orcamentoId: orcamento.id,
          ordem: 1,
          tipo: "produto",
          produtoId: a.produto.id,
          descricao: "Pastilha",
          quantidade: "3.0000",
          precoUnitario: "10.00",
          valorBruto: "31.00",
          valorTotal: "31.00",
        }),
      ),
    ).toEqual({ code: CHECK, constraint: "orcamento_itens_valor_bruto_check" });
  });

  it("comissão do vendedor = round(base × percentual ÷ 100, 2)", async () => {
    const { a, usuario } = await criarCenario(db);
    const vendedor = await criarVendedor(a);
    expect(
      await erroPg(
        criarVenda(db, a, usuario.id, {
          vendedorId: vendedor.id,
          comissaoVendedorPercentual: "3.0000",
          comissaoVendedorBase: "10.00",
          comissaoVendedorValor: "0.31",
        }),
      ),
    ).toEqual({ code: CHECK, constraint: "vendas_comissao_vendedor_calculo_check" });
  });
});
