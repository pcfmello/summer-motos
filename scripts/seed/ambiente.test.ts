import { describe, expect, it } from "vitest";

import { lerConfiguracaoSeed, verificarAmbienteSeed } from "./ambiente";

describe("verificarAmbienteSeed (seed só em local e homologação)", () => {
  it.each([
    ["local", "development", false],
    ["local", undefined, false],
    ["homologacao", "development", false],
    ["homologacao", "test", false],
    ["homologacao", "production", true],
  ] as const)("SUMMER_AMBIENTE=%s, NODE_ENV=%s, forçar=%s: permitido", (ambiente, nodeEnv, forcarHomologacao) => {
    expect(verificarAmbienteSeed({ ambiente, nodeEnv, forcarHomologacao })).toEqual({ ok: true });
  });

  it.each([
    ["producao", "development", false],
    ["producao", "production", true],
    ["", "development", false],
    [undefined, "development", false],
    ["Local", "development", false],
    ["local", "production", false],
    ["local", "production", true],
    ["homologacao", "production", false],
  ] as const)("SUMMER_AMBIENTE=%s, NODE_ENV=%s, forçar=%s: recusado", (ambiente, nodeEnv, forcarHomologacao) => {
    const r = verificarAmbienteSeed({ ambiente, nodeEnv, forcarHomologacao });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).toMatch(/seed/i);
  });
});

describe("lerConfiguracaoSeed", () => {
  const completo = {
    SEED_SENHA_ADMIN: "admin-demo-local",
    SEED_SENHA_DONO: "dono-demo-local",
    SEED_SENHA_BALCAO: "balcao-demo-local",
    SEED_SENHA_ESTOQUE: "estoque-demo-local",
    SEED_SENHA_MECANICO: "mecanico-demo-local",
    SEED_PIN_DONO: "246810",
  };

  it("lê as senhas e o PIN", () => {
    const r = lerConfiguracaoSeed(completo);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.senhas.SEED_SENHA_DONO).toBe("dono-demo-local");
      expect(r.config.pinDono).toBe("246810");
    }
  });

  it("lista todas as variáveis que faltam ou são inválidas, sem mostrar valores", () => {
    const r = lerConfiguracaoSeed({ ...completo, SEED_SENHA_DONO: "", SEED_SENHA_BALCAO: "curta", SEED_PIN_DONO: "12ab" });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros.join("\n")).toMatch(/SEED_SENHA_DONO/);
      expect(r.erros.join("\n")).toMatch(/SEED_SENHA_BALCAO/);
      expect(r.erros.join("\n")).toMatch(/SEED_PIN_DONO/);
      expect(r.erros.join("\n")).not.toMatch(/curta|12ab/);
    }
  });
});
