import { describe, expect, it } from "vitest";

import { hrefComParametros, lerParametrosTabela } from "./parametros";

describe("lerParametrosTabela", () => {
  it("usa os padrões sem parâmetros", () => {
    expect(lerParametrosTabela({})).toEqual({ busca: "", pagina: 1, tamanhoPagina: 20, deslocamento: 0 });
  });

  it("lê busca, página e tamanho", () => {
    expect(lerParametrosTabela({ busca: "  pastilha ", pagina: "3", tamanho: "10" })).toEqual({
      busca: "pastilha",
      pagina: 3,
      tamanhoPagina: 10,
      deslocamento: 20,
    });
  });

  it("ignora valores inválidos", () => {
    const p = lerParametrosTabela({ pagina: "-2", tamanho: "1000" });
    expect(p.pagina).toBe(1);
    expect(p.tamanhoPagina).toBe(20);
    expect(lerParametrosTabela({ pagina: "abc" }).pagina).toBe(1);
    expect(lerParametrosTabela({ pagina: "0" }).pagina).toBe(1);
    expect(lerParametrosTabela({ busca: ["a", "b"] }).busca).toBe("a");
  });
});

describe("hrefComParametros", () => {
  it("preserva os filtros atuais e troca a página", () => {
    expect(hrefComParametros({ busca: "óleo", pagina: "1" }, { pagina: 2 })).toBe("?busca=%C3%B3leo&pagina=2");
  });

  it("remove parâmetros nulos", () => {
    expect(hrefComParametros({ busca: "x", pagina: "3" }, { busca: null, pagina: null })).toBe("?");
  });
});
