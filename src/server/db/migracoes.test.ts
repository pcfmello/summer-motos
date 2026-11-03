import { describe, expect, it } from "vitest";
import { calcularStatus, descreverUrl, type MigracaoArquivo } from "./migracoes";

const arquivo = (tag: string, quando: number, hash = `h${quando}`): MigracaoArquivo => ({
  tag,
  quando,
  hash,
});

describe("calcularStatus", () => {
  const arquivos = [arquivo("0000_a", 100), arquivo("0001_b", 200), arquivo("0002_c", 300)];

  it("banco vazio: tudo pendente", () => {
    const s = calcularStatus(arquivos, []);
    expect(s.pendentes.map((m) => m.tag)).toEqual(["0000_a", "0001_b", "0002_c"]);
    expect(s.aplicadas).toEqual([]);
  });

  it("separa aplicadas e pendentes pelo `when` do journal", () => {
    const s = calcularStatus(arquivos, [
      { quando: 100, hash: "h100" },
      { quando: 200, hash: "h200" },
    ]);
    expect(s.aplicadas.map((m) => m.tag)).toEqual(["0000_a", "0001_b"]);
    expect(s.pendentes.map((m) => m.tag)).toEqual(["0002_c"]);
    expect(s.ignoradas).toEqual([]);
    expect(s.alteradas).toEqual([]);
  });

  it("acusa a migração aplicada cujo arquivo mudou", () => {
    const s = calcularStatus(arquivos, [{ quando: 100, hash: "outro" }]);
    expect(s.alteradas.map((m) => m.tag)).toEqual(["0000_a"]);
  });

  it("acusa a migração com data antiga que o Drizzle pularia", () => {
    const s = calcularStatus(arquivos, [
      { quando: 100, hash: "h100" },
      { quando: 300, hash: "h300" },
    ]);
    expect(s.ignoradas.map((m) => m.tag)).toEqual(["0001_b"]);
    expect(s.pendentes).toEqual([]);
  });

  it("lista as aplicadas sem arquivo (código mais antigo que o banco)", () => {
    const s = calcularStatus(arquivos.slice(0, 1), [
      { quando: 100, hash: "h100" },
      { quando: 200, hash: "h200" },
    ]);
    expect(s.desconhecidas).toEqual([{ quando: 200, hash: "h200" }]);
    expect(s.pendentes).toEqual([]);
  });
});

describe("descreverUrl", () => {
  it("nunca mostra usuário e senha", () => {
    expect(descreverUrl("postgres://summer:segredo@db.interno:5433/summer")).toBe(
      "db.interno:5433/summer",
    );
    expect(descreverUrl("postgres://u:p@localhost/summer_test")).toBe("localhost:5432/summer_test");
  });
});
