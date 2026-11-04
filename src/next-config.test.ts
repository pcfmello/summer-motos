/**
 * Cabeçalhos de resposta do `next.config.ts` (revisão de segurança do convite,
 * D033): `/convite/*` (token na URL) e `/login` (`?de=/convite/<token>`) nunca
 * mandam a URL no `Referer` para outro site.
 */
import { describe, expect, it } from "vitest";

import config from "../next.config";

async function cabecalhosDe(caminho: string) {
  const regras = (await config.headers?.()) ?? [];
  return regras.filter((r) => new RegExp(`^${r.source.replace(/:[a-z]+\*/gi, ".*")}$`).test(caminho)).flatMap((r) => r.headers);
}

describe("Referrer-Policy", () => {
  it.each(["/login", "/convite/abc", "/convite/abc/qualquer"])("%s responde com no-referrer", async (caminho) => {
    expect(await cabecalhosDe(caminho)).toContainEqual({ key: "Referrer-Policy", value: "no-referrer" });
  });

  it("as demais rotas não são afetadas", async () => {
    expect(await cabecalhosDe("/admin")).toEqual([]);
  });
});
