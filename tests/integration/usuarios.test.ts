/**
 * Criação de usuário fora do cadastro público (fatia 0.6): a flag de admin da
 * plataforma só nasce pela função explícita, nunca por um campo do formulário.
 */
import { verifyPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { criarAdminPlataforma, criarUsuarioComSenha } from "../../src/server/auth/usuarios";
import { contasAcesso, usuarios } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import { abrirBanco } from "./_cenario";

const { pool, db } = abrirBanco();

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

describe("criarUsuarioComSenha", () => {
  it("cria usuário comum com conta credential e senha com hash, e-mail normalizado", async () => {
    const u = await criarUsuarioComSenha(db, { nome: " Ana ", email: " Ana@Loja.COM ", senha: "senha-forte-123" });
    const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, u.id));
    expect(linha).toMatchObject({ name: "Ana", email: "ana@loja.com", adminPlataforma: false, emailVerified: true });
    const [conta] = await db.select().from(contasAcesso).where(eq(contasAcesso.userId, u.id));
    expect(conta).toMatchObject({ providerId: "credential", accountId: u.id });
    expect(conta!.password).not.toContain("senha-forte-123");
    expect(await verifyPassword({ hash: conta!.password!, password: "senha-forte-123" })).toBe(true);
  });

  it("ignora um campo extra adminPlataforma vindo do formulário", async () => {
    const doFormulario: Record<string, unknown> = {
      nome: "Intruso",
      email: "intruso@loja.com",
      senha: "senha-forte-123",
      adminPlataforma: true,
      admin_plataforma: true,
    };
    const u = await criarUsuarioComSenha(db, doFormulario as Parameters<typeof criarUsuarioComSenha>[1]);
    const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, u.id));
    expect(linha!.adminPlataforma).toBe(false);
  });

  it("criarAdminPlataforma é o único caminho para a flag", async () => {
    const u = await criarAdminPlataforma(db, { nome: "Admin", email: "admin@summer.local", senha: "senha-forte-123" });
    const [linha] = await db.select().from(usuarios).where(eq(usuarios.id, u.id));
    expect(linha!.adminPlataforma).toBe(true);
  });

  it("recusa senha curta", async () => {
    await expect(criarUsuarioComSenha(db, { nome: "X", email: "x@loja.com", senha: "curta" })).rejects.toThrow();
  });
});
