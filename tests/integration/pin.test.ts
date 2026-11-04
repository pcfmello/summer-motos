/**
 * PIN de aprovação do dono (seção 3, D19 do modelo): hash lento, validação
 * contra os donos da empresa ativa, bloqueio de 5 erros por 15 minutos.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { definirPin, PIN_BLOQUEIO_MS, validarPinDono } from "../../src/server/auth/pin";
import { auditoria, membros } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import { abrirBanco, criarEmpresa, criarMembro, criarTenant, criarUsuario, type EmpresaTeste } from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

const AGORA = new Date("2026-11-03T15:00:00Z");

function ctxDe(e: EmpresaTeste, usuarioId: string, perfil: "dono" | "balcao" = "dono") {
  return { empresaId: e.empresa.id, usuario: { id: usuarioId }, perfil } as const;
}

async function membro(empresaId: string, usuarioId: string) {
  const [m] = await db
    .select()
    .from(membros)
    .where(and(eq(membros.empresaId, empresaId), eq(membros.usuarioId, usuarioId)));
  return m!;
}

/** Empresas A e B do mesmo tenant: dono1 e dono2 em A, donoB em B, balcão em A. */
async function cenario() {
  const t = await criarTenant(db, "Tenant");
  const a = await criarEmpresa(db, t.id, "A");
  const b = await criarEmpresa(db, t.id, "B");
  const dono1 = await criarUsuario(db, "dono1@teste.local");
  const dono2 = await criarUsuario(db, "dono2@teste.local");
  const donoB = await criarUsuario(db, "donob@teste.local");
  const balcao = await criarUsuario(db, "balcao@teste.local");
  await criarMembro(db, a.empresa.id, dono1.id, "dono");
  await criarMembro(db, a.empresa.id, dono2.id, "dono");
  await criarMembro(db, b.empresa.id, donoB.id, "dono");
  await criarMembro(db, a.empresa.id, balcao.id, "balcao");
  await withTransaction((tx) => definirPin(tx, ctxDe(a, dono1.id), "111111"));
  await withTransaction((tx) => definirPin(tx, ctxDe(a, dono2.id), "222222"));
  await withTransaction((tx) => definirPin(tx, ctxDe(b, donoB.id), "999999"));
  return { a, b, dono1, dono2, donoB, balcao };
}

const validar = (
  e: EmpresaTeste,
  pin: string,
  extra: { agora?: Date; donoUsuarioId?: string; quemTentou?: string } = {},
) =>
  validarPinDono(
    withTransaction,
    { empresaId: e.empresa.id, usuario: extra.quemTentou ? { id: extra.quemTentou } : null },
    { pin, agora: extra.agora ?? AGORA, donoUsuarioId: extra.donoUsuarioId },
  );

const INVALIDO = { ok: false, motivo: "pin_invalido" } as const;
const minutos = (n: number, base = AGORA) => new Date(base.getTime() + n * 60_000);

/** Erra o PIN até bloquear (5 vezes) a partir de `agora`. */
async function errarAteBloquear(e: EmpresaTeste, agora: Date) {
  for (let i = 0; i < 5; i++) expect(await validar(e, "000000", { agora })).toEqual(INVALIDO);
}

describe("definirPin", () => {
  it("guarda só o hash e registra auditoria sem o PIN", async () => {
    const { a, dono1 } = await cenario();
    const m = await membro(a.empresa.id, dono1.id);
    expect(m.pinHash).toBeTruthy();
    expect(m.pinHash).not.toContain("111111");

    const registros = await db.select().from(auditoria).where(eq(auditoria.entidadeId, m.id));
    expect(registros).toHaveLength(1);
    expect(registros[0]!.acao).toBe("pin_definido");
    expect(JSON.stringify(registros[0])).not.toMatch(/111111|pin_?hash|scrypt/i);
  });

  it("recusa quem não é dono e PIN fora do formato", async () => {
    const { a, dono1, balcao } = await cenario();
    expect(await withTransaction((tx) => definirPin(tx, ctxDe(a, balcao.id, "balcao"), "123456"))).toEqual({
      ok: false,
      motivo: "sem_permissao",
    });
    // perfil "dono" no contexto não basta: o membro precisa ser dono no banco
    expect(await withTransaction((tx) => definirPin(tx, ctxDe(a, balcao.id, "dono"), "123456"))).toEqual({
      ok: false,
      motivo: "sem_permissao",
    });
    for (const pin of ["12345", "123456789", "12a456", ""]) {
      expect(await withTransaction((tx) => definirPin(tx, ctxDe(a, dono1.id), pin))).toEqual({
        ok: false,
        motivo: "pin_invalido",
      });
    }
  });
});

describe("validarPinDono", () => {
  it("aceita o PIN de qualquer dono da empresa e devolve quem autorizou", async () => {
    const { a, dono1, dono2 } = await cenario();
    expect(await validar(a, "111111")).toMatchObject({ ok: true, autorizadoPor: { usuarioId: dono1.id } });
    expect(await validar(a, "222222")).toMatchObject({ ok: true, autorizadoPor: { usuarioId: dono2.id } });
  });

  it("recusa o PIN de um dono de outra empresa", async () => {
    const { a } = await cenario();
    expect(await validar(a, "999999")).toEqual(INVALIDO);
  });

  it("restrito a um dono, recusa o PIN do outro dono", async () => {
    const { a, dono1 } = await cenario();
    expect(await validar(a, "222222", { donoUsuarioId: dono1.id })).toMatchObject({ ok: false });
    expect(await validar(a, "111111", { donoUsuarioId: dono1.id })).toMatchObject({ ok: true });
  });

  it("donoUsuarioId malformado é recusado antes de consultar", async () => {
    const { a } = await cenario();
    expect(await validar(a, "111111", { donoUsuarioId: "1' or '1'='1" })).toEqual(INVALIDO);
    // não conta como falha de ninguém
    const linhas = await db.select().from(membros).where(eq(membros.empresaId, a.empresa.id));
    expect(linhas.every((m) => m.pinFalhas === 0)).toBe(true);
  });

  it("dono desativado não autoriza", async () => {
    const { a, dono1 } = await cenario();
    await db
      .update(membros)
      .set({ ativo: false })
      .where(and(eq(membros.empresaId, a.empresa.id), eq(membros.usuarioId, dono1.id)));
    expect(await validar(a, "111111")).toEqual(INVALIDO);
  });

  it("empresa sem dono com PIN", async () => {
    const t = await criarTenant(db, "Sem PIN");
    const e = await criarEmpresa(db, t.id, "Sem PIN");
    // mesma resposta de PIN errado: não revela se a empresa tem dono com PIN
    expect(await validar(e, "123456")).toEqual(INVALIDO);
  });

  it("5 erros bloqueiam por 15 minutos, mesmo com o PIN certo depois", async () => {
    const { a, dono1 } = await cenario();
    await errarAteBloquear(a, AGORA);

    const bloqueadoAte = new Date(AGORA.getTime() + PIN_BLOQUEIO_MS);
    expect(await validar(a, "111111")).toEqual({ ok: false, motivo: "bloqueado", bloqueadoAte });
    expect(await validar(a, "111111", { agora: new Date(bloqueadoAte.getTime() - 1) })).toMatchObject({
      motivo: "bloqueado",
    });

    // passado o bloqueio, o PIN certo volta a valer e zera o contador
    expect(await validar(a, "111111", { agora: bloqueadoAte })).toMatchObject({
      ok: true,
      autorizadoPor: { usuarioId: dono1.id },
    });
    const m = await membro(a.empresa.id, dono1.id);
    expect(m.pinFalhas).toBe(0);
    expect(m.pinBloqueadoAte).toBeNull();
  });

  it("acerto zera as falhas; o contador grava mesmo quando a validação falha", async () => {
    const { a, dono1 } = await cenario();
    await validar(a, "000000");
    await validar(a, "000000");
    expect((await membro(a.empresa.id, dono1.id)).pinFalhas).toBe(2);
    await validar(a, "111111");
    expect((await membro(a.empresa.id, dono1.id)).pinFalhas).toBe(0);
  });

  it("o bloqueio de uma empresa não afeta o dono da outra", async () => {
    const { a, b, donoB } = await cenario();
    for (let i = 0; i < 5; i++) await validar(a, "000000");
    expect(await validar(b, "999999")).toMatchObject({ ok: true, autorizadoPor: { usuarioId: donoB.id } });
  });

  it("tentativas simultâneas não perdem a contagem (linhas travadas)", async () => {
    const { a, dono1 } = await cenario();
    await Promise.all(Array.from({ length: 4 }, () => validar(a, "000000")));
    expect((await membro(a.empresa.id, dono1.id)).pinFalhas).toBe(4);
  });
  it("3 bloqueios seguidos sem acerto: o PIN só volta quando o dono redefinir", async () => {
    const { a, dono1, dono2 } = await cenario();
    let agora = AGORA;
    for (let bloqueio = 1; bloqueio <= 3; bloqueio++) {
      await errarAteBloquear(a, agora);
      expect(await validar(a, "111111", { agora })).toMatchObject({ ok: false, motivo: "bloqueado" });
      agora = minutos(16, agora); // passa o bloqueio temporário
    }
    // passado o tempo, continua bloqueado: agora é definitivo
    expect(await validar(a, "111111", { agora })).toEqual({ ok: false, motivo: "bloqueado", bloqueadoAte: null });
    expect(await validar(a, "111111", { agora: minutos(60 * 24, agora) })).toMatchObject({
      motivo: "bloqueado",
      bloqueadoAte: null,
    });

    // o próprio dono redefine e o PIN volta
    await withTransaction((tx) => definirPin(tx, ctxDe(a, dono1.id), "333333"));
    expect(await validar(a, "333333", { agora, donoUsuarioId: dono1.id })).toMatchObject({ ok: true });
    expect((await membro(a.empresa.id, dono1.id)).pinBloqueios).toBe(0);
    // o outro dono continua bloqueado até redefinir o dele
    expect(await validar(a, "222222", { agora, donoUsuarioId: dono2.id })).toMatchObject({ motivo: "bloqueado" });
  });

  it("um acerto entre os bloqueios zera a contagem progressiva", async () => {
    const { a, dono1 } = await cenario();
    await errarAteBloquear(a, AGORA);
    await errarAteBloquear(a, minutos(16));
    expect((await membro(a.empresa.id, dono1.id)).pinBloqueios).toBe(2);
    expect(await validar(a, "111111", { agora: minutos(32) })).toMatchObject({ ok: true });
    const m = await membro(a.empresa.id, dono1.id);
    expect(m.pinBloqueios).toBe(0);
    expect(m.pinFalhas).toBe(0);
  });

  it("bloqueios vão para a auditoria, com quem tentou e sem o PIN", async () => {
    const { a, dono1, balcao } = await cenario();
    const m = await membro(a.empresa.id, dono1.id);
    for (let i = 0; i < 5; i++) await validar(a, "000000", { quemTentou: balcao.id });
    const registros = await db.select().from(auditoria).where(eq(auditoria.entidadeId, m.id));
    const bloqueio = registros.find((r) => r.acao === "pin_bloqueado");
    expect(bloqueio).toMatchObject({ usuarioId: balcao.id, empresaId: a.empresa.id });
    expect(bloqueio!.depois).toMatchObject({ definitivo: false, bloqueios_seguidos: 1 });
    expect(JSON.stringify(registros)).not.toMatch(/000000|111111|scrypt/);
  });
});
