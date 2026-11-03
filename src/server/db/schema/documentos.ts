/**
 * Documentos comerciais, por empresa (docs/modelo-dados.md, seção 7).
 *
 * - Itens: `valor_bruto = round_half_up(qtd × preço, 2)` e
 *   `valor_total = valor_bruto − desconto_item − desconto_rateado` (regra 4.10).
 * - Numeração: `numero bigint` + `unique (empresa_id, numero)`, preenchido por
 *   `sequencias` na mesma transação (D009).
 * - A OS entregue não reabre e não gera venda (R3, D21 do modelo).
 * - `os_historico_status` e `comissao_ajustes` são append-only (gatilhos na
 *   migração custom deste passo; `comissao_ajustes` aceita só preencher o acerto).
 * - FKs para `pedidos_canal`, `pedido_canal_itens` e `documentos_fiscais` chegam
 *   nos passos 8 e 9 (seção 15), quando as tabelas de destino existem.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
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
  FORMAS_PAGAMENTO,
  REGEX_NCM,
  STATUS_FISCAL,
  chaveEmpresaId,
  checkColuna,
  checkIn,
  checkRegex,
  colunaDepositoVendavel,
  colunaEmpresaId,
  colunaId,
  colunasTempo,
  custo,
  dinheiro,
  fk,
  fkEmpresa,
  percentual,
  quantidade,
  restricoesDepositoVendavel,
  timestamptz,
  type Restricoes,
} from "./_comum";
import { pedidoCanalItens, pedidosCanal } from "./canais";
import { mecanicos, produtos, servicos, tabelasPreco, vendedores } from "./catalogo";
import { depositos, entradaItens, entradasEstoque } from "./estoque";
import { documentosFiscais } from "./fiscal";
import { clientes, fornecedores, motosCliente } from "./pessoas";
import { empresas, membros, usuarios } from "./plataforma";

export const STATUS_ORCAMENTO = ["aberto", "aprovado", "recusado", "convertido"] as const;
export const TIPOS_ITEM = ["produto", "servico"] as const;
/** `os` fica sem uso: a OS entregue não gera venda (D21 do modelo). */
export const CANAIS_VENDA_DOCUMENTO = [
  "balcao",
  "orcamento",
  "os",
  "mercado_livre",
  "ecommerce",
] as const;
export const STATUS_VENDA = ["finalizada", "cancelada"] as const;
export const EMISSORES_FISCAIS_VENDA = ["focus", "externo", "nao_fiscal"] as const;
export const EMISSORES_FISCAIS_OS = ["focus", "nao_fiscal"] as const;
export const STATUS_OS = [
  "aberta",
  "aguardando_peca",
  "em_execucao",
  "pronta",
  "entregue",
  "cancelada",
] as const;
export const BENEFICIARIOS_ACERTO = ["mecanico", "vendedor"] as const;
export const FORMAS_ACERTO = ["pix", "dinheiro"] as const;
export const TIPOS_DEVOLUCAO = ["cliente", "fornecedor"] as const;
export const STATUS_DEVOLUCAO_FORNECEDOR = ["enviado", "aceito", "recusado"] as const;
/** Não existe crédito na loja (R1). */
export const FORMAS_DEVOLUCAO = ["dinheiro", "pix", "estorno_cartao", "marketplace", "outros"] as const;

// 7.1 ------------------------------------------------------------------------
export const orcamentos = pgTable(
  "orcamentos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** `sequencias.orcamento`. */
    numero: bigint("numero", { mode: "number" }).notNull(),
    clienteId: uuid("cliente_id"),
    /** Nome livre. */
    clienteNome: text("cliente_nome"),
    motoClienteId: uuid("moto_cliente_id"),
    /** Moto em texto livre. */
    motoDescricao: text("moto_descricao"),
    /** Vai para a venda ou a OS na conversão. */
    vendedorId: uuid("vendedor_id"),
    tabelaPrecoId: uuid("tabela_preco_id").notNull(),
    /** "Vencido" é calculado (`validade < hoje` em America/Sao_Paulo), não gravado. */
    validade: date("validade", { mode: "string" }).notNull(),
    status: text("status", { enum: STATUS_ORCAMENTO }).notNull().default("aberto"),
    valorProdutos: dinheiro("valor_produtos").notNull().default("0"),
    valorServicos: dinheiro("valor_servicos").notNull().default("0"),
    /** Desconto do cabeçalho. */
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull().default("0"),
    /** Dono que digitou o PIN. */
    descontoAutorizadoPor: uuid("desconto_autorizado_por"),
    observacoes: text("observacoes"),
    /** Quem fez. */
    usuarioId: uuid("usuario_id").notNull(),
    /** Documento gerado na conversão. */
    vendaId: uuid("venda_id"),
    ordemServicoId: uuid("ordem_servico_id"),
    convertidoEm: timestamptz("convertido_em"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("orcamentos", [t.empresaId], [empresas.id]),
    fkEmpresa("orcamentos", t.empresaId, t.clienteId, clientes),
    fkEmpresa("orcamentos", t.empresaId, t.motoClienteId, motosCliente),
    fkEmpresa("orcamentos", t.empresaId, t.vendedorId, vendedores),
    fkEmpresa("orcamentos", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    // só um dono (membro desta empresa) autoriza desconto acima do limite
    fk("orcamentos", [t.empresaId, t.descontoAutorizadoPor], [membros.empresaId, membros.usuarioId]),
    fk("orcamentos", [t.usuarioId], [usuarios.id]),
    fkEmpresa("orcamentos", t.empresaId, t.vendaId, vendas),
    fkEmpresa("orcamentos", t.empresaId, t.ordemServicoId, ordensServico),
    chaveEmpresaId("orcamentos", t),
    unique("orcamentos_empresa_id_numero_key").on(t.empresaId, t.numero),
    index("orcamentos_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("orcamentos_empresa_status_criado_idx").on(
      t.empresaId,
      t.status,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("orcamentos_empresa_id_cliente_id_idx").on(t.empresaId, t.clienteId),
    index("orcamentos_empresa_id_validade_idx").on(t.empresaId, t.validade),
    checkIn("orcamentos", t.status, STATUS_ORCAMENTO),
    checkColuna("orcamentos", t.valorDesconto, sql`${t.valorDesconto} >= 0`),
    checkColuna("orcamentos", t.valorTotal, sql`${t.valorTotal} >= 0`),
    check(
      "orcamentos_cliente_check",
      sql`${t.clienteId} is not null or ${t.clienteNome} is not null`,
    ),
    check(
      "orcamentos_conversao_check",
      sql`(${t.status} = 'convertido') = (num_nonnulls(${t.vendaId}, ${t.ordemServicoId}) = 1)`,
    ),
  ],
);

// 7.2 ------------------------------------------------------------------------
export const orcamentoItens = pgTable(
  "orcamento_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    orcamentoId: uuid("orcamento_id").notNull(),
    ordem: smallint("ordem").notNull(),
    tipo: text("tipo", { enum: TIPOS_ITEM }).notNull(),
    produtoId: uuid("produto_id"),
    /** Nulo = serviço em texto livre. */
    servicoId: uuid("servico_id"),
    /** Snapshot. */
    codigo: text("codigo"),
    /** Snapshot. */
    descricao: text("descricao").notNull(),
    /** Snapshot. */
    unidade: text("unidade"),
    quantidade: quantidade("quantidade").notNull(),
    precoUnitario: dinheiro("preco_unitario").notNull(),
    valorBruto: dinheiro("valor_bruto").notNull(),
    descontoItem: dinheiro("desconto_item").notNull().default("0"),
    descontoRateado: dinheiro("desconto_rateado").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull(),
    /** Só em serviço. */
    mecanicoId: uuid("mecanico_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("orcamento_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("orcamento_itens", t.empresaId, t.orcamentoId, orcamentos),
    fkEmpresa("orcamento_itens", t.empresaId, t.produtoId, produtos),
    fkEmpresa("orcamento_itens", t.empresaId, t.servicoId, servicos),
    fkEmpresa("orcamento_itens", t.empresaId, t.mecanicoId, mecanicos),
    chaveEmpresaId("orcamento_itens", t),
    index("orcamento_itens_empresa_orcamento_ordem_idx").on(t.empresaId, t.orcamentoId, t.ordem),
    checkIn("orcamento_itens", t.tipo, TIPOS_ITEM),
    checkColuna("orcamento_itens", t.quantidade, sql`${t.quantidade} > 0`),
    checkColuna("orcamento_itens", t.precoUnitario, sql`${t.precoUnitario} >= 0`),
    checkColuna("orcamento_itens", t.descontoItem, sql`${t.descontoItem} >= 0`),
    checkColuna("orcamento_itens", t.descontoRateado, sql`${t.descontoRateado} >= 0`),
    checkColuna("orcamento_itens", t.valorTotal, sql`${t.valorTotal} >= 0`),
    // regra 4.10: round() do Postgres é half-up para valores >= 0
    checkColuna("orcamento_itens", t.valorBruto, sql`${t.valorBruto} = round(${t.quantidade} * ${t.precoUnitario}, 2)`),
    check(
      "orcamento_itens_valor_total_calculo_check",
      sql`${t.valorTotal} = ${t.valorBruto} - ${t.descontoItem} - ${t.descontoRateado}`,
    ),
    check(
      "orcamento_itens_tipo_referencia_check",
      sql`(${t.tipo} = 'produto' and ${t.produtoId} is not null and ${t.servicoId} is null and ${t.mecanicoId} is null) or (${t.tipo} = 'servico' and ${t.produtoId} is null)`,
    ),
  ],
);

// 7.10 (vem antes de vendas, OS e itens, que apontam para ela) ---------------
export const acertosComissao = pgTable(
  "acertos_comissao",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** `sequencias.acerto` (numeração única para mecânicos e vendedores, D23 do modelo). */
    numero: bigint("numero", { mode: "number" }).notNull(),
    beneficiarioTipo: text("beneficiario_tipo", { enum: BENEFICIARIOS_ACERTO }).notNull(),
    mecanicoId: uuid("mecanico_id"),
    vendedorId: uuid("vendedor_id"),
    periodoInicio: date("periodo_inicio", { mode: "string" }).notNull(),
    periodoFim: date("periodo_fim", { mode: "string" }).notNull(),
    valor: dinheiro("valor").notNull(),
    forma: text("forma", { enum: FORMAS_ACERTO }).notNull(),
    pagoPor: uuid("pago_por").notNull(),
    pagoEm: timestamptz("pago_em").notNull().defaultNow(),
    observacoes: text("observacoes"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("acertos_comissao", [t.empresaId], [empresas.id]),
    fkEmpresa("acertos_comissao", t.empresaId, t.mecanicoId, mecanicos),
    fkEmpresa("acertos_comissao", t.empresaId, t.vendedorId, vendedores),
    fk("acertos_comissao", [t.pagoPor], [usuarios.id]),
    chaveEmpresaId("acertos_comissao", t),
    unique("acertos_comissao_empresa_id_numero_key").on(t.empresaId, t.numero),
    index("acertos_comissao_empresa_mecanico_pago_idx").on(
      t.empresaId,
      t.mecanicoId,
      t.pagoEm.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("acertos_comissao_empresa_vendedor_pago_idx").on(
      t.empresaId,
      t.vendedorId,
      t.pagoEm.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("acertos_comissao_empresa_pago_idx").on(
      t.empresaId,
      t.pagoEm.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    checkIn("acertos_comissao", t.beneficiarioTipo, BENEFICIARIOS_ACERTO),
    checkColuna("acertos_comissao", t.periodoFim, sql`${t.periodoFim} >= ${t.periodoInicio}`),
    checkColuna("acertos_comissao", t.valor, sql`${t.valor} > 0`),
    checkIn("acertos_comissao", t.forma, FORMAS_ACERTO),
    check(
      "acertos_comissao_beneficiario_check",
      sql`(${t.beneficiarioTipo} = 'mecanico' and ${t.mecanicoId} is not null and ${t.vendedorId} is null) or (${t.beneficiarioTipo} = 'vendedor' and ${t.vendedorId} is not null and ${t.mecanicoId} is null)`,
    ),
  ],
);

// 7.3 ------------------------------------------------------------------------
export const vendas = pgTable(
  "vendas",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** `sequencias.venda`. */
    numero: bigint("numero", { mode: "number" }).notNull(),
    /** Consumidor final, se não informado (e sempre nas vendas de canal, D24 do modelo). */
    clienteId: uuid("cliente_id").notNull(),
    /** Snapshot de `clientes.empresa_grupo_id`: os consolidados excluem por aqui (4.15). */
    empresaGrupoId: uuid("empresa_grupo_id"),
    canal: text("canal", { enum: CANAIS_VENDA_DOCUMENTO }).notNull().default("balcao"),
    pedidoCanalId: uuid("pedido_canal_id"),
    orcamentoId: uuid("orcamento_id"),
    depositoId: uuid("deposito_id").notNull(),
    ...colunaDepositoVendavel(),
    tabelaPrecoId: uuid("tabela_preco_id").notNull(),
    /** Escolhido no balcão. Nulo nas vendas de canal. */
    vendedorId: uuid("vendedor_id"),
    /** Cópia de `vendedores.percentual_comissao` na finalização. */
    comissaoVendedorPercentual: percentual("comissao_vendedor_percentual"),
    /** Valor líquido das peças: soma de `venda_itens.valor_total`, sem frete. */
    comissaoVendedorBase: dinheiro("comissao_vendedor_base"),
    /** `round_half_up(base × percentual ÷ 100, 2)`. */
    comissaoVendedorValor: dinheiro("comissao_vendedor_valor"),
    /** Acerto que pagou a comissão do vendedor. */
    acertoComissaoId: uuid("acerto_comissao_id"),
    status: text("status", { enum: STATUS_VENDA }).notNull().default("finalizada"),
    valorProdutos: dinheiro("valor_produtos").notNull(),
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    /** Pedidos de canal. */
    valorFrete: dinheiro("valor_frete").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull(),
    descontoAutorizadoPor: uuid("desconto_autorizado_por"),
    statusFiscal: text("status_fiscal", { enum: STATUS_FISCAL }).notNull().default("nao_emitido"),
    emissorFiscal: text("emissor_fiscal", { enum: EMISSORES_FISCAIS_VENDA }),
    /** Nota vigente. */
    documentoFiscalId: uuid("documento_fiscal_id"),
    finalizadaEm: timestamptz("finalizada_em").notNull().defaultNow(),
    /** Operador logado; nulo em pedido de canal processado pelo worker. */
    usuarioId: uuid("usuario_id"),
    canceladaEm: timestamptz("cancelada_em"),
    /** Só o dono. */
    canceladaPor: uuid("cancelada_por"),
    motivoCancelamento: text("motivo_cancelamento"),
    observacoes: text("observacoes"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("vendas", [t.empresaId], [empresas.id]),
    fkEmpresa("vendas", t.empresaId, t.clienteId, clientes),
    fk("vendas", [t.empresaGrupoId], [empresas.id]),
    fkEmpresa("vendas", t.empresaId, t.pedidoCanalId, pedidosCanal),
    fkEmpresa("vendas", t.empresaId, t.orcamentoId, orcamentos),
    ...restricoesDepositoVendavel("vendas", t, depositos),
    fkEmpresa("vendas", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    fkEmpresa("vendas", t.empresaId, t.vendedorId, vendedores),
    fkEmpresa("vendas", t.empresaId, t.acertoComissaoId, acertosComissao),
    // só um dono (membro desta empresa) autoriza desconto acima do limite
    fk("vendas", [t.empresaId, t.descontoAutorizadoPor], [membros.empresaId, membros.usuarioId]),
    fkEmpresa("vendas", t.empresaId, t.documentoFiscalId, documentosFiscais),
    fk("vendas", [t.usuarioId], [usuarios.id]),
    fk("vendas", [t.canceladaPor], [usuarios.id]),
    chaveEmpresaId("vendas", t),
    unique("vendas_empresa_id_numero_key").on(t.empresaId, t.numero),
    // o faturamento do pedido é idempotente
    uniqueIndex("vendas_pedido_canal_id_key")
      .on(t.empresaId, t.pedidoCanalId)
      .where(sql`${t.pedidoCanalId} is not null`),
    uniqueIndex("vendas_orcamento_id_key")
      .on(t.empresaId, t.orcamentoId)
      .where(sql`${t.orcamentoId} is not null`),
    index("vendas_empresa_finalizada_idx").on(
      t.empresaId,
      t.finalizadaEm.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("vendas_empresa_canal_finalizada_idx").on(
      t.empresaId,
      t.canal,
      t.finalizadaEm.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("vendas_empresa_id_cliente_id_idx").on(t.empresaId, t.clienteId),
    // comissões a pagar
    index("vendas_comissao_a_pagar_idx")
      .on(t.empresaId, t.vendedorId, t.finalizadaEm)
      .where(sql`${t.vendedorId} is not null and ${t.acertoComissaoId} is null`),
    // tela de rejeições
    index("vendas_status_fiscal_pendente_idx")
      .on(t.empresaId, t.statusFiscal)
      .where(sql`${t.statusFiscal} in ('processando', 'erro')`),
    checkIn("vendas", t.canal, CANAIS_VENDA_DOCUMENTO),
    checkColuna(
      "vendas",
      t.comissaoVendedorPercentual,
      sql`${t.comissaoVendedorPercentual} between 0 and 100`,
    ),
    checkColuna("vendas", t.comissaoVendedorBase, sql`${t.comissaoVendedorBase} >= 0`),
    checkColuna("vendas", t.comissaoVendedorValor, sql`${t.comissaoVendedorValor} >= 0`),
    checkIn("vendas", t.status, STATUS_VENDA),
    checkColuna("vendas", t.valorDesconto, sql`${t.valorDesconto} >= 0`),
    checkColuna("vendas", t.valorFrete, sql`${t.valorFrete} >= 0`),
    checkColuna("vendas", t.valorTotal, sql`${t.valorTotal} >= 0`),
    checkIn("vendas", t.statusFiscal, STATUS_FISCAL),
    checkIn("vendas", t.emissorFiscal, EMISSORES_FISCAIS_VENDA),
    check(
      "vendas_cancelamento_check",
      sql`${t.status} <> 'cancelada' or (${t.canceladaEm} is not null and ${t.canceladaPor} is not null and ${t.motivoCancelamento} is not null)`,
    ),
    check(
      "vendas_pedido_canal_check",
      sql`(${t.canal} in ('mercado_livre', 'ecommerce')) = (${t.pedidoCanalId} is not null)`,
    ),
    check(
      "vendas_comissao_completa_check",
      sql`num_nonnulls(${t.comissaoVendedorPercentual}, ${t.comissaoVendedorBase}, ${t.comissaoVendedorValor}) in (0, 3)`,
    ),
    // a venda nasce finalizada, então a comissão é gravada na inserção
    check(
      "vendas_comissao_vendedor_check",
      sql`(${t.vendedorId} is null) = (${t.comissaoVendedorValor} is null)`,
    ),
    // o tenant igual é conferido pelo gatilho validar_empresa_grupo() (regra 4.15)
    checkColuna("vendas", t.empresaGrupoId, sql`${t.empresaGrupoId} <> ${t.empresaId}`),
    check(
      "vendas_comissao_vendedor_calculo_check",
      sql`${t.comissaoVendedorValor} = round(${t.comissaoVendedorBase} * ${t.comissaoVendedorPercentual} / 100, 2)`,
    ),
    check(
      "vendas_acerto_comissao_check",
      sql`${t.acertoComissaoId} is null or ${t.vendedorId} is not null`,
    ),
  ],
);

// 7.4 ------------------------------------------------------------------------
export const vendaItens = pgTable(
  "venda_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    vendaId: uuid("venda_id").notNull(),
    ordem: smallint("ordem").notNull(),
    produtoId: uuid("produto_id").notNull(),
    pedidoCanalItemId: uuid("pedido_canal_item_id"),
    /** Snapshot. */
    codigo: text("codigo").notNull(),
    /** Snapshot. */
    descricao: text("descricao").notNull(),
    /** Snapshot. */
    ncm: text("ncm"),
    /** Snapshot. */
    unidade: text("unidade").notNull(),
    quantidade: quantidade("quantidade").notNull(),
    precoUnitario: dinheiro("preco_unitario").notNull(),
    valorBruto: dinheiro("valor_bruto").notNull(),
    descontoItem: dinheiro("desconto_item").notNull().default("0"),
    descontoRateado: dinheiro("desconto_rateado").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull(),
    /** CMV: custo médio no momento da baixa. Nulo = custo desconhecido (D25 do modelo). */
    custoUnitario: custo("custo_unitario"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("venda_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("venda_itens", t.empresaId, t.vendaId, vendas),
    fkEmpresa("venda_itens", t.empresaId, t.produtoId, produtos),
    fkEmpresa("venda_itens", t.empresaId, t.pedidoCanalItemId, pedidoCanalItens),
    chaveEmpresaId("venda_itens", t),
    index("venda_itens_empresa_venda_ordem_idx").on(t.empresaId, t.vendaId, t.ordem),
    index("venda_itens_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkRegex("venda_itens", t.ncm, REGEX_NCM),
    checkColuna("venda_itens", t.quantidade, sql`${t.quantidade} > 0`),
    checkColuna("venda_itens", t.precoUnitario, sql`${t.precoUnitario} >= 0`),
    checkColuna("venda_itens", t.descontoItem, sql`${t.descontoItem} >= 0`),
    checkColuna("venda_itens", t.descontoRateado, sql`${t.descontoRateado} >= 0`),
    checkColuna("venda_itens", t.valorTotal, sql`${t.valorTotal} >= 0`),
    // regra 4.10: round() do Postgres é half-up para valores >= 0
    checkColuna("venda_itens", t.valorBruto, sql`${t.valorBruto} = round(${t.quantidade} * ${t.precoUnitario}, 2)`),
    check(
      "venda_itens_valor_total_calculo_check",
      sql`${t.valorTotal} = ${t.valorBruto} - ${t.descontoItem} - ${t.descontoRateado}`,
    ),
    checkColuna("venda_itens", t.custoUnitario, sql`${t.custoUnitario} >= 0`),
  ],
);

// 7.5 ------------------------------------------------------------------------
export const vendaPagamentos = pgTable(
  "venda_pagamentos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    vendaId: uuid("venda_id").notNull(),
    forma: text("forma", { enum: FORMAS_PAGAMENTO }).notNull(),
    /** Valor que abate a venda (sem o troco). */
    valor: dinheiro("valor").notNull(),
    parcelas: smallint("parcelas").notNull().default(1),
    troco: dinheiro("troco").notNull().default("0"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("venda_pagamentos", [t.empresaId], [empresas.id]),
    fkEmpresa("venda_pagamentos", t.empresaId, t.vendaId, vendas),
    chaveEmpresaId("venda_pagamentos", t),
    index("venda_pagamentos_empresa_id_venda_id_idx").on(t.empresaId, t.vendaId),
    checkIn("venda_pagamentos", t.forma, FORMAS_PAGAMENTO),
    checkColuna("venda_pagamentos", t.valor, sql`${t.valor} > 0`),
    checkColuna("venda_pagamentos", t.parcelas, sql`${t.parcelas} between 1 and 48`),
    checkColuna("venda_pagamentos", t.troco, sql`${t.troco} >= 0`),
    check(
      "venda_pagamentos_troco_dinheiro_check",
      sql`${t.forma} = 'dinheiro' or ${t.troco} = 0`,
    ),
  ],
);

// 7.6 ------------------------------------------------------------------------
export const ordensServico = pgTable(
  "ordens_servico",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** `sequencias.os`. */
    numero: bigint("numero", { mode: "number" }).notNull(),
    clienteId: uuid("cliente_id").notNull(),
    /** Cadastro rápido na abertura. */
    motoClienteId: uuid("moto_cliente_id").notNull(),
    kmEntrada: integer("km_entrada"),
    defeitoRelatado: text("defeito_relatado").notNull(),
    diagnostico: text("diagnostico"),
    mecanicoResponsavelId: uuid("mecanico_responsavel_id"),
    /** Escolhido na OS; pode ser diferente de quem está logado. */
    vendedorId: uuid("vendedor_id"),
    /** Congelado na entrega. */
    comissaoVendedorPercentual: percentual("comissao_vendedor_percentual"),
    /** Valor líquido das peças não removidas. */
    comissaoVendedorBase: dinheiro("comissao_vendedor_base"),
    comissaoVendedorValor: dinheiro("comissao_vendedor_valor"),
    /** Acerto que pagou a comissão do vendedor. */
    acertoComissaoId: uuid("acerto_comissao_id"),
    previsaoEntrega: timestamptz("previsao_entrega"),
    /** `entregue` e `cancelada` são finais: a OS fechada não reabre (R3). */
    status: text("status", { enum: STATUS_OS }).notNull().default("aberta"),
    orcamentoId: uuid("orcamento_id"),
    depositoId: uuid("deposito_id").notNull(),
    ...colunaDepositoVendavel(),
    tabelaPrecoId: uuid("tabela_preco_id").notNull(),
    valorPecas: dinheiro("valor_pecas").notNull().default("0"),
    valorServicos: dinheiro("valor_servicos").notNull().default("0"),
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull().default("0"),
    descontoAutorizadoPor: uuid("desconto_autorizado_por"),
    /** Quando os pagamentos somam o total. Só informativo (R2). */
    quitadaEm: timestamptz("quitada_em"),
    /** Fechamento da OS: congela as comissões do mecânico e do vendedor. */
    entregueEm: timestamptz("entregue_em"),
    entreguePor: uuid("entregue_por"),
    canceladaEm: timestamptz("cancelada_em"),
    motivoCancelamento: text("motivo_cancelamento"),
    statusFiscal: text("status_fiscal", { enum: STATUS_FISCAL }).notNull().default("nao_emitido"),
    emissorFiscal: text("emissor_fiscal", { enum: EMISSORES_FISCAIS_OS }),
    documentoFiscalId: uuid("documento_fiscal_id"),
    /** Quem abriu. */
    usuarioId: uuid("usuario_id").notNull(),
    observacoes: text("observacoes"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("ordens_servico", [t.empresaId], [empresas.id]),
    fkEmpresa("ordens_servico", t.empresaId, t.clienteId, clientes),
    fkEmpresa("ordens_servico", t.empresaId, t.motoClienteId, motosCliente),
    fkEmpresa("ordens_servico", t.empresaId, t.mecanicoResponsavelId, mecanicos),
    fkEmpresa("ordens_servico", t.empresaId, t.vendedorId, vendedores),
    fkEmpresa("ordens_servico", t.empresaId, t.acertoComissaoId, acertosComissao),
    fkEmpresa("ordens_servico", t.empresaId, t.orcamentoId, orcamentos),
    ...restricoesDepositoVendavel("ordens_servico", t, depositos),
    fkEmpresa("ordens_servico", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    // só um dono (membro desta empresa) autoriza desconto acima do limite
    fk("ordens_servico", [t.empresaId, t.descontoAutorizadoPor], [membros.empresaId, membros.usuarioId]),
    fk("ordens_servico", [t.entreguePor], [usuarios.id]),
    fkEmpresa("ordens_servico", t.empresaId, t.documentoFiscalId, documentosFiscais),
    fk("ordens_servico", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("ordens_servico", t),
    unique("ordens_servico_empresa_id_numero_key").on(t.empresaId, t.numero),
    uniqueIndex("ordens_servico_orcamento_id_key")
      .on(t.empresaId, t.orcamentoId)
      .where(sql`${t.orcamentoId} is not null`),
    // lista e kanban, paginação keyset (1.11)
    index("ordens_servico_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("ordens_servico_empresa_status_criado_idx").on(
      t.empresaId,
      t.status,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("ordens_servico_empresa_mecanico_status_idx").on(
      t.empresaId,
      t.mecanicoResponsavelId,
      t.status,
    ),
    // comissões a pagar
    index("ordens_servico_comissao_a_pagar_idx")
      .on(t.empresaId, t.vendedorId, t.entregueEm)
      .where(sql`${t.vendedorId} is not null and ${t.acertoComissaoId} is null`),
    // histórico por placa
    index("ordens_servico_empresa_id_moto_cliente_id_idx").on(t.empresaId, t.motoClienteId),
    index("ordens_servico_empresa_id_cliente_id_idx").on(t.empresaId, t.clienteId),
    checkColuna("ordens_servico", t.kmEntrada, sql`${t.kmEntrada} >= 0`),
    checkColuna(
      "ordens_servico",
      t.comissaoVendedorPercentual,
      sql`${t.comissaoVendedorPercentual} between 0 and 100`,
    ),
    checkColuna("ordens_servico", t.comissaoVendedorBase, sql`${t.comissaoVendedorBase} >= 0`),
    checkColuna("ordens_servico", t.comissaoVendedorValor, sql`${t.comissaoVendedorValor} >= 0`),
    checkIn("ordens_servico", t.status, STATUS_OS),
    checkColuna("ordens_servico", t.valorDesconto, sql`${t.valorDesconto} >= 0`),
    checkColuna("ordens_servico", t.valorTotal, sql`${t.valorTotal} >= 0`),
    checkIn("ordens_servico", t.statusFiscal, STATUS_FISCAL),
    checkIn("ordens_servico", t.emissorFiscal, EMISSORES_FISCAIS_OS),
    check(
      "ordens_servico_entrega_check",
      sql`${t.status} <> 'entregue' or ${t.entregueEm} is not null`,
    ),
    check(
      "ordens_servico_cancelamento_check",
      sql`${t.status} <> 'cancelada' or (${t.canceladaEm} is not null and ${t.motivoCancelamento} is not null)`,
    ),
    check(
      "ordens_servico_comissao_completa_check",
      sql`num_nonnulls(${t.comissaoVendedorPercentual}, ${t.comissaoVendedorBase}, ${t.comissaoVendedorValor}) in (0, 3)`,
    ),
    check(
      "ordens_servico_comissao_entregue_check",
      sql`${t.comissaoVendedorValor} is null or (${t.status} = 'entregue' and ${t.vendedorId} is not null)`,
    ),
    check(
      "ordens_servico_comissao_congelada_check",
      sql`${t.status} <> 'entregue' or ${t.vendedorId} is null or ${t.comissaoVendedorValor} is not null`,
    ),
    check(
      "ordens_servico_comissao_vendedor_calculo_check",
      sql`${t.comissaoVendedorValor} = round(${t.comissaoVendedorBase} * ${t.comissaoVendedorPercentual} / 100, 2)`,
    ),
    check(
      "ordens_servico_acerto_comissao_check",
      sql`${t.acertoComissaoId} is null or ${t.comissaoVendedorValor} is not null`,
    ),
  ],
);

// 7.7 ------------------------------------------------------------------------
export const osItens = pgTable(
  "os_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    ordemServicoId: uuid("ordem_servico_id").notNull(),
    ordem: smallint("ordem").notNull(),
    tipo: text("tipo", { enum: TIPOS_ITEM }).notNull(),
    /** Snapshot ou texto livre. */
    descricao: text("descricao").notNull(),
    quantidade: quantidade("quantidade").notNull(),
    /** No serviço, é o valor da mão de obra (editável). */
    precoUnitario: dinheiro("preco_unitario").notNull(),
    valorBruto: dinheiro("valor_bruto").notNull(),
    descontoItem: dinheiro("desconto_item").notNull().default("0"),
    descontoRateado: dinheiro("desconto_rateado").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull(),
    // peça: a reserva ativa fica em `estoque_reservas.os_item_id` (D7 do modelo)
    produtoId: uuid("produto_id"),
    /** Snapshot. */
    codigo: text("codigo"),
    /** Snapshot. */
    ncm: text("ncm"),
    /** Snapshot. */
    unidade: text("unidade"),
    /** CMV gravado na baixa (entrega). Nulo também quando o custo é desconhecido. */
    custoUnitario: custo("custo_unitario"),
    // serviço
    /** Opcional (texto livre). */
    servicoId: uuid("servico_id"),
    /** Quem executou. Exigido na entrega (action). */
    mecanicoId: uuid("mecanico_id"),
    /** Vem do serviço; só o dono edita; obrigatório no serviço livre. */
    comissaoValor: dinheiro("comissao_valor"),
    /** Preenchida na entrega da OS, sem depender do pagamento (R2). */
    comissaoCongeladaEm: timestamptz("comissao_congelada_em"),
    /** Acerto do mecânico que pagou este serviço. */
    acertoId: uuid("acerto_id"),
    /** Exclusão lógica: reservas e auditoria apontam para a linha. Só com a OS aberta. */
    removidoEm: timestamptz("removido_em"),
    removidoPor: uuid("removido_por"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("os_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("os_itens", t.empresaId, t.ordemServicoId, ordensServico),
    fkEmpresa("os_itens", t.empresaId, t.produtoId, produtos),
    fkEmpresa("os_itens", t.empresaId, t.servicoId, servicos),
    fkEmpresa("os_itens", t.empresaId, t.mecanicoId, mecanicos),
    fkEmpresa("os_itens", t.empresaId, t.acertoId, acertosComissao),
    fk("os_itens", [t.removidoPor], [usuarios.id]),
    chaveEmpresaId("os_itens", t),
    // alvo da FK da reserva: o produto reservado é o do item (seção 6.4)
    unique("os_itens_empresa_id_id_produto_id_key").on(t.empresaId, t.id, t.produtoId),
    index("os_itens_empresa_os_ordem_idx").on(t.empresaId, t.ordemServicoId, t.ordem),
    // "Mão de obra", "Meus ganhos" e a visão do mecânico (R9)
    index("os_itens_empresa_mecanico_congelada_idx").on(
      t.empresaId,
      t.mecanicoId,
      t.comissaoCongeladaEm,
    ),
    index("os_itens_empresa_id_acerto_id_idx").on(t.empresaId, t.acertoId),
    index("os_itens_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkIn("os_itens", t.tipo, TIPOS_ITEM),
    checkColuna("os_itens", t.quantidade, sql`${t.quantidade} > 0`),
    checkColuna("os_itens", t.precoUnitario, sql`${t.precoUnitario} >= 0`),
    checkColuna("os_itens", t.descontoItem, sql`${t.descontoItem} >= 0`),
    checkColuna("os_itens", t.descontoRateado, sql`${t.descontoRateado} >= 0`),
    checkColuna("os_itens", t.valorTotal, sql`${t.valorTotal} >= 0`),
    // regra 4.10: round() do Postgres é half-up para valores >= 0
    checkColuna("os_itens", t.valorBruto, sql`${t.valorBruto} = round(${t.quantidade} * ${t.precoUnitario}, 2)`),
    check(
      "os_itens_valor_total_calculo_check",
      sql`${t.valorTotal} = ${t.valorBruto} - ${t.descontoItem} - ${t.descontoRateado}`,
    ),
    checkRegex("os_itens", t.ncm, REGEX_NCM),
    checkColuna("os_itens", t.custoUnitario, sql`${t.custoUnitario} >= 0`),
    checkColuna("os_itens", t.comissaoValor, sql`${t.comissaoValor} >= 0`),
    check(
      "os_itens_tipo_referencia_check",
      sql`(${t.tipo} = 'produto' and ${t.produtoId} is not null and ${t.servicoId} is null and ${t.mecanicoId} is null and ${t.comissaoValor} is null) or (${t.tipo} = 'servico' and ${t.produtoId} is null and ${t.comissaoValor} is not null)`,
    ),
    check(
      "os_itens_acerto_check",
      sql`${t.acertoId} is null or ${t.comissaoCongeladaEm} is not null`,
    ),
  ],
);

// 7.8 ------------------------------------------------------------------------
export const osPagamentos = pgTable(
  "os_pagamentos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    ordemServicoId: uuid("ordem_servico_id").notNull(),
    forma: text("forma", { enum: FORMAS_PAGAMENTO }).notNull(),
    /** Valor que abate a OS (sem o troco). */
    valor: dinheiro("valor").notNull(),
    parcelas: smallint("parcelas").notNull().default(1),
    troco: dinheiro("troco").notNull().default("0"),
    /** Pode haver sinal antes da entrega e pagamento depois dela. */
    recebidoEm: timestamptz("recebido_em").notNull().defaultNow(),
    usuarioId: uuid("usuario_id").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("os_pagamentos", [t.empresaId], [empresas.id]),
    fkEmpresa("os_pagamentos", t.empresaId, t.ordemServicoId, ordensServico),
    fk("os_pagamentos", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("os_pagamentos", t),
    index("os_pagamentos_empresa_id_ordem_servico_id_idx").on(t.empresaId, t.ordemServicoId),
    checkIn("os_pagamentos", t.forma, FORMAS_PAGAMENTO),
    checkColuna("os_pagamentos", t.valor, sql`${t.valor} > 0`),
    checkColuna("os_pagamentos", t.parcelas, sql`${t.parcelas} between 1 and 48`),
    checkColuna("os_pagamentos", t.troco, sql`${t.troco} >= 0`),
    check(
      "os_pagamentos_troco_dinheiro_check",
      sql`${t.forma} = 'dinheiro' or ${t.troco} = 0`,
    ),
  ],
);

// 7.9 [A] --------------------------------------------------------------------
export const osHistoricoStatus = pgTable(
  "os_historico_status",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    ordemServicoId: uuid("ordem_servico_id").notNull(),
    /** Nulo na abertura. */
    statusAnterior: text("status_anterior", { enum: STATUS_OS }),
    statusNovo: text("status_novo", { enum: STATUS_OS }).notNull(),
    /** Obrigatório no cancelamento (action). */
    motivo: text("motivo"),
    usuarioId: uuid("usuario_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("os_historico_status", [t.empresaId], [empresas.id]),
    fkEmpresa("os_historico_status", t.empresaId, t.ordemServicoId, ordensServico),
    fk("os_historico_status", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("os_historico_status", t),
    index("os_historico_status_empresa_os_criado_idx").on(
      t.empresaId,
      t.ordemServicoId,
      t.createdAt,
    ),
    checkIn("os_historico_status", t.statusAnterior, STATUS_OS),
    checkIn("os_historico_status", t.statusNovo, STATUS_OS),
  ],
);

// 7.12 -----------------------------------------------------------------------
export const devolucoes = pgTable(
  "devolucoes",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** `sequencias.devolucao`. */
    numero: bigint("numero", { mode: "number" }).notNull(),
    tipo: text("tipo", { enum: TIPOS_DEVOLUCAO }).notNull(),
    /** Só no fornecedor. */
    status: text("status", { enum: STATUS_DEVOLUCAO_FORNECEDOR }),
    /** Origem na devolução de cliente. */
    vendaId: uuid("venda_id"),
    /** Origem: peça de OS fechada. */
    ordemServicoId: uuid("ordem_servico_id"),
    /** Origem opcional na devolução ao fornecedor. */
    entradaId: uuid("entrada_id"),
    clienteId: uuid("cliente_id"),
    fornecedorId: uuid("fornecedor_id"),
    /** Peça com defeito: entra no depósito "Garantia" (cliente) ou é remessa em garantia (fornecedor). */
    garantia: boolean("garantia").notNull().default(false),
    motivo: text("motivo").notNull(),
    /** Valor dos itens devolvidos. */
    valorTotal: dinheiro("valor_total").notNull(),
    /** O que a loja devolveu ao cliente (R1). Só no cliente. */
    valorDevolvido: dinheiro("valor_devolvido"),
    formaDevolucao: text("forma_devolucao", { enum: FORMAS_DEVOLUCAO }),
    /** NF-e de devolução. */
    documentoFiscalId: uuid("documento_fiscal_id"),
    statusFiscal: text("status_fiscal", { enum: STATUS_FISCAL }).notNull().default("nao_emitido"),
    usuarioId: uuid("usuario_id").notNull(),
    observacoes: text("observacoes"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("devolucoes", [t.empresaId], [empresas.id]),
    fkEmpresa("devolucoes", t.empresaId, t.vendaId, vendas),
    fkEmpresa("devolucoes", t.empresaId, t.ordemServicoId, ordensServico),
    fkEmpresa("devolucoes", t.empresaId, t.entradaId, entradasEstoque),
    fkEmpresa("devolucoes", t.empresaId, t.clienteId, clientes),
    fkEmpresa("devolucoes", t.empresaId, t.fornecedorId, fornecedores),
    fkEmpresa("devolucoes", t.empresaId, t.documentoFiscalId, documentosFiscais),
    fk("devolucoes", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("devolucoes", t),
    unique("devolucoes_empresa_id_numero_key").on(t.empresaId, t.numero),
    index("devolucoes_empresa_id_venda_id_idx").on(t.empresaId, t.vendaId),
    index("devolucoes_empresa_id_ordem_servico_id_idx").on(t.empresaId, t.ordemServicoId),
    index("devolucoes_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("devolucoes_empresa_tipo_criado_idx").on(
      t.empresaId,
      t.tipo,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    checkIn("devolucoes", t.tipo, TIPOS_DEVOLUCAO),
    checkIn("devolucoes", t.status, STATUS_DEVOLUCAO_FORNECEDOR),
    checkColuna("devolucoes", t.valorTotal, sql`${t.valorTotal} >= 0`),
    checkColuna("devolucoes", t.valorDevolvido, sql`${t.valorDevolvido} >= 0`),
    checkIn("devolucoes", t.formaDevolucao, FORMAS_DEVOLUCAO),
    checkIn("devolucoes", t.statusFiscal, STATUS_FISCAL),
    check(
      "devolucoes_tipo_origem_check",
      sql`(${t.tipo} = 'cliente' and ${t.clienteId} is not null and num_nonnulls(${t.vendaId}, ${t.ordemServicoId}) = 1 and ${t.fornecedorId} is null and ${t.status} is null and ${t.valorDevolvido} is not null and ${t.formaDevolucao} is not null) or (${t.tipo} = 'fornecedor' and ${t.fornecedorId} is not null and ${t.status} is not null and ${t.vendaId} is null and ${t.ordemServicoId} is null and ${t.valorDevolvido} is null and ${t.formaDevolucao} is null)`,
    ),
  ],
);

// 7.13 -----------------------------------------------------------------------
export const devolucaoItens = pgTable(
  "devolucao_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    devolucaoId: uuid("devolucao_id").notNull(),
    /** Nulo só na devolução de mão de obra (P4). */
    produtoId: uuid("produto_id"),
    /** Para onde a peça volta (cliente) ou de onde sai (fornecedor): "Loja" ou "Garantia". */
    depositoId: uuid("deposito_id"),
    vendaItemId: uuid("venda_item_id"),
    osItemId: uuid("os_item_id"),
    entradaItemId: uuid("entrada_item_id"),
    /** Até o vendido menos o já devolvido (somado sob trava do item de origem). */
    quantidade: quantidade("quantidade").notNull(),
    valorUnitario: dinheiro("valor_unitario").notNull(),
    valorTotal: dinheiro("valor_total").notNull(),
    /** Cliente: custo da venda original. Fornecedor: custo médio do momento. Nulo na mão de obra. */
    custoUnitario: custo("custo_unitario"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("devolucao_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("devolucao_itens", t.empresaId, t.devolucaoId, devolucoes),
    fkEmpresa("devolucao_itens", t.empresaId, t.produtoId, produtos),
    fkEmpresa("devolucao_itens", t.empresaId, t.depositoId, depositos),
    fkEmpresa("devolucao_itens", t.empresaId, t.vendaItemId, vendaItens),
    fkEmpresa("devolucao_itens", t.empresaId, t.osItemId, osItens),
    fkEmpresa("devolucao_itens", t.empresaId, t.entradaItemId, entradaItens),
    chaveEmpresaId("devolucao_itens", t),
    index("devolucao_itens_empresa_id_devolucao_id_idx").on(t.empresaId, t.devolucaoId),
    index("devolucao_itens_empresa_id_venda_item_id_idx").on(t.empresaId, t.vendaItemId),
    index("devolucao_itens_empresa_id_os_item_id_idx").on(t.empresaId, t.osItemId),
    checkColuna("devolucao_itens", t.quantidade, sql`${t.quantidade} > 0`),
    checkColuna("devolucao_itens", t.valorUnitario, sql`${t.valorUnitario} >= 0`),
    checkColuna("devolucao_itens", t.valorTotal, sql`${t.valorTotal} >= 0`),
    checkColuna("devolucao_itens", t.custoUnitario, sql`${t.custoUnitario} >= 0`),
    check(
      "devolucao_itens_origem_check",
      sql`num_nonnulls(${t.vendaItemId}, ${t.osItemId}, ${t.entradaItemId}) <= 1`,
    ),
    check(
      "devolucao_itens_deposito_check",
      sql`(${t.produtoId} is null) = (${t.depositoId} is null)`,
    ),
    // sem produto, só item de serviço de OS (P4)
    check(
      "devolucao_itens_mao_de_obra_check",
      sql`${t.produtoId} is not null or ${t.osItemId} is not null`,
    ),
  ],
);

// 7.11 [A] -------------------------------------------------------------------
export const comissaoAjustes = pgTable(
  "comissao_ajustes",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    vendedorId: uuid("vendedor_id").notNull(),
    vendaId: uuid("venda_id"),
    ordemServicoId: uuid("ordem_servico_id"),
    /** Nulo no cancelamento de venda. */
    devolucaoId: uuid("devolucao_id"),
    /** Negativo = desconto no próximo acerto do vendedor. */
    valor: dinheiro("valor").notNull(),
    motivo: text("motivo").notNull(),
    /** Acerto que absorveu o ajuste. Única coluna que pode ser preenchida depois, uma vez. */
    acertoComissaoId: uuid("acerto_comissao_id"),
    usuarioId: uuid("usuario_id").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("comissao_ajustes", [t.empresaId], [empresas.id]),
    fkEmpresa("comissao_ajustes", t.empresaId, t.vendedorId, vendedores),
    fkEmpresa("comissao_ajustes", t.empresaId, t.vendaId, vendas),
    fkEmpresa("comissao_ajustes", t.empresaId, t.ordemServicoId, ordensServico),
    fkEmpresa("comissao_ajustes", t.empresaId, t.devolucaoId, devolucoes),
    fkEmpresa("comissao_ajustes", t.empresaId, t.acertoComissaoId, acertosComissao),
    fk("comissao_ajustes", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("comissao_ajustes", t),
    index("comissao_ajustes_a_absorver_idx")
      .on(t.empresaId, t.vendedorId)
      .where(sql`${t.acertoComissaoId} is null`),
    checkColuna("comissao_ajustes", t.valor, sql`${t.valor} <> 0`),
    check(
      "comissao_ajustes_origem_check",
      sql`num_nonnulls(${t.vendaId}, ${t.ordemServicoId}) = 1`,
    ),
  ],
);
