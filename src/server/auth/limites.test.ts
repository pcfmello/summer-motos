import { describe, expect, it } from "vitest";

import { CHAVE_IP_INDETERMINADO, criarArmazenamentoLimite, criarLimitePorEmail, normalizarEmail } from "./limites";

function relogio(inicio = 1_000_000) {
  let agora = inicio;
  return { agora: () => agora, avancar: (ms: number) => (agora += ms) };
}

describe("limite por IP (armazenamento do Better Auth)", () => {
  const regra = { window: 60, max: 3 };

  it("conta por chave e libera quando a janela vence", async () => {
    const r = relogio();
    const armazenamento = criarArmazenamentoLimite(r.agora);
    for (let i = 0; i < 3; i++) expect((await armazenamento.consume("1.2.3.4|/sign-in/email", regra)).allowed).toBe(true);
    expect(await armazenamento.consume("1.2.3.4|/sign-in/email", regra)).toEqual({ allowed: false, retryAfter: 60 });
    // outro IP não é afetado
    expect((await armazenamento.consume("5.6.7.8|/sign-in/email", regra)).allowed).toBe(true);
    r.avancar(60_000);
    expect((await armazenamento.consume("1.2.3.4|/sign-in/email", regra)).allowed).toBe(true);
  });

  it("IP indeterminado não vira um balde compartilhado por todos", async () => {
    const armazenamento = criarArmazenamentoLimite(relogio().agora);
    const chave = `${CHAVE_IP_INDETERMINADO}|/sign-in/email`;
    for (let i = 0; i < 50; i++) expect((await armazenamento.consume(chave, regra)).allowed).toBe(true);
  });

  it("a chave do Better Auth instalado é a esperada (aviso se a versão mudar)", () => {
    expect(CHAVE_IP_INDETERMINADO).toBe("no-trusted-ip");
  });
});

describe("limite por e-mail no login", () => {
  it("10 falhas em 15 minutos bloqueiam o e-mail normalizado", () => {
    const r = relogio();
    const limite = criarLimitePorEmail({ relogio: r.agora });
    for (let i = 0; i < 9; i++) limite.registrarFalha("Dono@Loja.com ");
    expect(limite.bloqueado("dono@loja.com")).toBeNull();
    limite.registrarFalha("dono@loja.com");
    expect(limite.bloqueado(" DONO@loja.COM")).toBeGreaterThan(0);
    expect(limite.bloqueado("outro@loja.com")).toBeNull();
  });

  it("as falhas vencem em 15 minutos a partir da primeira", () => {
    const r = relogio();
    const limite = criarLimitePorEmail({ relogio: r.agora });
    for (let i = 0; i < 10; i++) limite.registrarFalha("a@b.com");
    expect(limite.bloqueado("a@b.com")).toBe(15 * 60);
    r.avancar(15 * 60_000);
    expect(limite.bloqueado("a@b.com")).toBeNull();
  });

  it("acerto limpa as falhas", () => {
    const limite = criarLimitePorEmail({ relogio: relogio().agora });
    for (let i = 0; i < 9; i++) limite.registrarFalha("a@b.com");
    limite.limpar("a@b.com");
    limite.registrarFalha("a@b.com");
    expect(limite.bloqueado("a@b.com")).toBeNull();
  });

  it("normaliza e ignora o que não é e-mail", () => {
    expect(normalizarEmail("  Ana@Loja.COM ")).toBe("ana@loja.com");
    expect(normalizarEmail(undefined)).toBeNull();
    expect(normalizarEmail(42)).toBeNull();
    expect(normalizarEmail("")).toBeNull();
  });
});
