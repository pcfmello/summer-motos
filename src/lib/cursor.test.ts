import { describe, expect, it } from "vitest";

import {
  codificarCursor,
  decodificarCursor,
  recorteKeyset,
  TAMANHO_MAXIMO_CURSOR,
  type CursorKeyset,
  type ValorChave,
} from "./cursor";

describe("codificarCursor e decodificarCursor", () => {
  it("vão e voltam sem perda, inclusive com acentos", () => {
    const cursor: CursorKeyset = { o: "descricao", v: "Óleo 4T — 1 L", id: "p42" };
    const texto = codificarCursor(cursor);
    expect(texto).toMatch(/^[A-Za-z0-9_-]+$/); // base64url, seguro na URL
    expect(decodificarCursor(texto, "descricao")).toEqual({ ok: true, cursor });
  });

  it("aceitam número e null como valor", () => {
    for (const v of [36.9, 0, null]) {
      const cursor: CursorKeyset = { o: "preco", v, id: "x" };
      expect(decodificarCursor(codificarCursor(cursor), "preco")).toEqual({ ok: true, cursor });
    }
  });

  it("recusam cursor de outra ordenação", () => {
    const texto = codificarCursor({ o: "codigo", v: "000010", id: "p10" });
    expect(decodificarCursor(texto, "descricao").ok).toBe(false);
  });

  it("transformam lixo em erro amigável, sem lançar", () => {
    const invalidos: unknown[] = [
      "",
      "não é base64!",
      "abc", // base64 válido, JSON inválido
      btoa(JSON.stringify({ o: "descricao", v: "a" })).replace(/=+$/, ""), // falta id
      btoa(JSON.stringify({ o: "descricao", v: "a", id: "1", extra: 1 })).replace(/=+$/, ""), // campo a mais
      btoa(JSON.stringify({ o: "descricao", v: { $gt: "" }, id: "1" })).replace(/=+$/, ""), // tipo errado
      "a".repeat(TAMANHO_MAXIMO_CURSOR + 1),
      123,
      null,
    ];
    for (const texto of invalidos) {
      const resultado = decodificarCursor(texto, "descricao");
      expect(resultado.ok, String(texto)).toBe(false);
      if (!resultado.ok) expect(resultado.mensagem).toContain("Recarregue a página");
    }
  });

  it("codificar recusa cursor malformado", () => {
    expect(() => codificarCursor({ o: "", v: "a", id: "1" })).toThrow();
  });
});

type Item = { id: string; nome: string; preco: number };

const compararTexto = (a: ValorChave, b: ValorChave) => String(a).localeCompare(String(b), "pt-BR");
const compararNumero = (a: ValorChave, b: ValorChave) => Number(a) - Number(b);

/** Percorre todas as levas, aplicando `entreLevas` depois de cada uma. */
function percorrer(
  base: Item[],
  opcoes: { porNome?: boolean; direcao?: "asc" | "desc"; limite: number },
  entreLevas?: (numeroLeva: number, itens: Item[]) => void,
) {
  const lidos: Item[] = [];
  let cursor: CursorKeyset | null = null;
  let leva = 0;
  do {
    const resultado: { itens: Item[]; proximoCursor: CursorKeyset | null } = recorteKeyset(base, {
      ordenacao: opcoes.porNome ? "nome" : "preco",
      chave: (i) => ({ v: opcoes.porNome ? i.nome : i.preco, id: i.id }),
      comparar: opcoes.porNome ? compararTexto : compararNumero,
      direcao: opcoes.direcao,
      cursor,
      limite: opcoes.limite,
    });
    lidos.push(...resultado.itens);
    // O cursor sempre passa pelo texto opaco, como no navegador
    cursor = resultado.proximoCursor
      ? (decodificarCursor(codificarCursor(resultado.proximoCursor), resultado.proximoCursor.o) as {
          ok: true;
          cursor: CursorKeyset;
        }).cursor
      : null;
    leva += 1;
    entreLevas?.(leva, base);
  } while (cursor && leva < 1000);
  return lidos;
}

function gerarItens(quantidade: number): Item[] {
  // Muitos nomes e preços repetidos, para exercitar o desempate por id
  return Array.from({ length: quantidade }, (_, i) => ({
    id: `id-${String(i).padStart(4, "0")}`,
    nome: ["Pastilha", "Óleo", "Câmara", "Vela", "Cabo"][i % 5]!,
    preco: (i * 7) % 13,
  }));
}

describe("recorteKeyset", () => {
  it("entrega todos os itens uma única vez, com chaves repetidas", () => {
    const base = gerarItens(103);
    for (const opcoes of [
      { porNome: true, limite: 10 },
      { porNome: false, limite: 7 },
      { porNome: false, direcao: "desc" as const, limite: 50 },
    ]) {
      const lidos = percorrer(base, opcoes);
      expect(lidos).toHaveLength(103);
      expect(new Set(lidos.map((i) => i.id)).size).toBe(103);
    }
  });

  it("devolve proximoCursor null na última leva", () => {
    const resultado = recorteKeyset(gerarItens(5), {
      ordenacao: "preco",
      chave: (i) => ({ v: i.preco, id: i.id }),
      comparar: compararNumero,
      cursor: null,
      limite: 5,
    });
    expect(resultado.itens).toHaveLength(5);
    expect(resultado.proximoCursor).toBeNull();
  });

  it("não repete nem pula itens quando outros são inseridos no meio da leitura", () => {
    const base = gerarItens(60);
    const originais = new Set(base.map((i) => i.id));
    const inseridos: Item[] = [];

    const lidos = percorrer(base, { porNome: true, limite: 8 }, (leva, itens) => {
      // A cada leva, entram itens no começo, no meio e no fim da ordenação
      for (const nome of ["Amortecedor", "Pastilha", "Zíper"]) {
        const novo = { id: `novo-${leva}-${nome}`, nome, preco: 1 };
        itens.push(novo);
        inseridos.push(novo);
      }
    });

    const ids = lidos.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length); // nenhuma repetição
    for (const id of originais) expect(ids).toContain(id); // nenhum original pulado
    // Inserido depois da posição de leitura aparece; antes dela, não (é o esperado do keyset)
    expect(ids.some((id) => id.endsWith("-Zíper"))).toBe(true);
    expect(ids.some((id) => id.endsWith("-Amortecedor"))).toBe(false);
  });

  it("paginação por offset, no mesmo cenário, repetiria itens (contraexemplo)", () => {
    const base = [...gerarItens(20)].sort((a, b) => compararTexto(a.nome, b.nome) || (a.id < b.id ? -1 : 1));
    const primeira = base.slice(0, 5);
    base.unshift({ id: "novo", nome: "Amortecedor", preco: 1 });
    const segunda = base.slice(5, 10);
    expect(segunda.some((i) => primeira.includes(i))).toBe(true);
  });
});
