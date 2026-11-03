/**
 * Referência global (docs/modelo-dados.md, seção 3): cadastro de motos único
 * para todos os tenants, mantido pelo admin da plataforma. Sem `empresa_id` (4.1).
 */
import { sql } from "drizzle-orm";
import { boolean, integer, pgTable, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { checkColuna, colunaId, colunasTempo, fk, textoPtBr, type Restricoes } from "./_comum";

// 3.1 ------------------------------------------------------------------------
export const marcasMoto = pgTable(
  "marcas_moto",
  {
    ...colunaId(),
    nome: textoPtBr("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [uniqueIndex("marcas_moto_nome_key").on(sql`lower(${t.nome})`)],
);

// 3.2 ------------------------------------------------------------------------
export const modelosMoto = pgTable(
  "modelos_moto",
  {
    ...colunaId(),
    marcaMotoId: uuid("marca_moto_id").notNull(),
    /** "CG 160 Titan". */
    nome: textoPtBr("nome").notNull(),
    /** Em cc. */
    cilindrada: integer("cilindrada"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("modelos_moto", [t.marcaMotoId], [marcasMoto.id]),
    uniqueIndex("modelos_moto_marca_moto_id_nome_key").on(t.marcaMotoId, sql`lower(${t.nome})`),
    checkColuna("modelos_moto", t.cilindrada, sql`${t.cilindrada} > 0`),
  ],
);
