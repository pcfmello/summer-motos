/**
 * Controle, por empresa (docs/modelo-dados.md, seção 10).
 *
 * - `sequencias`: contador atômico por empresa (D009). O próximo número sai de
 *   `UPDATE ... SET ultimo_valor = ultimo_valor + 1 ... RETURNING`, na mesma
 *   transação do documento. As 7 linhas são criadas junto com a empresa.
 * - `auditoria`: append-only (gatilho na migração custom deste passo, D008).
 */
import { sql } from "drizzle-orm";
import { bigint, index, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";
import {
  chaveEmpresaId,
  checkColuna,
  checkIn,
  colunaEmpresaId,
  colunaId,
  colunasTempo,
  fk,
  type Restricoes,
} from "./_comum";
import { empresas, membros, usuarios } from "./plataforma";

export const CHAVES_SEQUENCIA = [
  "produto",
  "ean",
  "orcamento",
  "venda",
  "os",
  "devolucao",
  "acerto",
] as const;

// 10.1 -----------------------------------------------------------------------
export const sequencias = pgTable(
  "sequencias",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    chave: text("chave", { enum: CHAVES_SEQUENCIA }).notNull(),
    ultimoValor: bigint("ultimo_valor", { mode: "number" }).notNull().default(0),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("sequencias", [t.empresaId], [empresas.id]),
    chaveEmpresaId("sequencias", t),
    unique("sequencias_empresa_id_chave_key").on(t.empresaId, t.chave),
    checkIn("sequencias", t.chave, CHAVES_SEQUENCIA),
    checkColuna("sequencias", t.ultimoValor, sql`${t.ultimoValor} >= 0`),
  ],
);

// 10.2 [A] -------------------------------------------------------------------
export const auditoria = pgTable(
  "auditoria",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Nulo = sistema. */
    usuarioId: uuid("usuario_id"),
    /** Dono que digitou o PIN. */
    autorizadoPor: uuid("autorizado_por"),
    /** Nome da tabela (`produtos`, `vendas`…). */
    entidade: text("entidade").notNull(),
    entidadeId: uuid("entidade_id").notNull(),
    /**
     * Catálogo de ações em código (`preco_alterado`, `custo_alterado`, …).
     * Sem CHECK, para que uma ação nova não exija migração.
     */
    acao: text("acao").notNull(),
    /** Nunca contém segredo, hash de PIN ou senha. */
    antes: jsonb("antes"),
    depois: jsonb("depois"),
    ip: text("ip"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("auditoria", [t.empresaId], [empresas.id]),
    fk("auditoria", [t.usuarioId], [usuarios.id]),
    // o dono que digitou o PIN é membro desta empresa
    fk("auditoria", [t.empresaId, t.autorizadoPor], [membros.empresaId, membros.usuarioId]),
    chaveEmpresaId("auditoria", t),
    index("auditoria_empresa_entidade_idx").on(t.empresaId, t.entidade, t.entidadeId),
    index("auditoria_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("auditoria_empresa_acao_criado_idx").on(
      t.empresaId,
      t.acao,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
  ],
);
