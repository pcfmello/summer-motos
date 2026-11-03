import { describe, expect, it } from "vitest";

import { decodificarCursor, type CursorKeyset } from "@/lib/cursor";

import { levaDeProdutos, ORDENS, PRODUTOS_FICTICIOS, type Ordem, type ProdutoFicticio } from "./_dados-ficticios";

function lerTudo(
  itens: ProdutoFicticio[],
  filtros: { busca: string; ordem: Ordem },
  entreLevas?: (leva: number) => void,
) {
  const ids: string[] = [];
  let cursor: CursorKeyset | null = null;
  let leva = 0;
  for (;;) {
    const resultado = levaDeProdutos(itens, { ...filtros, cursor });
    ids.push(...resultado.linhas.map((l) => l.id));
    leva += 1;
    entreLevas?.(leva);
    if (!resultado.proximoCursor) break;
    const lido = decodificarCursor(resultado.proximoCursor, filtros.ordem);
    if (!lido.ok) throw new Error(lido.mensagem);
    cursor = lido.cursor;
  }
  return { ids, levas: leva };
}

describe("levaDeProdutos (keyset sobre os 500 fictícios)", () => {
  it.each(ORDENS)("ordem %s: 10 levas de 50, sem repetir nem pular", (ordem) => {
    const { ids, levas } = lerTudo(PRODUTOS_FICTICIOS, { busca: "", ordem });
    expect(levas).toBe(10);
    expect(ids).toHaveLength(500);
    expect(new Set(ids).size).toBe(500);
  });

  it("primeira leva traz total, 50 linhas e cursor", () => {
    const r = levaDeProdutos(PRODUTOS_FICTICIOS, { busca: "", ordem: "descricao", cursor: null });
    expect(r.total).toBe(500);
    expect(r.linhas).toHaveLength(50);
    expect(r.proximoCursor).not.toBeNull();
  });

  it("busca ignora acento e o total acompanha", () => {
    const r = levaDeProdutos(PRODUTOS_FICTICIOS, { busca: "OLEO", ordem: "codigo", cursor: null });
    expect(r.total).toBeGreaterThan(0);
    expect(r.linhas.every((l) => /óleo/i.test(l.descricao))).toBe(true);
  });

  it("maior preço vem primeiro", () => {
    const { linhas } = levaDeProdutos(PRODUTOS_FICTICIOS, { busca: "", ordem: "preco", cursor: null });
    const precos = linhas.map((l) => Number(l.preco));
    expect(precos).toEqual([...precos].sort((a, b) => b - a));
  });

  it("produtos cadastrados durante a rolagem não duplicam nem fazem pular itens", () => {
    const itens = [...PRODUTOS_FICTICIOS];
    const { ids } = lerTudo(itens, { busca: "", ordem: "descricao" }, (leva) => {
      // A cada leva entram produtos no começo, no meio e no fim da ordem alfabética
      for (const descricao of ["Amortecedor novo", "Lâmpada nova", "Zíper novo"]) {
        itens.push({ ...PRODUTOS_FICTICIOS[0]!, id: `novo-${leva}-${descricao}`, descricao });
      }
    });
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of PRODUTOS_FICTICIOS) expect(ids).toContain(p.id);
  });
});
