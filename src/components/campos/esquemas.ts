/**
 * Schemas Zod para valores decimais vindos dos campos pt-BR. O mesmo schema
 * vale no cliente (zodResolver) e na server action: o valor é sempre string
 * decimal com ponto, nunca `number`.
 *
 * Pendência: quando existir `src/server/domain/decimal` (ou equivalente), mover
 * para lá e reexportar daqui, para as server actions não importarem de components.
 */
import Decimal from "decimal.js";
import { z } from "zod";

type OpcoesDecimal = {
  casas: number;
  /** Rótulo usado nas mensagens: "o preço", "a quantidade". */
  rotulo: string;
  minimo?: Decimal.Value;
  /** Mínimo exclusivo (ex.: preço maior que zero). */
  maiorQue?: Decimal.Value;
  permitirNegativo?: boolean;
};

function esquemaDecimal({ casas, rotulo, minimo, maiorQue, permitirNegativo = false }: OpcoesDecimal) {
  const formato = new RegExp(`^${permitirNegativo ? "-?" : ""}\\d+(\\.\\d{1,${casas}})?$`);
  return z
    .string()
    .trim()
    .min(1, `Informe ${rotulo}.`)
    .refine((valor) => formato.test(valor), {
      message: `Digite ${rotulo} só com números e vírgula, com até ${casas} casas depois da vírgula.`,
    })
    .refine((valor) => !formato.test(valor) || minimo === undefined || new Decimal(valor).gte(minimo), {
      message: `${capitalizar(rotulo)} não pode ser menor que ${String(minimo).replace(".", ",")}.`,
    })
    .refine((valor) => !formato.test(valor) || maiorQue === undefined || new Decimal(valor).gt(maiorQue), {
      message: `${capitalizar(rotulo)} precisa ser maior que ${String(maiorQue).replace(".", ",")}.`,
    });
}

function capitalizar(texto: string) {
  const semArtigo = texto.replace(/^(o|a|os|as) /, "");
  return semArtigo.charAt(0).toUpperCase() + semArtigo.slice(1);
}

/** Dinheiro: até 2 casas, não negativo por padrão. */
export function esquemaMoeda(rotulo = "o valor", opcoes: Omit<OpcoesDecimal, "casas" | "rotulo"> = {}) {
  return esquemaDecimal({ casas: 2, rotulo, minimo: opcoes.permitirNegativo ? undefined : 0, ...opcoes });
}

/** Quantidade: até 4 casas, não negativa por padrão. */
export function esquemaQuantidade(rotulo = "a quantidade", opcoes: Omit<OpcoesDecimal, "casas" | "rotulo"> = {}) {
  return esquemaDecimal({ casas: 4, rotulo, minimo: opcoes.permitirNegativo ? undefined : 0, ...opcoes });
}
