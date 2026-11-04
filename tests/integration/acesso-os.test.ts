/**
 * Acesso à OS por perfil (seção 3, D018-P9): o mecânico só vê as OS de que é
 * responsável ou em que executou algum serviço.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { exigirAcessoOS } from "../../src/server/auth/acesso-os";
import { ErroAcessoNegado, lerModulos, type Perfil } from "../../src/server/auth/permissoes";
import { empresas, mecanicos, osItens } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import {
  abrirBanco,
  criarEmpresa,
  criarItemServicoOs,
  criarMembro,
  criarOs,
  criarTenant,
  criarUsuario,
  type EmpresaTeste,
} from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

const OS_LIGADA = lerModulos({ os: true });

function ctx(e: EmpresaTeste, usuarioId: string, perfil: Perfil, modulos = OS_LIGADA) {
  return { empresaId: e.empresa.id, usuario: { id: usuarioId }, perfil, modulos };
}

async function mecanicoComLogin(e: EmpresaTeste, email: string) {
  const usuario = await criarUsuario(db, email);
  await criarMembro(db, e.empresa.id, usuario.id, "mecanico");
  const [mecanico] = await db
    .insert(mecanicos)
    .values({ empresaId: e.empresa.id, nome: email, usuarioId: usuario.id })
    .returning();
  return { usuario, mecanico: mecanico! };
}

async function cenario() {
  const t = await criarTenant(db, "Oficina");
  const a = await criarEmpresa(db, t.id, "A");
  const b = await criarEmpresa(db, t.id, "B");
  const dono = await criarUsuario(db, "dono@teste.local");
  await criarMembro(db, a.empresa.id, dono.id, "dono");
  await criarMembro(db, b.empresa.id, dono.id, "dono");
  const balcao = await criarUsuario(db, "balcao@teste.local");
  await criarMembro(db, a.empresa.id, balcao.id, "balcao");
  const mecA = await mecanicoComLogin(a, "meca@teste.local");
  const mecB = await mecanicoComLogin(a, "mecb@teste.local");

  const osDeA = await criarOs(db, a, dono.id, { mecanicoResponsavelId: mecA.mecanico.id });
  const osDeB = await criarOs(db, a, dono.id, { mecanicoResponsavelId: mecB.mecanico.id });
  const osDeBComServicoDeA = await criarOs(db, a, dono.id, { mecanicoResponsavelId: mecB.mecanico.id });
  const item = await criarItemServicoOs(db, a, osDeBComServicoDeA.id);
  await db.update(osItens).set({ mecanicoId: mecA.mecanico.id }).where(eq(osItens.id, item.id));
  const osDaEmpresaB = await criarOs(db, b, dono.id);
  return { a, b, dono, balcao, mecA, mecB, osDeA, osDeB, osDeBComServicoDeA, item, osDaEmpresaB };
}

const acessar = (c: ReturnType<typeof ctx>, osId: string) => withTransaction((tx) => exigirAcessoOS(tx, c, osId));

async function negado(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ErroAcessoNegado);
  return erro as ErroAcessoNegado;
}

describe("exigirAcessoOS", () => {
  it("mecânico A acessa a OS de que é responsável e não acessa a do mecânico B", async () => {
    const { a, mecA, osDeA, osDeB } = await cenario();
    expect(await acessar(ctx(a, mecA.usuario.id, "mecanico"), osDeA.id)).toMatchObject({ id: osDeA.id });
    const erro = await negado(acessar(ctx(a, mecA.usuario.id, "mecanico"), osDeB.id));
    expect(erro.motivo).toBe("registro");
  });

  it("o mecânico que executou um serviço acessa a OS de outro responsável", async () => {
    const { a, mecA, mecB, osDeBComServicoDeA } = await cenario();
    expect(await acessar(ctx(a, mecA.usuario.id, "mecanico"), osDeBComServicoDeA.id)).toMatchObject({
      id: osDeBComServicoDeA.id,
      status: "aberta",
    });
    expect(await acessar(ctx(a, mecB.usuario.id, "mecanico"), osDeBComServicoDeA.id)).toBeTruthy();
  });

  it("serviço removido da OS não dá acesso", async () => {
    const { a, dono, mecA, osDeBComServicoDeA, item } = await cenario();
    await db
      .update(osItens)
      .set({ removidoEm: new Date(), removidoPor: dono.id })
      .where(eq(osItens.id, item.id));
    await negado(acessar(ctx(a, mecA.usuario.id, "mecanico"), osDeBComServicoDeA.id));
  });

  it("cadastro de mecânico desativado perde o acesso", async () => {
    const { a, mecA, osDeA } = await cenario();
    await db.update(mecanicos).set({ ativo: false }).where(eq(mecanicos.id, mecA.mecanico.id));
    await negado(acessar(ctx(a, mecA.usuario.id, "mecanico"), osDeA.id));
  });

  it("dono e balcão acessam todas as OS da empresa ativa; estoque não", async () => {
    const { a, dono, balcao, osDeB } = await cenario();
    expect(await acessar(ctx(a, dono.id, "dono"), osDeB.id)).toBeTruthy();
    expect(await acessar(ctx(a, balcao.id, "balcao"), osDeB.id)).toBeTruthy();
    expect((await negado(acessar(ctx(a, balcao.id, "estoque"), osDeB.id))).motivo).toBe("perfil");
  });

  it("OS de outra empresa não existe para a empresa ativa (A × B), nem para o dono das duas", async () => {
    const { a, dono, osDaEmpresaB } = await cenario();
    expect((await negado(acessar(ctx(a, dono.id, "dono"), osDaEmpresaB.id))).motivo).toBe("registro");
  });

  it("módulo de OS desligado bloqueia", async () => {
    const { a, dono, osDeA } = await cenario();
    await db.update(empresas).set({ modulos: {} }).where(eq(empresas.id, a.empresa.id));
    expect((await negado(acessar(ctx(a, dono.id, "dono", lerModulos({})), osDeA.id))).motivo).toBe("modulo");
  });

  it("id malformado é recusado antes de consultar", async () => {
    const { a, dono } = await cenario();
    expect((await negado(acessar(ctx(a, dono.id, "dono"), "1 or 1=1"))).motivo).toBe("registro");
  });

  it("com travar: true, bloqueia a linha da OS até o fim da transação", async () => {
    const { a, dono, osDeA } = await cenario();
    const c = ctx(a, dono.id, "dono");
    let segundaTerminou = false;
    await withTransaction(async (tx) => {
      await exigirAcessoOS(tx, c, osDeA.id, { travar: true });
      const segunda = withTransaction((tx2) => exigirAcessoOS(tx2, c, osDeA.id, { travar: true })).then(() => {
        segundaTerminou = true;
      });
      await new Promise((r) => setTimeout(r, 150));
      expect(segundaTerminou).toBe(false);
      void segunda;
    });
    await new Promise((r) => setTimeout(r, 150));
    expect(segundaTerminou).toBe(true);
  });
});
