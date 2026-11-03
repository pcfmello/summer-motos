/**
 * Estoque, por empresa (docs/modelo-dados.md, seção 6; regras 4.2 a 4.6).
 *
 * - O saldo só muda por `server/domain/estoque` dentro de `withTransaction`,
 *   com `SELECT ... FOR UPDATE` em ordem de `produto_id` (seção 13).
 * - `movimentacoes_estoque` é append-only: o gatilho `bloquear_alteracao()`
 *   (migração custom deste passo) recusa UPDATE e DELETE (D008).
 * - Índices "mais recentes" são `DESC NULLS FIRST`, o mesmo sentido do
 *   `ORDER BY col DESC, id DESC` das queries keyset (D017, 1.11).
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
  REGEX_CHAVE_NFE,
  REGEX_NCM,
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
  listaSql,
  quantidade,
  restricoesDepositoVendavel,
  timestamptz,
  type Restricoes,
} from "./_comum";
import { pedidoCanalItens } from "./canais";
import { categorias, produtos } from "./catalogo";
import { osItens } from "./documentos";
import { fornecedores } from "./pessoas";
import { empresas, usuarios } from "./plataforma";

export const TIPOS_MOVIMENTACAO = [
  "saldo_inicial",
  "entrada_compra",
  "entrada_manual",
  "saida_venda",
  "saida_os",
  "ajuste_manual",
  "ajuste_inventario",
  "devolucao_cliente",
  "devolucao_fornecedor",
  "estorno",
] as const;
const TIPOS_ENTRADA = ["saldo_inicial", "entrada_compra", "entrada_manual", "devolucao_cliente"];
const TIPOS_SAIDA = ["saida_venda", "saida_os", "devolucao_fornecedor"];
const TIPOS_COM_SINAL_LIVRE = ["ajuste_manual", "ajuste_inventario", "estorno"];

export const ORIGENS_MOVIMENTACAO = [
  "venda",
  "ordem_servico",
  "pedido_canal",
  "entrada",
  "inventario",
  "devolucao",
] as const;
export const STATUS_RESERVA = ["ativa", "consumida", "liberada"] as const;
export const ORIGENS_ENTRADA = ["manual", "xml"] as const;
export const STATUS_ENTRADA = ["rascunho", "confirmada", "cancelada"] as const;
export const STATUS_INVENTARIO = ["aberto", "aplicado", "cancelado"] as const;
export const FILTROS_INVENTARIO = ["todos", "categoria", "localizacao"] as const;

// 6.1 ------------------------------------------------------------------------
export const depositos = pgTable(
  "depositos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** "Loja", "Garantia". */
    nome: text("nome").notNull(),
    /** Criado com a empresa e escondido na interface. */
    padrao: boolean("padrao").notNull().default(false),
    /**
     * O disponível do balcão, da OS e dos canais só soma depósitos vendáveis (D28 do
     * modelo). Padrão `false`: o "Loja" é criado com `true` explícito, e um depósito
     * novo só vira vendável por decisão.
     */
    vendavel: boolean("vendavel").notNull().default(false),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("depositos", [t.empresaId], [empresas.id]),
    chaveEmpresaId("depositos", t),
    unique("depositos_empresa_id_nome_key").on(t.empresaId, t.nome),
    uniqueIndex("depositos_empresa_id_padrao_key").on(t.empresaId).where(sql`${t.padrao}`),
    // alvo das FKs que exigem depósito vendável (vendas, OS, reservas)
    unique("depositos_empresa_id_id_vendavel_key").on(t.empresaId, t.id, t.vendavel),
    // o depósito padrão é sempre vendável
    check("depositos_padrao_check", sql`not ${t.padrao} or ${t.vendavel}`),
  ],
);

// 6.2 ------------------------------------------------------------------------
export const estoqueSaldos = pgTable(
  "estoque_saldos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    produtoId: uuid("produto_id").notNull(),
    depositoId: uuid("deposito_id").notNull(),
    /** Pode ficar negativa se `permite_estoque_negativo`. Disponível = quantidade − reservada. */
    quantidade: quantidade("quantidade").notNull().default("0"),
    quantidadeReservada: quantidade("quantidade_reservada").notNull().default("0"),
    /** Nulo = custo desconhecido (D25 do modelo). */
    custoMedio: custo("custo_medio"),
    /** Nulo = sem entrada com custo ainda. */
    ultimoCusto: custo("ultimo_custo"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("estoque_saldos", [t.empresaId], [empresas.id]),
    fkEmpresa("estoque_saldos", t.empresaId, t.produtoId, produtos),
    fkEmpresa("estoque_saldos", t.empresaId, t.depositoId, depositos),
    chaveEmpresaId("estoque_saldos", t),
    // o produto_id já é único no sistema e a FK composta garante a empresa
    unique("estoque_saldos_produto_id_deposito_id_key").on(t.produtoId, t.depositoId),
    index("estoque_saldos_empresa_id_deposito_id_idx").on(t.empresaId, t.depositoId),
    checkColuna(
      "estoque_saldos",
      t.quantidadeReservada,
      sql`${t.quantidadeReservada} >= 0`,
    ),
    checkColuna("estoque_saldos", t.custoMedio, sql`${t.custoMedio} >= 0`),
    checkColuna("estoque_saldos", t.ultimoCusto, sql`${t.ultimoCusto} >= 0`),
  ],
);

// 6.3 [A] --------------------------------------------------------------------
export const movimentacoesEstoque = pgTable(
  "movimentacoes_estoque",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    produtoId: uuid("produto_id").notNull(),
    depositoId: uuid("deposito_id").notNull(),
    tipo: text("tipo", { enum: TIPOS_MOVIMENTACAO }).notNull(),
    /** Com sinal. */
    quantidade: quantidade("quantidade").notNull(),
    /** Entrada: custo da entrada. Saída: custo médio do momento (CMV). Nulo = desconhecido. */
    custoUnitario: custo("custo_unitario"),
    /** `estoque_saldos.quantidade` depois do movimento. */
    saldoApos: quantidade("saldo_apos").notNull(),
    /** Permite reconstituir o custo médio pelo kardex. */
    custoMedioApos: custo("custo_medio_apos"),
    origemTipo: text("origem_tipo", { enum: ORIGENS_MOVIMENTACAO }),
    /** Id do documento (polimórfico, sem FK; D9 do modelo). */
    origemId: uuid("origem_id"),
    /** Id do item do documento (ex.: `venda_itens.id`). */
    origemItemId: uuid("origem_item_id"),
    estornoDeId: uuid("estorno_de_id"),
    /** Obrigatório em ajuste manual e estorno. */
    motivo: text("motivo"),
    /** Nulo = sistema (worker, webhook). */
    usuarioId: uuid("usuario_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("movimentacoes_estoque", [t.empresaId], [empresas.id]),
    fkEmpresa("movimentacoes_estoque", t.empresaId, t.produtoId, produtos),
    fkEmpresa("movimentacoes_estoque", t.empresaId, t.depositoId, depositos),
    fkEmpresa("movimentacoes_estoque", t.empresaId, t.estornoDeId, {
      empresaId: t.empresaId,
      id: t.id,
    }),
    fk("movimentacoes_estoque", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("movimentacoes_estoque", t),
    // kardex (1.11): todos terminam em id, porque os movimentos de uma transação têm o mesmo created_at
    index("movimentacoes_estoque_empresa_produto_criado_idx").on(
      t.empresaId,
      t.produtoId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("movimentacoes_estoque_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("movimentacoes_estoque_empresa_tipo_criado_idx").on(
      t.empresaId,
      t.tipo,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("movimentacoes_estoque_empresa_usuario_criado_idx").on(
      t.empresaId,
      t.usuarioId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    // estorno e devolução encontram os movimentos do documento
    index("movimentacoes_estoque_empresa_origem_idx").on(t.empresaId, t.origemTipo, t.origemId),
    // um movimento só é estornado uma vez
    uniqueIndex("movimentacoes_estoque_estorno_de_id_key")
      .on(t.estornoDeId)
      .where(sql`${t.estornoDeId} is not null`),
    checkIn("movimentacoes_estoque", t.tipo, TIPOS_MOVIMENTACAO),
    checkColuna("movimentacoes_estoque", t.quantidade, sql`${t.quantidade} <> 0`),
    checkColuna("movimentacoes_estoque", t.custoUnitario, sql`${t.custoUnitario} >= 0`),
    checkIn("movimentacoes_estoque", t.origemTipo, ORIGENS_MOVIMENTACAO),
    check(
      "movimentacoes_estoque_sinal_check",
      sql`(${t.tipo} in (${listaSql(TIPOS_ENTRADA)}) and ${t.quantidade} > 0) or (${t.tipo} in (${listaSql(TIPOS_SAIDA)}) and ${t.quantidade} < 0) or ${t.tipo} in (${listaSql(TIPOS_COM_SINAL_LIVRE)})`,
    ),
    check(
      "movimentacoes_estoque_estorno_check",
      sql`${t.tipo} <> 'estorno' or ${t.estornoDeId} is not null`,
    ),
    check(
      "movimentacoes_estoque_motivo_check",
      sql`${t.tipo} not in ('ajuste_manual', 'estorno') or ${t.motivo} is not null`,
    ),
    check(
      "movimentacoes_estoque_origem_check",
      sql`(${t.origemTipo} is null) = (${t.origemId} is null)`,
    ),
    // entrada sempre tem custo (D25 do modelo)
    check(
      "movimentacoes_estoque_custo_entrada_check",
      sql`${t.tipo} not in ('entrada_compra', 'entrada_manual') or ${t.custoUnitario} is not null`,
    ),
  ],
);

// 6.4 ------------------------------------------------------------------------
// A reserva aponta para o item de origem (D7 do modelo). As FKs `os_item_id` e
// `pedido_canal_item_id` chegam nos passos 7 e 8 da seção 15, quando as tabelas
// de destino existem.
export const estoqueReservas = pgTable(
  "estoque_reservas",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Igual ao produto do item de origem. */
    produtoId: uuid("produto_id").notNull(),
    depositoId: uuid("deposito_id").notNull(),
    ...colunaDepositoVendavel(),
    quantidade: quantidade("quantidade").notNull(),
    osItemId: uuid("os_item_id"),
    pedidoCanalItemId: uuid("pedido_canal_item_id"),
    status: text("status", { enum: STATUS_RESERVA }).notNull().default("ativa"),
    consumidaEm: timestamptz("consumida_em"),
    liberadaEm: timestamptz("liberada_em"),
    /** Saída que consumiu a reserva. */
    movimentacaoId: uuid("movimentacao_id"),
    usuarioId: uuid("usuario_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("estoque_reservas", [t.empresaId], [empresas.id]),
    fkEmpresa("estoque_reservas", t.empresaId, t.produtoId, produtos),
    ...restricoesDepositoVendavel("estoque_reservas", t, depositos),
    fkEmpresa("estoque_reservas", t.empresaId, t.movimentacaoId, movimentacoesEstoque),
    // o produto da reserva é o do item de origem
    fk("estoque_reservas", [t.empresaId, t.osItemId, t.produtoId], [osItens.empresaId, osItens.id, osItens.produtoId], { nome: "estoque_reservas_os_item_id_fk" }),
    fk("estoque_reservas", [t.empresaId, t.pedidoCanalItemId, t.produtoId], [pedidoCanalItens.empresaId, pedidoCanalItens.id, pedidoCanalItens.produtoId], { nome: "estoque_reservas_pedido_canal_item_id_fk" }),
    fk("estoque_reservas", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("estoque_reservas", t),
    index("estoque_reservas_produto_id_status_idx").on(t.produtoId, t.status),
    // no máximo uma reserva ativa por item; também dá idempotência ao pedido pago
    // Uma reserva vigente (ativa ou consumida) por item: o item consumido nunca
    // ganha outra reserva. Também dá idempotência ao pedido pago reprocessado.
    uniqueIndex("estoque_reservas_os_item_id_vigente_key")
      .on(t.empresaId, t.osItemId)
      .where(sql`${t.status} <> 'liberada'`),
    uniqueIndex("estoque_reservas_pedido_canal_item_id_vigente_key")
      .on(t.empresaId, t.pedidoCanalItemId)
      .where(sql`${t.status} <> 'liberada'`),
    checkColuna("estoque_reservas", t.quantidade, sql`${t.quantidade} > 0`),
    checkIn("estoque_reservas", t.status, STATUS_RESERVA),
    check(
      "estoque_reservas_origem_check",
      sql`num_nonnulls(${t.osItemId}, ${t.pedidoCanalItemId}) = 1`,
    ),
    check(
      "estoque_reservas_consumida_check",
      sql`${t.status} <> 'consumida' or (${t.consumidaEm} is not null and ${t.movimentacaoId} is not null)`,
    ),
    check(
      "estoque_reservas_ativa_check",
      sql`${t.status} <> 'ativa' or (${t.consumidaEm} is null and ${t.liberadaEm} is null and ${t.movimentacaoId} is null)`,
    ),
    check(
      "estoque_reservas_liberada_check",
      sql`${t.status} <> 'liberada' or ${t.liberadaEm} is not null`,
    ),
  ],
);

// 6.5 ------------------------------------------------------------------------
export const entradasEstoque = pgTable(
  "entradas_estoque",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Opcional na entrada manual. */
    fornecedorId: uuid("fornecedor_id"),
    depositoId: uuid("deposito_id").notNull(),
    origem: text("origem", { enum: ORIGENS_ENTRADA }).notNull(),
    /** `cancelada` = rascunho descartado; depois de confirmada, a correção é por estorno ou devolução. */
    status: text("status", { enum: STATUS_ENTRADA }).notNull().default("rascunho"),
    numeroNota: bigint("numero_nota", { mode: "number" }),
    serieNota: integer("serie_nota"),
    chaveAcesso: text("chave_acesso"),
    dataEmissao: timestamptz("data_emissao"),
    dataEntrada: timestamptz("data_entrada").notNull().defaultNow(),
    valorProdutos: dinheiro("valor_produtos").notNull().default("0"),
    /** Na entrada manual, é rateado pelo valor dos itens. */
    valorFrete: dinheiro("valor_frete").notNull().default("0"),
    valorSeguro: dinheiro("valor_seguro").notNull().default("0"),
    valorOutrasDespesas: dinheiro("valor_outras_despesas").notNull().default("0"),
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    valorIpi: dinheiro("valor_ipi").notNull().default("0"),
    valorSt: dinheiro("valor_st").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull().default("0"),
    /** Chave do XML no storage. Nunca é apagado (4.16). */
    xmlChave: text("xml_chave"),
    observacoes: text("observacoes"),
    /** Quem criou. */
    usuarioId: uuid("usuario_id").notNull(),
    confirmadaEm: timestamptz("confirmada_em"),
    confirmadaPor: uuid("confirmada_por"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("entradas_estoque", [t.empresaId], [empresas.id]),
    fkEmpresa("entradas_estoque", t.empresaId, t.fornecedorId, fornecedores),
    fkEmpresa("entradas_estoque", t.empresaId, t.depositoId, depositos),
    fk("entradas_estoque", [t.usuarioId], [usuarios.id]),
    fk("entradas_estoque", [t.confirmadaPor], [usuarios.id]),
    chaveEmpresaId("entradas_estoque", t),
    // bloqueia o XML importado duas vezes; um rascunho descartado não impede reimportar
    uniqueIndex("entradas_estoque_empresa_id_chave_acesso_key")
      .on(t.empresaId, t.chaveAcesso)
      .where(sql`${t.chaveAcesso} is not null and ${t.status} <> 'cancelada'`),
    index("entradas_estoque_empresa_data_entrada_idx").on(
      t.empresaId,
      t.dataEntrada.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("entradas_estoque_empresa_id_fornecedor_id_idx").on(t.empresaId, t.fornecedorId),
    checkIn("entradas_estoque", t.origem, ORIGENS_ENTRADA),
    checkIn("entradas_estoque", t.status, STATUS_ENTRADA),
    checkColuna("entradas_estoque", t.numeroNota, sql`${t.numeroNota} > 0`),
    checkColuna("entradas_estoque", t.serieNota, sql`${t.serieNota} >= 0`),
    checkRegex("entradas_estoque", t.chaveAcesso, REGEX_CHAVE_NFE),
    checkColuna("entradas_estoque", t.valorFrete, sql`${t.valorFrete} >= 0`),
    checkColuna("entradas_estoque", t.valorSeguro, sql`${t.valorSeguro} >= 0`),
    checkColuna(
      "entradas_estoque",
      t.valorOutrasDespesas,
      sql`${t.valorOutrasDespesas} >= 0`,
    ),
    checkColuna("entradas_estoque", t.valorDesconto, sql`${t.valorDesconto} >= 0`),
    checkColuna("entradas_estoque", t.valorIpi, sql`${t.valorIpi} >= 0`),
    checkColuna("entradas_estoque", t.valorSt, sql`${t.valorSt} >= 0`),
    check(
      "entradas_estoque_origem_xml_check",
      sql`${t.origem} <> 'xml' or (${t.chaveAcesso} is not null and ${t.xmlChave} is not null)`,
    ),
    check(
      "entradas_estoque_confirmada_check",
      sql`${t.status} <> 'confirmada' or ${t.confirmadaEm} is not null`,
    ),
    // depois de confirmada, a correção é por estorno ou devolução, nunca cancelando
    check(
      "entradas_estoque_cancelada_check",
      sql`${t.status} <> 'cancelada' or ${t.confirmadaEm} is null`,
    ),
  ],
);

// 6.6 ------------------------------------------------------------------------
export const entradaItens = pgTable(
  "entrada_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    entradaId: uuid("entrada_id").notNull(),
    /** `nItem` do XML ou ordem na tela. */
    numeroItem: smallint("numero_item").notNull(),
    /** Nulo durante a conferência; obrigatório para confirmar (na action). */
    produtoId: uuid("produto_id"),
    /** `cProd`. */
    codigoFornecedor: text("codigo_fornecedor"),
    /** `xProd`. */
    descricaoFornecedor: text("descricao_fornecedor"),
    /** `cEAN`, usado na sugestão do de-para. */
    eanFornecedor: text("ean_fornecedor"),
    ncm: text("ncm"),
    cfop: text("cfop"),
    unidadeCompra: text("unidade_compra").notNull(),
    fator: quantidade("fator").notNull().default("1"),
    quantidadeCompra: quantidade("quantidade_compra").notNull(),
    /** `quantidade_compra × fator`. */
    quantidadeEstoque: quantidade("quantidade_estoque").notNull(),
    /** `vProd`. */
    valorProduto: dinheiro("valor_produto").notNull(),
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    valorFrete: dinheiro("valor_frete").notNull().default("0"),
    valorSeguro: dinheiro("valor_seguro").notNull().default("0"),
    valorOutrasDespesas: dinheiro("valor_outras_despesas").notNull().default("0"),
    valorIpi: dinheiro("valor_ipi").notNull().default("0"),
    valorSt: dinheiro("valor_st").notNull().default("0"),
    /** Por unidade de estoque (regra 4.5). */
    custoUnitario: custo("custo_unitario").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("entrada_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("entrada_itens", t.empresaId, t.entradaId, entradasEstoque),
    fkEmpresa("entrada_itens", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("entrada_itens", t),
    unique("entrada_itens_entrada_id_numero_item_key").on(t.entradaId, t.numeroItem),
    index("entrada_itens_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna("entrada_itens", t.numeroItem, sql`${t.numeroItem} > 0`),
    checkRegex("entrada_itens", t.ncm, REGEX_NCM),
    checkRegex("entrada_itens", t.cfop, "^[0-9]{4}$"),
    checkColuna("entrada_itens", t.fator, sql`${t.fator} > 0`),
    checkColuna("entrada_itens", t.quantidadeCompra, sql`${t.quantidadeCompra} > 0`),
    checkColuna("entrada_itens", t.quantidadeEstoque, sql`${t.quantidadeEstoque} > 0`),
    check(
      "entrada_itens_quantidade_estoque_calculo_check",
      sql`${t.quantidadeEstoque} = round(${t.quantidadeCompra} * ${t.fator}, 4)`,
    ),
    checkColuna("entrada_itens", t.valorProduto, sql`${t.valorProduto} >= 0`),
    checkColuna("entrada_itens", t.valorDesconto, sql`${t.valorDesconto} >= 0`),
    checkColuna("entrada_itens", t.valorFrete, sql`${t.valorFrete} >= 0`),
    checkColuna("entrada_itens", t.valorSeguro, sql`${t.valorSeguro} >= 0`),
    checkColuna(
      "entrada_itens",
      t.valorOutrasDespesas,
      sql`${t.valorOutrasDespesas} >= 0`,
    ),
    checkColuna("entrada_itens", t.valorIpi, sql`${t.valorIpi} >= 0`),
    checkColuna("entrada_itens", t.valorSt, sql`${t.valorSt} >= 0`),
    checkColuna("entrada_itens", t.custoUnitario, sql`${t.custoUnitario} >= 0`),
  ],
);

// 6.7 ------------------------------------------------------------------------
export const inventarios = pgTable(
  "inventarios",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    depositoId: uuid("deposito_id").notNull(),
    status: text("status", { enum: STATUS_INVENTARIO }).notNull().default("aberto"),
    filtro: text("filtro", { enum: FILTROS_INVENTARIO }).notNull().default("todos"),
    filtroCategoriaId: uuid("filtro_categoria_id"),
    filtroCorredor: text("filtro_corredor"),
    filtroPrateleira: text("filtro_prateleira"),
    /** Inventário da virada: ao aplicar, gera `saldo_inicial` em vez de `ajuste_inventario`. */
    saldoInicial: boolean("saldo_inicial").notNull().default(false),
    /** Base para avisar sobre movimento depois da abertura. */
    abertoEm: timestamptz("aberto_em").notNull().defaultNow(),
    abertoPor: uuid("aberto_por").notNull(),
    aplicadoEm: timestamptz("aplicado_em"),
    aplicadoPor: uuid("aplicado_por"),
    canceladoEm: timestamptz("cancelado_em"),
    observacoes: text("observacoes"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("inventarios", [t.empresaId], [empresas.id]),
    fkEmpresa("inventarios", t.empresaId, t.depositoId, depositos),
    fkEmpresa("inventarios", t.empresaId, t.filtroCategoriaId, categorias),
    fk("inventarios", [t.abertoPor], [usuarios.id]),
    fk("inventarios", [t.aplicadoPor], [usuarios.id]),
    chaveEmpresaId("inventarios", t),
    // um balanço aberto por depósito (R6)
    uniqueIndex("inventarios_empresa_id_deposito_id_aberto_key")
      .on(t.empresaId, t.depositoId)
      .where(sql`${t.status} = 'aberto'`),
    index("inventarios_empresa_aberto_em_idx").on(t.empresaId, t.abertoEm.desc().nullsFirst()),
    checkIn("inventarios", t.status, STATUS_INVENTARIO),
    checkIn("inventarios", t.filtro, FILTROS_INVENTARIO),
    check(
      "inventarios_filtro_categoria_check",
      sql`${t.filtro} <> 'categoria' or ${t.filtroCategoriaId} is not null`,
    ),
    check(
      "inventarios_filtro_localizacao_check",
      sql`${t.filtro} <> 'localizacao' or ${t.filtroCorredor} is not null`,
    ),
  ],
);

// 6.8 ------------------------------------------------------------------------
export const inventarioItens = pgTable(
  "inventario_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    inventarioId: uuid("inventario_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    /** Saldo na abertura. */
    quantidadeSistema: quantidade("quantidade_sistema").notNull(),
    /** Nulo = não contado. Cada leitura soma atomicamente (`coalesce(q, 0) + fator`). */
    quantidadeContada: quantidade("quantidade_contada"),
    /** Última contagem. */
    contadoEm: timestamptz("contado_em"),
    contadoPor: uuid("contado_por"),
    /** Calculada sobre o saldo no momento da aplicação. */
    diferencaAplicada: quantidade("diferenca_aplicada"),
    /** Gravado na revisão e na aplicação. */
    movimentadoAposAbertura: boolean("movimentado_apos_abertura"),
    movimentacaoId: uuid("movimentacao_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("inventario_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("inventario_itens", t.empresaId, t.inventarioId, inventarios),
    fkEmpresa("inventario_itens", t.empresaId, t.produtoId, produtos),
    fk("inventario_itens", [t.contadoPor], [usuarios.id]),
    fkEmpresa("inventario_itens", t.empresaId, t.movimentacaoId, movimentacoesEstoque),
    chaveEmpresaId("inventario_itens", t),
    unique("inventario_itens_inventario_id_produto_id_key").on(t.inventarioId, t.produtoId),
    checkColuna(
      "inventario_itens",
      t.quantidadeContada,
      sql`${t.quantidadeContada} >= 0`,
    ),
  ],
);
