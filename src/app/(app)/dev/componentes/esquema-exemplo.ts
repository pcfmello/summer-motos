import { z } from "zod";

import { esquemaMoeda, esquemaQuantidade } from "@/components/campos/esquemas";

/** Mesmo schema no formulário (zodResolver) e na server action. */
export const esquemaProdutoExemplo = z.object({
  descricao: z.string().trim().min(3, "Digite a descrição com pelo menos 3 letras."),
  codigo: z
    .string()
    .trim()
    .max(20, "Use no máximo 20 caracteres no código.")
    .regex(/^[0-9A-Za-z.\-/]*$/, "Use só letras, números, ponto, hífen ou barra no código."),
  preco: esquemaMoeda("o preço de venda", { maiorQue: 0 }),
  quantidade: esquemaQuantidade("a quantidade"),
});

export type ProdutoExemplo = z.infer<typeof esquemaProdutoExemplo>;
