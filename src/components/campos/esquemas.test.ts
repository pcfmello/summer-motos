import { describe, expect, it } from "vitest";

import { esquemaMoeda, esquemaQuantidade } from "./esquemas";

describe("esquemaMoeda", () => {
  const preco = esquemaMoeda("o preço", { maiorQue: 0 });

  it("aceita string decimal com até 2 casas", () => {
    expect(preco.safeParse("1234.56").success).toBe(true);
    expect(preco.safeParse("10").success).toBe(true);
  });

  it("rejeita vazio, texto pt-BR cru, casas demais e number", () => {
    expect(preco.safeParse("").error?.issues[0]?.message).toBe("Informe o preço.");
    expect(preco.safeParse("1,5").success).toBe(false);
    expect(preco.safeParse("1.555").success).toBe(false);
    expect(preco.safeParse(10).success).toBe(false);
  });

  it("aplica o mínimo exclusivo", () => {
    expect(preco.safeParse("0").error?.issues[0]?.message).toBe("Preço precisa ser maior que 0.");
  });
});

describe("esquemaQuantidade", () => {
  it("aceita até 4 casas e rejeita negativo por padrão", () => {
    const qtd = esquemaQuantidade();
    expect(qtd.safeParse("1.5").success).toBe(true);
    expect(qtd.safeParse("0.1255").success).toBe(true);
    expect(qtd.safeParse("0.12555").success).toBe(false);
    expect(qtd.safeParse("-1").success).toBe(false);
  });

  it("aceita negativo quando permitido (ajuste de estoque)", () => {
    expect(esquemaQuantidade("o ajuste", { permitirNegativo: true }).safeParse("-2.5").success).toBe(true);
  });
});
