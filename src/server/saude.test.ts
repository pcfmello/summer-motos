import type { PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verificarBanco, versaoDaAplicacao } from "./saude";

type ClienteFalso = { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> };

function poolCom(cliente: ClienteFalso | Promise<never>) {
  return {
    connect: () =>
      cliente instanceof Promise ? cliente : Promise.resolve(cliente as unknown as PoolClient),
  };
}

describe("verificarBanco", () => {
  it("true quando o select 1 responde, e devolve a conexão ao Pool", async () => {
    const cliente = { query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }), release: vi.fn() };
    expect(await verificarBanco(poolCom(cliente), 500)).toBe(true);
    expect(cliente.query).toHaveBeenCalledWith(expect.objectContaining({ text: "select 1", query_timeout: 500 }));
    expect(cliente.release).toHaveBeenCalledWith();
  });

  it("false quando a consulta falha, e descarta a conexão", async () => {
    const erro = new Error("conexão caiu");
    const cliente = { query: vi.fn().mockRejectedValue(erro), release: vi.fn() };
    expect(await verificarBanco(poolCom(cliente), 500)).toBe(false);
    expect(cliente.release).toHaveBeenCalledWith(erro);
  });

  it("false quando a conexão é recusada", async () => {
    expect(await verificarBanco(poolCom(Promise.reject(new Error("ECONNREFUSED"))), 500)).toBe(false);
  });

  it("false dentro do prazo quando o banco não responde", async () => {
    const pendurado = { connect: () => new Promise<PoolClient>(() => {}) };
    const inicio = Date.now();
    expect(await verificarBanco(pendurado, 100)).toBe(false);
    expect(Date.now() - inicio).toBeLessThan(1_000);
  });
});

describe("versaoDaAplicacao", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("usa SUMMER_VERSAO quando definida", () => {
    vi.stubEnv("SUMMER_VERSAO", "v9.9.9");
    expect(versaoDaAplicacao()).toBe("v9.9.9");
  });

  it("sem SUMMER_VERSAO, usa o version do package.json", () => {
    vi.stubEnv("SUMMER_VERSAO", "");
    expect(versaoDaAplicacao()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
