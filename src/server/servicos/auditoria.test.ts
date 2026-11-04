import { describe, expect, it } from "vitest";

import { campoSensivel, limparParaAuditoria } from "./auditoria";

describe("campoSensivel", () => {
  it.each([
    "pin_hash",
    "pinHash",
    "hash",
    "focus_token_cifrado",
    "focusTokenCifrado",
    "credenciais_cifrado",
    "webhook_segredo_cifrado",
    "senha",
    "senhaCertificado",
    "password",
    "access_token",
    "refreshToken",
    "token",
    "secret",
    "csc",
    // revisão de segurança da 0.6
    "pin",
    "PIN",
    "apiKey",
    "api_key",
    "x-api-key",
    "api_chave",
    "apiChave",
    "chave_privada",
    "privateKey",
    "authorization",
    "Authorization",
    "certificado",
    "certificado_a1",
    "certificadoBase64",
    "senha_certificado",
    "csc_token",
    "cscCifrado",
    "csc_homologacao",
  ])("%s é sensível", (nome) => {
    expect(campoSensivel(nome)).toBe(true);
  });

  it.each([
    "codigo",
    "preco_venda",
    "csc_id",
    "cscId",
    "chave_acesso",
    "nome",
    "estoque_seguranca",
    "prefixo",
    "certificado_validade",
    "certificadoValidade",
    "certificado_enviado_em",
    "certificadoEnviadoEm",
    "pin_definido",
    "pin_bloqueado_ate",
    "desconto",
    "fiscal",
  ])(
    "%s não é sensível",
    (nome) => {
      expect(campoSensivel(nome)).toBe(false);
    },
  );
});

describe("limparParaAuditoria", () => {
  it("nulo continua nulo e binários somem", () => {
    expect(limparParaAuditoria(null)).toBeNull();
    expect(limparParaAuditoria({ a: Buffer.from("x"), b: new Uint8Array([1]), c: BigInt(1), d: undefined })).toEqual({
      c: "1",
      d: null,
    });
  });
});
