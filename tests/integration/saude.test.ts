/**
 * GET /api/health (fatia 0.11): chama o handler da rota de verdade, com o Pool
 * único do app (`src/server/db/index.ts`) apontando para o summer_test.
 *
 * - banco no ar: 200 com status, banco e versão;
 * - banco fora (porta sem Postgres): 503, sem mensagem de erro no corpo.
 *
 * Fora do Next:
 * - o `server-only` lança erro; aqui ele vira um módulo vazio;
 * - o `connection()` exige o escopo de uma requisição; aqui ele só resolve. Que a
 *   rota não é pré-renderizada, quem confere é o `next build` (ela sai como ƒ).
 */
import type { Pool } from "pg";
import { afterAll, describe, expect, it, vi } from "vitest";
import { urlBancoTeste } from "./_banco";

vi.mock("server-only", () => ({}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  connection: async () => {},
}));

type GlobalComPool = typeof globalThis & { __summerPool?: Pool };

/** Importa a rota de novo, com um Pool novo para a URL dada. */
async function carregarRota(url: string) {
  const global = globalThis as GlobalComPool;
  await global.__summerPool?.end();
  delete global.__summerPool;
  vi.resetModules();
  vi.stubEnv("DATABASE_URL", url);
  return import("../../src/app/api/health/route");
}

afterAll(async () => {
  await (globalThis as GlobalComPool).__summerPool?.end();
  vi.unstubAllEnvs();
});

describe("GET /api/health", () => {
  it("200 com o banco respondendo", async () => {
    vi.stubEnv("SUMMER_VERSAO", "v-teste");
    const { GET } = await carregarRota(urlBancoTeste());
    const resposta = await GET();

    expect(resposta.status).toBe(200);
    expect(resposta.headers.get("cache-control")).toBe("no-store");
    expect(await resposta.json()).toEqual({ status: "ok", banco: "ok", versao: "v-teste" });
  });

  it("503 com o banco fora, sem detalhes do erro", async () => {
    // porta 1: nada escuta, a conexão é recusada na hora
    const { GET } = await carregarRota("postgres://ninguem:senha-secreta@127.0.0.1:1/nada");
    const resposta = await GET();

    expect(resposta.status).toBe(503);
    const corpo = await resposta.json();
    expect(corpo).toEqual({ status: "erro", banco: "indisponivel", versao: expect.any(String) });
    expect(JSON.stringify(corpo)).not.toMatch(/senha|ECONNREFUSED|127\.0\.0\.1/);
  });
});
