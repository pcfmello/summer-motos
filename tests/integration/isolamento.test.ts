/**
 * Isolamento entre tenants (X × Y) garantido pelo banco (regra 4.1, D003).
 * O isolamento A × B (mesmo tenant) pelas FKs compostas está em banco.test.ts.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  auditoria,
  clientes,
  fornecedores,
  mecanicos,
  sessoes,
  vendedores,
} from "../../src/server/db/schema";
import { erroPg, limparTabelas } from "./_banco";
import {
  abrirBanco,
  criarEmpresa,
  criarMembro,
  criarTenant,
  criarUsuario,
  criarVenda,
} from "./_cenario";

const { pool, db } = abrirBanco();
const CHECK = "23514";
const FK = "23503";

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

/** Tenant X com as empresas X1 e X2; tenant Y com a empresa Y1. Cada usuário é dono de uma empresa só. */
async function criarDoisTenants() {
  const x = await criarTenant(db, "Tenant X");
  const y = await criarTenant(db, "Tenant Y");
  const x1 = await criarEmpresa(db, x.id, "X1");
  const x2 = await criarEmpresa(db, x.id, "X2");
  const y1 = await criarEmpresa(db, y.id, "Y1");
  const donoX1 = await criarUsuario(db, "dono-x1@teste.local");
  const donoY1 = await criarUsuario(db, "dono-y1@teste.local");
  await criarMembro(db, x1.empresa.id, donoX1.id);
  await criarMembro(db, y1.empresa.id, donoY1.id);
  return { x1, x2, y1, donoX1, donoY1 };
}

describe("empresa do grupo (regra 4.15) só no mesmo tenant", () => {
  it("cliente: aceita empresa do mesmo tenant, recusa de outro tenant e a própria", async () => {
    const { x1, x2, y1 } = await criarDoisTenants();
    const cliente = (empresaGrupoId: string) =>
      db.insert(clientes).values({ empresaId: x1.empresa.id, nome: "Grupo", empresaGrupoId }).returning();

    const [ok] = await cliente(x2.empresa.id);
    expect(ok.empresaGrupoId).toBe(x2.empresa.id);
    expect(await erroPg(cliente(y1.empresa.id))).toEqual({ code: CHECK });
    expect(await erroPg(cliente(x1.empresa.id))).toEqual({
      code: CHECK,
      constraint: "clientes_empresa_grupo_id_check",
    });
    // trocar depois para outro tenant também é recusado
    expect(
      await erroPg(
        db.update(clientes).set({ empresaGrupoId: y1.empresa.id }).where(eq(clientes.id, ok.id)),
      ),
    ).toEqual({ code: CHECK });
  });

  it("fornecedor: recusa empresa de outro tenant", async () => {
    const { x1, x2, y1 } = await criarDoisTenants();
    const fornecedor = (empresaGrupoId: string) =>
      db.insert(fornecedores).values({ empresaId: x1.empresa.id, razaoSocial: "Grupo", empresaGrupoId });
    expect(await erroPg(fornecedor(x2.empresa.id))).toBeNull();
    expect(await erroPg(fornecedor(y1.empresa.id))).toEqual({ code: CHECK });
  });

  it("venda: recusa empresa de outro tenant e a própria empresa", async () => {
    const { x1, x2, y1, donoX1 } = await criarDoisTenants();
    expect(await erroPg(criarVenda(db, x1, donoX1.id, { empresaGrupoId: x2.empresa.id }))).toBeNull();
    expect(await erroPg(criarVenda(db, x1, donoX1.id, { empresaGrupoId: y1.empresa.id }))).toEqual({
      code: CHECK,
    });
    expect(await erroPg(criarVenda(db, x1, donoX1.id, { empresaGrupoId: x1.empresa.id }))).toEqual({
      code: CHECK,
      constraint: "vendas_empresa_grupo_id_check",
    });
  });
});

describe("vínculos com usuário exigem membro da empresa", () => {
  it("sessão não aceita empresa ativa da qual o usuário não é membro", async () => {
    const { x1, y1, donoX1 } = await criarDoisTenants();
    const sessao = (empresaAtivaId: string, token: string) =>
      db.insert(sessoes).values({
        token,
        userId: donoX1.id,
        expiresAt: new Date(Date.now() + 3_600_000),
        empresaAtivaId,
      });
    expect(await erroPg(sessao(x1.empresa.id, "t1"))).toBeNull();
    expect(await erroPg(sessao(y1.empresa.id, "t2"))).toEqual({
      code: FK,
      constraint: "sessoes_empresa_ativa_id_fk",
    });
  });

  it("mecânico e vendedor não usam login de membro de outra empresa", async () => {
    const { x1, donoX1, donoY1 } = await criarDoisTenants();
    expect(
      await erroPg(db.insert(mecanicos).values({ empresaId: x1.empresa.id, nome: "M1", usuarioId: donoX1.id })),
    ).toBeNull();
    expect(
      await erroPg(db.insert(mecanicos).values({ empresaId: x1.empresa.id, nome: "M2", usuarioId: donoY1.id })),
    ).toEqual({ code: FK, constraint: "mecanicos_usuario_id_fk" });
    expect(
      await erroPg(
        db.insert(vendedores).values({ empresaId: x1.empresa.id, nome: "V2", usuarioId: donoY1.id }),
      ),
    ).toEqual({ code: FK, constraint: "vendedores_usuario_id_fk" });
  });

  it("desconto e auditoria só aceitam autorização de membro da empresa", async () => {
    const { x1, donoX1, donoY1 } = await criarDoisTenants();
    expect(
      await erroPg(criarVenda(db, x1, donoX1.id, { descontoAutorizadoPor: donoX1.id })),
    ).toBeNull();
    expect(
      await erroPg(criarVenda(db, x1, donoX1.id, { descontoAutorizadoPor: donoY1.id })),
    ).toEqual({ code: FK, constraint: "vendas_desconto_autorizado_por_fk" });

    const registro = (autorizadoPor: string) =>
      db.insert(auditoria).values({
        empresaId: x1.empresa.id,
        usuarioId: donoX1.id,
        autorizadoPor,
        entidade: "vendas",
        entidadeId: x1.produto.id,
        acao: "desconto_acima_limite",
      });
    expect(await erroPg(registro(donoX1.id))).toBeNull();
    expect(await erroPg(registro(donoY1.id))).toEqual({
      code: FK,
      constraint: "auditoria_autorizado_por_fk",
    });
  });

  it("documento de um tenant não aponta para cadastro de outro", async () => {
    const { x1, y1, donoX1 } = await criarDoisTenants();
    expect(await erroPg(criarVenda(db, x1, donoX1.id, { clienteId: y1.cliente.id }))).toEqual({
      code: FK,
      constraint: "vendas_cliente_id_fk",
    });
  });
});
