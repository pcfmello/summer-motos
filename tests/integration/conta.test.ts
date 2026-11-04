/**
 * "Minha conta" (D033): a troca de senha pela rota `/change-password` do Better
 * Auth (a mesma que a tela `/conta` chama) encerra as outras sessões, e o admin
 * da plataforma (que não tem empresa) também troca a senha e entra com a nova.
 * Pelo `auth.handler`, como em `auth-http.test.ts`.
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
import { criarAdminPlataforma } from "../../src/server/auth/usuarios";
import { pool as poolApp } from "../../src/server/db";
import { sessoes } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import { abrirBanco } from "./_cenario";

const { pool, db } = abrirBanco();
const BASE = process.env.BETTER_AUTH_URL!;

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

beforeEach(async () => {
  await limparTabelas(pool);
});

let ip = 0;
function post(caminho: string, corpo: unknown, cookie?: string) {
  ip += 1;
  return auth.handler(
    new Request(`${BASE}/api/auth${caminho}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: BASE,
        "x-forwarded-for": `10.77.0.${ip}`,
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(corpo),
    }),
  );
}

/** Cookie de sessão devolvido pelo login (só `nome=valor`). */
function cookieDe(resposta: Response): string {
  const valor = resposta.headers.getSetCookie().find((c) => c.includes("session_token="));
  if (!valor) throw new Error("login sem cookie de sessão");
  return valor.split(";")[0]!;
}

describe("troca de senha (/conta)", () => {
  it("o admin troca a senha: as outras sessões são encerradas e ele entra com a nova", async () => {
    const admin = await criarAdminPlataforma(db, { nome: "Admin", email: "admin@plataforma.local", senha: "senha-antiga-123" });
    const login1 = await post("/sign-in/email", { email: admin.email, password: "senha-antiga-123" });
    const login2 = await post("/sign-in/email", { email: admin.email, password: "senha-antiga-123" });
    expect(login1.status).toBe(200);
    expect(login2.status).toBe(200);
    expect(await db.select().from(sessoes).where(eq(sessoes.userId, admin.id))).toHaveLength(2);

    const errada = await post(
      "/change-password",
      { currentPassword: "nao-e-essa-123", newPassword: "senha-nova-456", revokeOtherSessions: true },
      cookieDe(login1),
    );
    expect(errada.status).toBe(400);

    const troca = await post(
      "/change-password",
      { currentPassword: "senha-antiga-123", newPassword: "senha-nova-456", revokeOtherSessions: true },
      cookieDe(login1),
    );
    expect(troca.status).toBe(200);
    // sobra só a sessão nova de quem trocou
    expect(await db.select().from(sessoes).where(eq(sessoes.userId, admin.id))).toHaveLength(1);

    expect((await post("/sign-in/email", { email: admin.email, password: "senha-antiga-123" })).status).toBe(401);
    expect((await post("/sign-in/email", { email: admin.email, password: "senha-nova-456" })).status).toBe(200);
  });
});
