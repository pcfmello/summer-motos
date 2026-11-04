import { describe, expect, it } from "vitest";

import { destinoSeguro } from "./rotas-auth";

describe("destinoSeguro (sem open redirect)", () => {
  it.each([
    ["/produtos", "/produtos"],
    ["/produtos?busca=vela&pagina=2", "/produtos?busca=vela&pagina=2"],
    ["/os/123", "/os/123"],
  ])("aceita caminho interno %s", (entrada, esperado) => {
    expect(destinoSeguro(entrada)).toBe(esperado);
  });

  it.each([
    [null],
    [undefined],
    [""],
    ["https://malicioso.com"],
    ["//malicioso.com/x"],
    ["/\\malicioso.com"],
    ["javascript:alert(1)"],
    ["produtos"],
    ["/login"],
    ["/login?de=/x"],
    ["/api/auth/sign-out"],
    ["/\t/malicioso.com"],
    ["/\n/malicioso.com"],
    ["/\r//malicioso.com"],
    ["/\u0000/malicioso.com"],
    ["/x/../login"],
    ["/.//malicioso.com"],
    ["/x/..//malicioso.com"],
    ["/%2e//malicioso.com"],
    ["/a/%2e%2e//malicioso.com"],
    ["/%2E%2E//malicioso.com"],
    ["/x/../api/auth/sign-out"],
    ["/produtos\\..\\..\\malicioso.com"],
  ])("recusa %j e volta ao início", (entrada) => {
    expect(destinoSeguro(entrada)).toBe("/");
  });
});
