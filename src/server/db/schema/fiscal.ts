/**
 * Fiscal, por empresa (docs/modelo-dados.md, seção 9).
 *
 * - `ref` do Focus = `documentos_fiscais.id`, gravada antes do envio (D10 do
 *   modelo): uma retentativa reusa a mesma ref e o Focus não duplica a nota.
 * - Os XMLs ficam no storage e nunca são apagados (4.16); o banco guarda só a chave.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AMBIENTES_FISCAIS,
  REGEX_CHAVE_NFE,
  REGEX_CNPJ,
  chaveEmpresaId,
  checkColuna,
  checkIn,
  checkRegex,
  colunaEmpresaId,
  colunaId,
  colunasTempo,
  dinheiro,
  fk,
  fkEmpresa,
  timestamptz,
  type Restricoes,
} from "./_comum";
import { devolucoes, ordensServico, vendas } from "./documentos";
import { entradasEstoque } from "./estoque";
import { empresas, usuarios } from "./plataforma";

export const MODELOS_NOTA = [55, 65] as const;
export const FINALIDADES_NOTA = ["normal", "devolucao", "complementar", "ajuste"] as const;
export const STATUS_DOCUMENTO_FISCAL = [
  "pendente",
  "processando",
  "autorizado",
  "erro",
  "cancelado",
  "denegado",
] as const;
export const TIPOS_EVENTO_FISCAL = ["cancelamento", "carta_correcao", "inutilizacao"] as const;
export const STATUS_EVENTO_FISCAL = ["processando", "autorizado", "erro"] as const;
export const STATUS_MANIFESTACAO = [
  "sem_manifestacao",
  "ciencia",
  "confirmada",
  "desconhecida",
  "nao_realizada",
] as const;

/** Uma nota vigente por documento de origem (D10 do modelo). */
const NOTA_VIGENTE = sql.raw("('pendente', 'processando', 'autorizado')");

// 9.1 ------------------------------------------------------------------------
export const documentosFiscais = pgTable(
  "documentos_fiscais",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    modelo: smallint("modelo").notNull(),
    finalidade: text("finalidade", { enum: FINALIDADES_NOTA }).notNull().default("normal"),
    naturezaOperacao: text("natureza_operacao").notNull(),
    /** Do `config_fiscal`. */
    serie: integer("serie").notNull(),
    /** Devolvido pelo Focus. */
    numero: bigint("numero", { mode: "number" }),
    chave: text("chave"),
    /** Ref do Focus = `id` desta linha, gravada antes do envio. */
    ref: text("ref").notNull(),
    ambiente: text("ambiente", { enum: AMBIENTES_FISCAIS }).notNull(),
    status: text("status", { enum: STATUS_DOCUMENTO_FISCAL }).notNull().default("pendente"),
    codigoStatusSefaz: text("codigo_status_sefaz"),
    /** Mensagem da SEFAZ. */
    motivoRejeicao: text("motivo_rejeicao"),
    protocolo: text("protocolo"),
    /** Storage, nunca apagado. */
    xmlChave: text("xml_chave"),
    /** DANFE/DANFCE. */
    pdfChave: text("pdf_chave"),
    // origem: três FKs tipadas em vez de tipo + id (seção 9.1)
    vendaId: uuid("venda_id"),
    ordemServicoId: uuid("ordem_servico_id"),
    devolucaoId: uuid("devolucao_id"),
    /** Nota original (devolução, complementar). */
    chaveReferenciada: text("chave_referenciada"),
    valorTotal: dinheiro("valor_total").notNull(),
    dataEmissao: timestamptz("data_emissao"),
    autorizadoEm: timestamptz("autorizado_em"),
    canceladoEm: timestamptz("cancelado_em"),
    usuarioId: uuid("usuario_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("documentos_fiscais", [t.empresaId], [empresas.id]),
    fkEmpresa("documentos_fiscais", t.empresaId, t.vendaId, vendas),
    fkEmpresa("documentos_fiscais", t.empresaId, t.ordemServicoId, ordensServico),
    fkEmpresa("documentos_fiscais", t.empresaId, t.devolucaoId, devolucoes),
    fk("documentos_fiscais", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("documentos_fiscais", t),
    // global: o webhook localiza a nota pela ref
    unique("documentos_fiscais_ref_key").on(t.ref),
    uniqueIndex("documentos_fiscais_numeracao_key")
      .on(t.empresaId, t.ambiente, t.modelo, t.serie, t.numero)
      .where(sql`${t.numero} is not null`),
    uniqueIndex("documentos_fiscais_empresa_id_chave_key")
      .on(t.empresaId, t.chave)
      .where(sql`${t.chave} is not null`),
    // nunca duas notas vigentes para o mesmo documento
    uniqueIndex("documentos_fiscais_venda_vigente_key")
      .on(t.empresaId, t.vendaId)
      .where(sql`${t.vendaId} is not null and ${t.status} in ${NOTA_VIGENTE}`),
    uniqueIndex("documentos_fiscais_ordem_servico_vigente_key")
      .on(t.empresaId, t.ordemServicoId)
      .where(sql`${t.ordemServicoId} is not null and ${t.status} in ${NOTA_VIGENTE}`),
    uniqueIndex("documentos_fiscais_devolucao_vigente_key")
      .on(t.empresaId, t.devolucaoId)
      .where(sql`${t.devolucaoId} is not null and ${t.status} in ${NOTA_VIGENTE}`),
    // tela de rejeições
    index("documentos_fiscais_pendentes_idx")
      .on(t.empresaId, t.status)
      .where(sql`${t.status} in ('processando', 'erro')`),
    checkIn("documentos_fiscais", t.modelo, MODELOS_NOTA),
    checkIn("documentos_fiscais", t.finalidade, FINALIDADES_NOTA),
    checkColuna("documentos_fiscais", t.serie, sql`${t.serie} >= 0`),
    checkRegex("documentos_fiscais", t.chave, REGEX_CHAVE_NFE),
    checkIn("documentos_fiscais", t.ambiente, AMBIENTES_FISCAIS),
    checkIn("documentos_fiscais", t.status, STATUS_DOCUMENTO_FISCAL),
    checkRegex("documentos_fiscais", t.chaveReferenciada, REGEX_CHAVE_NFE),
    check(
      "documentos_fiscais_origem_check",
      sql`num_nonnulls(${t.vendaId}, ${t.ordemServicoId}, ${t.devolucaoId}) = 1`,
    ),
  ],
);

// 9.2 ------------------------------------------------------------------------
export const eventosFiscais = pgTable(
  "eventos_fiscais",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Nulo na inutilização. */
    documentoFiscalId: uuid("documento_fiscal_id"),
    tipo: text("tipo", { enum: TIPOS_EVENTO_FISCAL }).notNull(),
    /** Carta de correção. */
    sequencia: smallint("sequencia"),
    // inutilização
    modelo: smallint("modelo"),
    serie: integer("serie"),
    numeroInicial: bigint("numero_inicial", { mode: "number" }),
    numeroFinal: bigint("numero_final", { mode: "number" }),
    /** Mínimo da SEFAZ. Na carta de correção, é o texto da correção. */
    justificativa: text("justificativa").notNull(),
    protocolo: text("protocolo"),
    status: text("status", { enum: STATUS_EVENTO_FISCAL }).notNull().default("processando"),
    mensagemSefaz: text("mensagem_sefaz"),
    xmlChave: text("xml_chave"),
    usuarioId: uuid("usuario_id").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("eventos_fiscais", [t.empresaId], [empresas.id]),
    fkEmpresa("eventos_fiscais", t.empresaId, t.documentoFiscalId, documentosFiscais),
    fk("eventos_fiscais", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("eventos_fiscais", t),
    index("eventos_fiscais_empresa_id_documento_fiscal_id_idx").on(
      t.empresaId,
      t.documentoFiscalId,
    ),
    uniqueIndex("eventos_fiscais_carta_correcao_sequencia_key")
      .on(t.documentoFiscalId, t.sequencia)
      .where(sql`${t.tipo} = 'carta_correcao'`),
    checkIn("eventos_fiscais", t.tipo, TIPOS_EVENTO_FISCAL),
    checkColuna("eventos_fiscais", t.sequencia, sql`${t.sequencia} between 1 and 20`),
    checkIn("eventos_fiscais", t.modelo, MODELOS_NOTA),
    checkColuna("eventos_fiscais", t.numeroFinal, sql`${t.numeroFinal} >= ${t.numeroInicial}`),
    checkColuna(
      "eventos_fiscais",
      t.justificativa,
      sql`char_length(${t.justificativa}) >= 15`,
    ),
    checkIn("eventos_fiscais", t.status, STATUS_EVENTO_FISCAL),
    check(
      "eventos_fiscais_tipo_documento_check",
      sql`(${t.tipo} = 'inutilizacao' and ${t.documentoFiscalId} is null and num_nonnulls(${t.modelo}, ${t.serie}, ${t.numeroInicial}, ${t.numeroFinal}) = 4) or (${t.tipo} <> 'inutilizacao' and ${t.documentoFiscalId} is not null)`,
    ),
  ],
);

// 9.3 ------------------------------------------------------------------------
export const notasRecebidas = pgTable(
  "notas_recebidas",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    chave: text("chave").notNull(),
    emitenteCnpj: text("emitente_cnpj").notNull(),
    emitenteNome: text("emitente_nome"),
    valor: dinheiro("valor"),
    /** Base do prazo de 180 dias. */
    dataEmissao: timestamptz("data_emissao").notNull(),
    /** Autorizada ou cancelada, como informado pela SEFAZ. */
    situacaoNfe: text("situacao_nfe"),
    statusManifestacao: text("status_manifestacao", { enum: STATUS_MANIFESTACAO })
      .notNull()
      .default("sem_manifestacao"),
    manifestadaEm: timestamptz("manifestada_em"),
    /** `false` = só o resumo. */
    xmlCompleto: boolean("xml_completo").notNull().default(false),
    xmlChave: text("xml_chave"),
    entradaId: uuid("entrada_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("notas_recebidas", [t.empresaId], [empresas.id]),
    fkEmpresa("notas_recebidas", t.empresaId, t.entradaId, entradasEstoque),
    chaveEmpresaId("notas_recebidas", t),
    unique("notas_recebidas_empresa_id_chave_key").on(t.empresaId, t.chave),
    // alerta de prazo
    index("notas_recebidas_empresa_manifestacao_emissao_idx").on(
      t.empresaId,
      t.statusManifestacao,
      t.dataEmissao,
    ),
    checkRegex("notas_recebidas", t.chave, REGEX_CHAVE_NFE),
    checkRegex("notas_recebidas", t.emitenteCnpj, REGEX_CNPJ),
    checkIn("notas_recebidas", t.statusManifestacao, STATUS_MANIFESTACAO),
  ],
);
