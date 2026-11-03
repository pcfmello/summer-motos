import { describe, expect, it } from "vitest";

import { chaveDaLista, hrefComParametros, lerParametrosLista } from "./parametros";

const ordens = ["descricao", "codigo", "preco"] as const;

describe("lerParametrosLista", () => {
  it("usa os padrões sem parâmetros", () => {
    expect(lerParametrosLista({}, { ordens, ordemPadrao: "descricao" })).toEqual({ busca: "", ordem: "descricao" });
  });

  it("lê busca e ordem válidas", () => {
    expect(lerParametrosLista({ busca: "  pastilha ", ordem: "preco" }, { ordens, ordemPadrao: "descricao" })).toEqual({
      busca: "pastilha",
      ordem: "preco",
    });
  });

  it("ignora ordem desconhecida e usa o primeiro valor repetido", () => {
    const p = lerParametrosLista({ busca: ["a", "b"], ordem: "drop table" }, { ordens, ordemPadrao: "codigo" });
    expect(p).toEqual({ busca: "a", ordem: "codigo" });
  });
});

describe("chaveDaLista", () => {
  it("não depende da ordem dos parâmetros e muda com a busca", () => {
    expect(chaveDaLista({ busca: "x", ordem: "preco" })).toBe(chaveDaLista({ ordem: "preco", busca: "x" }));
    expect(chaveDaLista({ busca: "x" })).not.toBe(chaveDaLista({ busca: "y" }));
  });
});

describe("hrefComParametros", () => {
  it("preserva os filtros atuais e troca um deles", () => {
    expect(hrefComParametros({ busca: "óleo", ordem: "codigo" }, { ordem: "preco" })).toBe(
      "?busca=%C3%B3leo&ordem=preco",
    );
  });

  it("remove parâmetros nulos", () => {
    expect(hrefComParametros({ busca: "x" }, { busca: null })).toBe("?");
  });
});
