import { describe, expect, it } from "vitest";

import { lerModulos } from "@/server/auth/permissoes";

import { itemAtivo, menuDoPerfil } from "./navegacao";

const TODOS_LIGADOS = lerModulos({ balcao: true, os: true, fiscal: true, mercado_livre: true, ecommerce: true, estoque: true });
const titulos = (perfil: Parameters<typeof menuDoPerfil>[0], modulos = TODOS_LIGADOS) =>
  menuDoPerfil(perfil, modulos).flatMap((g) => g.itens.map((i) => i.titulo));

describe("menuDoPerfil (matriz de permissões)", () => {
  it("mostra tudo para o dono", () => {
    expect(titulos("dono")).toEqual([
      "Início",
      "Balcão",
      "Orçamentos",
      "OS",
      "Produtos",
      "Peças por moto",
      "Estoque",
      "Cadastros",
      "Relatórios",
      "Configurações",
    ]);
  });

  it("mecânico não vê balcão, produtos, relatórios nem configurações", () => {
    expect(titulos("mecanico")).toEqual(["Início", "OS", "Peças por moto"]);
  });

  it("balcão não vê estoque, relatórios nem configurações", () => {
    expect(titulos("balcao")).toEqual(["Início", "Balcão", "Orçamentos", "OS", "Produtos", "Peças por moto", "Cadastros"]);
  });

  it("estoque vê catálogo, estoque e cadastros", () => {
    expect(titulos("estoque")).toEqual(["Início", "Produtos", "Peças por moto", "Estoque", "Cadastros"]);
  });

  it("esconde os itens de módulos desligados, inclusive para o dono", () => {
    const desligados = titulos("dono", lerModulos({}));
    expect(desligados).not.toContain("Balcão");
    expect(desligados).not.toContain("OS");
    expect(desligados).not.toContain("Estoque");
    expect(desligados).toContain("Orçamentos");
  });

  it("remove grupos vazios", () => {
    expect(menuDoPerfil("mecanico", lerModulos({})).every((g) => g.itens.length > 0)).toBe(true);
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
