/**
 * Rotas HTTP do Better Auth, pelo `auth.handler` (o mesmo do route handler
 * `/api/auth/[...all]`), com o banco `summer_test`:
 * - rotas desligadas devolvem 404;
 * - o login não grava `adminPlataforma` nem `empresaAtivaId` vindos do corpo;
 * - limite de falhas por e-mail, além do limite por IP.
 *
 * Cada requisição usa um `x-forwarded-for` próprio quando o teste não quer o
 * limite por IP (10 por minuto no login) no caminho.
 */
import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  try {
    process.loadEnvFile(".env"); // local; no CI as variáveis vêm do workflow
  } catch {}
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
});

vi.mock("server-only", () => ({}));

import { auth } from "../../src/server/auth/auth";
import { criarUsuarioComSenha } from "../../src/server/auth/usuarios";
import { pool as poolApp } from "../../src/server/db";
import { sessoes, usuarios } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import { abrirBanco, criarEmpresa, criarMembro, criarTenant } from "./_cenario";

const { pool, db } = abrirBanco();
const BASE = process.env.BETTER_AUTH_URL!;
const SENHA = "senha-forte-123";

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

let ipSequencial = 0;
function proximoIp() {
  ipSequencial += 1;
  return `10.${(ipSequencial >> 16) & 255}.${(ipSequencial >> 8) & 255}.${ipSequencial & 255}`;
}

function post(caminho: string, corpo: unknown, cabecalhos: Record<string, string> = {}) {
  return auth.handler(
    new Request(`${BASE}/api/auth${caminho}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": proximoIp(), ...cabecalhos },
      body: JSON.stringify(corpo),
    }),
  );
}

const entrar = (email: string, password: string, extra: Record<string, unknown> = {}) =>
  post("/sign-in/email", { email, password, ...extra });

describe("rotas desligadas", () => {
  it.each(["/sign-up/email", "/update-user", "/update-session", "/delete-user", "/change-email", "/sign-in/social"])(
    "%s devolve 404",
    async (caminho) => {
      const resposta = await post(caminho, { email: "novo@loja.com", password: SENHA, name: "Novo" });
      expect(resposta.status).toBe(404);
    },
  );

  it("o cadastro público não cria usuário", async () => {
    await post("/sign-up/email", { email: "novo@loja.com", password: SENHA, name: "Novo" });
    expect(await db.select().from(usuarios)).toHaveLength(0);
  });
});

describe("login", () => {
  it("campos extras no corpo não viram admin nem empresa ativa", async () => {
    const t = await criarTenant(db, "T");
    const e = await criarEmpresa(db, t.id, "E");
    const u = await criarUsuarioComSenha(db, { nome: "Ana", email: "ana@loja.com", senha: SENHA });
    await criarMembro(db, e.empresa.id, u.id, "balcao");

    const resposta = await entrar("ana@loja.com", SENHA, {
      adminPlataforma: true,
      admin_plataforma: true,
      empresaAtivaId: e.empresa.id,
      user: { adminPlataforma: true },
    });
    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("set-cookie")).toMatch(/summer\.session_token=/);

    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.id, u.id));
    expect(usuario!.adminPlataforma).toBe(false);
    const [sessao] = await db.select().from(sessoes).where(eq(sessoes.userId, u.id));
    expect(sessao!.empresaAtivaId).toBeNull();
  });

  it("e-mail inexistente e senha errada: mesma resposta", async () => {
    await criarUsuarioComSenha(db, { nome: "Ana", email: "ana@loja.com", senha: SENHA });
    const semConta = await entrar("ninguem@loja.com", "qualquer-senha");
    const errada = await entrar("ana@loja.com", "qualquer-senha");
    expect(semConta.status).toBe(errada.status);
    expect(await semConta.json()).toEqual(await errada.json());
  });

  it("10 falhas em IPs diferentes bloqueiam o e-mail (429 genérico), mesmo com a senha certa", async () => {
    await criarUsuarioComSenha(db, { nome: "Bia", email: "bia@loja.com", senha: SENHA });
    await criarUsuarioComSenha(db, { nome: "Caio", email: "caio@loja.com", senha: SENHA });
    for (let i = 0; i < 10; i++) expect((await entrar(i % 2 ? "BIA@loja.com" : "bia@loja.com", "errada-123")).status).toBe(401);

    const bloqueada = await entrar("bia@loja.com", SENHA);
    expect(bloqueada.status).toBe(429);
    const corpo = await bloqueada.json();
    // mesma resposta do limite por IP: não diz que é por conta
    expect(JSON.stringify(corpo)).not.toMatch(/bia|email|conta/i);

    // outra conta, do mesmo jeito, entra
    expect((await entrar("caio@loja.com", SENHA)).status).toBe(200);
  });

  it("e-mail inexistente também é limitado (não revela quem tem conta)", async () => {
    for (let i = 0; i < 10; i++) expect((await entrar("fantasma@loja.com", "errada-123")).status).toBe(401);
    expect((await entrar("fantasma@loja.com", "errada-123")).status).toBe(429);
  });

  it("um acerto antes do limite zera as falhas do e-mail", async () => {
    await criarUsuarioComSenha(db, { nome: "Davi", email: "davi@loja.com", senha: SENHA });
    for (let i = 0; i < 9; i++) await entrar("davi@loja.com", "errada-123");
    expect((await entrar("davi@loja.com", SENHA)).status).toBe(200);
    for (let i = 0; i < 9; i++) expect((await entrar("davi@loja.com", "errada-123")).status).toBe(401);
    expect((await entrar("davi@loja.com", SENHA)).status).toBe(200);
  });

  it("limite por IP: o 11º login do mesmo IP no minuto recebe 429", async () => {
    const ip = "192.0.2.10";
    for (let i = 0; i < 10; i++) {
      const resposta = await post("/sign-in/email", { email: `x${i}@loja.com`, password: "errada-123" }, { "x-forwarded-for": ip });
      expect(resposta.status).toBe(401);
    }
    expect((await post("/sign-in/email", { email: "y@loja.com", password: "errada-123" }, { "x-forwarded-for": ip })).status).toBe(429);
    // outro IP segue
    expect((await entrar("y@loja.com", "errada-123")).status).toBe(401);
  });
});
