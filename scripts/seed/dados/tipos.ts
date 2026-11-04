/**
 * Tipos dos dados do seed de demonstração (seção 8 da especificação).
 *
 * Os dados são módulos TypeScript determinísticos (nada aleatório). Dinheiro,
 * quantidade, custo e percentual são sempre texto decimal (`"12.50"`), nunca
 * `number`: viram `numeric` no banco e `Decimal` no domínio (seção 2, modelo 1.2).
 * O teste `dados.test.ts` confere isso em todos os objetos exportados.
 *
 * Imports só relativos e `import type` do schema, para o script do seed poder ser
 * empacotado como os outros (D020).
 */
import type { UNIDADES } from "../../../src/server/db/schema/catalogo";

/** Texto decimal com ponto, sem notação científica: `"10"`, `"12.50"`, `"-5.0000"`. */
export type DecimalTexto = `${number}`;

/** As duas empresas do tenant de demonstração. */
export type ChaveEmpresaDemo = "simples" | "real";
export const CHAVES_EMPRESA_DEMO = ["simples", "real"] as const satisfies readonly ChaveEmpresaDemo[];

export type Unidade = (typeof UNIDADES)[number];

export type PerfilDemo = "dono" | "balcao" | "estoque" | "mecanico";
