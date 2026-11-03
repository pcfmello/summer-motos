import { describe, expect, it } from "vitest";

import { itemAtivo, menuDoPerfil } from "./navegacao";

describe("menuDoPerfil", () => {
  it("mostra tudo para o dono", () => {
    const itens = menuDoPerfil("dono").flatMap((g) => g.itens.map((i) => i.titulo));
    expect(itens).toContain("Relatórios");
    expect(itens).toContain("Configurações");
  });

  it("mecânico não vê balcão, produtos, relatórios nem configurações", () => {
    const itens = menuDoPerfil("mecanico").flatMap((g) => g.itens.map((i) => i.titulo));
    expect(itens).toEqual(["Início", "OS", "Peças por moto"]);
  });

  it("remove grupos vazios", () => {
    expect(menuDoPerfil("mecanico").every((g) => g.itens.length > 0)).toBe(true);
  });
});

describe("itemAtivo", () => {
  it("ativa a home só em /", () => {
    expect(itemAtivo("/", "/")).toBe(true);
    expect(itemAtivo("/", "/produtos")).toBe(false);
  });

  it("ativa o item nas subpáginas, sem confundir prefixos", () => {
    expect(itemAtivo("/os", "/os/123")).toBe(true);
    expect(itemAtivo("/os", "/ossos")).toBe(false);
  });
});
