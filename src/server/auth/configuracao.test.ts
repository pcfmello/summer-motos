import { afterEach, describe, expect, it, vi } from "vitest";

import { lerProxiesConfiaveis, lerSegredo, lerUrlBase, usarCookiesSeguros } from "./configuracao";

afterEach(() => {
  vi.unstubAllEnvs();
});

function producao() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("NEXT_PHASE", "");
}

describe("configuração da autenticação", () => {
  it("segredo curto ou ausente falha ao subir", () => {
    vi.stubEnv("NEXT_PHASE", "");
    vi.stubEnv("BETTER_AUTH_SECRET", "curto");
    expect(() => lerSegredo()).toThrow(/BETTER_AUTH_SECRET/);
  });

  describe("BETTER_AUTH_TRUSTED_PROXIES", () => {
    it("em produção, vazia falha ao subir", () => {
      producao();
      vi.stubEnv("BETTER_AUTH_TRUSTED_PROXIES", "");
      expect(() => lerProxiesConfiaveis()).toThrow(/BETTER_AUTH_TRUSTED_PROXIES/);
      vi.stubEnv("BETTER_AUTH_TRUSTED_PROXIES", " , ");
      expect(() => lerProxiesConfiaveis()).toThrow(/BETTER_AUTH_TRUSTED_PROXIES/);
    });

    it("em produção, lista preenchida vira array", () => {
      producao();
      vi.stubEnv("BETTER_AUTH_TRUSTED_PROXIES", "10.0.0.0/8, 172.16.0.0/12");
      expect(lerProxiesConfiaveis()).toEqual(["10.0.0.0/8", "172.16.0.0/12"]);
    });

    it("fora de produção e no next build, vazia é aceita", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BETTER_AUTH_TRUSTED_PROXIES", "");
      expect(lerProxiesConfiaveis()).toEqual([]);
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("NEXT_PHASE", "phase-production-build");
      expect(lerProxiesConfiaveis()).toEqual([]);
    });

    it("recusa entrada que não é IP nem CIDR", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("BETTER_AUTH_TRUSTED_PROXIES", "10.0.0.0/8,traefik");
      expect(() => lerProxiesConfiaveis()).toThrow(/traefik/);
    });
  });

  describe("BETTER_AUTH_URL", () => {
    it("em produção, exige https", () => {
      producao();
      vi.stubEnv("BETTER_AUTH_URL", "http://summer.exemplo.com.br");
      expect(() => lerUrlBase()).toThrow(/https/);
      vi.stubEnv("BETTER_AUTH_URL", "https://summer.exemplo.com.br");
      expect(lerUrlBase()).toBe("https://summer.exemplo.com.br");
    });

    it("fora de produção, http é aceito; ausente falha", () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("NEXT_PHASE", "");
      vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
      expect(lerUrlBase()).toBe("http://localhost:3000");
      vi.stubEnv("BETTER_AUTH_URL", "");
      expect(() => lerUrlBase()).toThrow(/BETTER_AUTH_URL/);
    });
  });

  it("cookies seguros só em produção", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(usarCookiesSeguros()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(usarCookiesSeguros()).toBe(false);
  });
});
