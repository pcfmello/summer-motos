/**
 * Canais de venda: Mercado Livre e e-commerce (docs/modelo-dados.md, seção 8;
 * regra 4.14).
 *
 * - Segredos em colunas `*_cifrado` (AES-256-GCM na aplicação, 1.7); chave de
 *   API só como hash SHA-256 (D007).
 * - Idempotência: `eventos_integracao` com unique NULLS NOT DISTINCT e
 *   `pedidos_canal` único por (canal, id externo).
 * - `outbox`: fila lida pelo worker com `FOR UPDATE SKIP LOCKED`, agrupada por produto.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  INDICADORES_IE,
  REGEX_CEP,
  REGEX_CHAVE_NFE,
  REGEX_CNPJ,
  REGEX_CPF,
  REGEX_IBGE,
  REGEX_UF,
  TIPOS_PESSOA,
  bytea,
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
  quantidade,
  timestamptz,
  type Restricoes,
} from "./_comum";
import { produtos, tabelasPreco } from "./catalogo";
import { vendas } from "./documentos";
import { empresas, usuarios } from "./plataforma";

export const TIPOS_CANAL = ["mercado_livre", "ecommerce"] as const;
/** O que dispara a baixa. A lista final sai do plano da integração. */
export const EVENTOS_FATURAMENTO = ["pago", "faturado", "enviado", "entregue"] as const;
/** Mercado Livre = `externo` (as notas vêm do emissor externo). */
export const EMISSORES_FISCAIS_CANAL = ["focus", "externo"] as const;
export const STATUS_PEDIDO_CANAL = ["pendente", "pago", "faturado", "cancelado", "devolvido"] as const;
export const INTEGRACOES = ["mercado_livre", "ecommerce", "focus", "mde"] as const;
export const DIRECOES_EVENTO = ["entrada", "saida"] as const;
export const TIPOS_OUTBOX = ["produto.disponivel_alterado", "produto.preco_alterado"] as const;

const CONFIG_CANAL_PADRAO = sql`'{"sincronizar_estoque": true, "sincronizar_preco": true, "janela_agrupamento_segundos": 10, "max_tentativas": 8}'::jsonb`;

// 8.1 ------------------------------------------------------------------------
export const canaisVenda = pgTable(
  "canais_venda",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    tipo: text("tipo", { enum: TIPOS_CANAL }).notNull(),
    nome: text("nome").notNull(),
    /** Nasce desligado. */
    ativo: boolean("ativo").notNull().default(false),
    /** `user_id` do vendedor no Mercado Livre: roteia a notificação para a empresa certa. */
    contaExternaId: text("conta_externa_id"),
    /** Tokens OAuth (ML). */
    credenciaisCifrado: bytea("credenciais_cifrado"),
    /** Para o worker renovar o token antes de vencer (não é segredo). */
    tokenExpiraEm: timestamptz("token_expira_em"),
    /** Segredo HMAC do webhook de saída (e-commerce). */
    webhookSegredoCifrado: bytea("webhook_segredo_cifrado"),
    tabelaPrecoId: uuid("tabela_preco_id").notNull(),
    estoqueSeguranca: quantidade("estoque_seguranca").notNull().default("0"),
    eventoFaturamento: text("evento_faturamento", { enum: EVENTOS_FATURAMENTO })
      .notNull()
      .default("pago"),
    emissorFiscal: text("emissor_fiscal", { enum: EMISSORES_FISCAIS_CANAL }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(CONFIG_CANAL_PADRAO),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("canais_venda", [t.empresaId], [empresas.id]),
    fkEmpresa("canais_venda", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    chaveEmpresaId("canais_venda", t),
    unique("canais_venda_empresa_id_tipo_nome_key").on(t.empresaId, t.tipo, t.nome),
    // global: a notificação chega antes de se saber a empresa
    uniqueIndex("canais_venda_tipo_conta_externa_id_key")
      .on(t.tipo, t.contaExternaId)
      .where(sql`${t.contaExternaId} is not null`),
    checkIn("canais_venda", t.tipo, TIPOS_CANAL),
    checkColuna("canais_venda", t.estoqueSeguranca, sql`${t.estoqueSeguranca} >= 0`),
    checkIn("canais_venda", t.eventoFaturamento, EVENTOS_FATURAMENTO),
    checkIn("canais_venda", t.emissorFiscal, EMISSORES_FISCAIS_CANAL),
  ],
);

// 8.2 ------------------------------------------------------------------------
export const canalAnuncios = pgTable(
  "canal_anuncios",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    canalId: uuid("canal_id").notNull(),
    /** Nulo = anúncio sem vínculo (lista da Entrega 6). */
    produtoId: uuid("produto_id"),
    /** `MLB123…`. */
    idExterno: text("id_externo").notNull(),
    idVariacao: text("id_variacao"),
    /** SKU lido do canal; deve bater com `produtos.codigo`. */
    sku: text("sku"),
    titulo: text("titulo"),
    /** Status do canal, sem CHECK (o valor é de fora). */
    statusExterno: text("status_externo"),
    /** Pausa a sincronização deste anúncio. */
    sincronizar: boolean("sincronizar").notNull().default(true),
    /** Última enviada: `floor(max(0, disponível − segurança))`. */
    quantidadePublicada: integer("quantidade_publicada"),
    /** Último enviado. */
    precoPublicado: dinheiro("preco_publicado"),
    sincronizadoEm: timestamptz("sincronizado_em"),
    ultimoErro: text("ultimo_erro"),
    ultimoErroEm: timestamptz("ultimo_erro_em"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("canal_anuncios", [t.empresaId], [empresas.id]),
    fkEmpresa("canal_anuncios", t.empresaId, t.canalId, canaisVenda),
    fkEmpresa("canal_anuncios", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("canal_anuncios", t),
    // sem NULLS NOT DISTINCT, dois anúncios sem variação passariam
    unique("canal_anuncios_canal_externo_variacao_key")
      .on(t.canalId, t.idExterno, t.idVariacao)
      .nullsNotDistinct(),
    index("canal_anuncios_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    // painel de erros
    index("canal_anuncios_com_erro_idx")
      .on(t.canalId)
      .where(sql`${t.ultimoErro} is not null`),
    checkColuna(
      "canal_anuncios",
      t.quantidadePublicada,
      sql`${t.quantidadePublicada} >= 0`,
    ),
  ],
);

// 8.3 ------------------------------------------------------------------------
export const pedidosCanal = pgTable(
  "pedidos_canal",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    canalId: uuid("canal_id").notNull(),
    idExterno: text("id_externo").notNull(),
    /** Carrinho do ML (vários pedidos, uma nota). Confirmar no plano da Entrega 6. */
    packIdExterno: text("pack_id_externo"),
    /** `shipment` do ML. */
    envioIdExterno: text("envio_id_externo"),
    statusExterno: text("status_externo"),
    status: text("status", { enum: STATUS_PEDIDO_CANAL }).notNull().default("pendente"),
    /** Ex.: "sem estoque para reservar: X", "SKU sem vínculo". */
    pendencia: text("pendencia"),
    // Destinatário: no ML, só o mínimo; no e-commerce, os dados da NF-e (R8, D24 do
    // modelo). Congelam quando o pedido é faturado. O comprador não entra em `clientes`.
    compradorNome: text("comprador_nome"),
    compradorTipoPessoa: text("comprador_tipo_pessoa", { enum: TIPOS_PESSOA }),
    compradorCpfCnpj: text("comprador_cpf_cnpj"),
    compradorIe: text("comprador_ie"),
    compradorIndicadorIe: smallint("comprador_indicador_ie"),
    compradorEmail: text("comprador_email"),
    compradorTelefone: text("comprador_telefone"),
    compradorCep: text("comprador_cep"),
    compradorLogradouro: text("comprador_logradouro"),
    compradorNumero: text("comprador_numero"),
    compradorComplemento: text("comprador_complemento"),
    compradorBairro: text("comprador_bairro"),
    compradorMunicipio: text("comprador_municipio"),
    compradorCodigoIbgeMunicipio: text("comprador_codigo_ibge_municipio"),
    compradorUf: text("comprador_uf"),
    valorProdutos: dinheiro("valor_produtos").notNull().default("0"),
    valorFrete: dinheiro("valor_frete").notNull().default("0"),
    valorTaxas: dinheiro("valor_taxas").notNull().default("0"),
    valorDesconto: dinheiro("valor_desconto").notNull().default("0"),
    valorTotal: dinheiro("valor_total").notNull().default("0"),
    pagoEm: timestamptz("pago_em"),
    faturadoEm: timestamptz("faturado_em"),
    canceladoEm: timestamptz("cancelado_em"),
    vendaId: uuid("venda_id"),
    // nota do emissor externo (Mercado Livre)
    notaExternaChave: text("nota_externa_chave"),
    notaExternaNumero: bigint("nota_externa_numero", { mode: "number" }),
    notaExternaSerie: integer("nota_externa_serie"),
    /** Chave do XML no storage, nunca apagado. */
    notaExternaXmlChave: text("nota_externa_xml_chave"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("pedidos_canal", [t.empresaId], [empresas.id]),
    fkEmpresa("pedidos_canal", t.empresaId, t.canalId, canaisVenda),
    fkEmpresa("pedidos_canal", t.empresaId, t.vendaId, vendas),
    chaveEmpresaId("pedidos_canal", t),
    unique("pedidos_canal_canal_id_id_externo_key").on(t.canalId, t.idExterno),
    index("pedidos_canal_empresa_status_criado_idx").on(
      t.empresaId,
      t.status,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("pedidos_canal_empresa_criado_idx").on(
      t.empresaId,
      t.createdAt.desc().nullsFirst(),
      t.id.desc().nullsFirst(),
    ),
    index("pedidos_canal_com_pendencia_idx")
      .on(t.empresaId)
      .where(sql`${t.pendencia} is not null`),
    uniqueIndex("pedidos_canal_empresa_id_nota_externa_chave_key")
      .on(t.empresaId, t.notaExternaChave)
      .where(sql`${t.notaExternaChave} is not null`),
    checkIn("pedidos_canal", t.status, STATUS_PEDIDO_CANAL),
    checkIn("pedidos_canal", t.compradorTipoPessoa, TIPOS_PESSOA),
    checkColuna(
      "pedidos_canal",
      t.compradorCpfCnpj,
      sql`${t.compradorCpfCnpj} is null or (${t.compradorTipoPessoa} = 'pf' and ${t.compradorCpfCnpj} ~ '${sql.raw(REGEX_CPF)}') or (${t.compradorTipoPessoa} = 'pj' and ${t.compradorCpfCnpj} ~ '${sql.raw(REGEX_CNPJ)}')`,
    ),
    checkIn("pedidos_canal", t.compradorIndicadorIe, INDICADORES_IE),
    checkRegex("pedidos_canal", t.compradorCep, REGEX_CEP),
    checkRegex("pedidos_canal", t.compradorCodigoIbgeMunicipio, REGEX_IBGE),
    checkRegex("pedidos_canal", t.compradorUf, REGEX_UF),
    checkRegex("pedidos_canal", t.notaExternaChave, REGEX_CHAVE_NFE),
    check(
      "pedidos_canal_faturado_check",
      sql`${t.status} <> 'faturado' or ${t.vendaId} is not null`,
    ),
  ],
);

// 8.4 ------------------------------------------------------------------------
export const pedidoCanalItens = pgTable(
  "pedido_canal_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    pedidoCanalId: uuid("pedido_canal_id").notNull(),
    canalAnuncioId: uuid("canal_anuncio_id"),
    /** Nulo = SKU sem vínculo (vira pendência). */
    produtoId: uuid("produto_id"),
    idExternoItem: text("id_externo_item"),
    sku: text("sku"),
    titulo: text("titulo"),
    quantidade: quantidade("quantidade").notNull(),
    precoUnitario: dinheiro("preco_unitario").notNull(),
    valorTotal: dinheiro("valor_total").notNull(),
    /** Tarifa do canal. */
    taxa: dinheiro("taxa").notNull().default("0"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("pedido_canal_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("pedido_canal_itens", t.empresaId, t.pedidoCanalId, pedidosCanal),
    fkEmpresa("pedido_canal_itens", t.empresaId, t.canalAnuncioId, canalAnuncios),
    fkEmpresa("pedido_canal_itens", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("pedido_canal_itens", t),
    // alvo da FK da reserva: o produto reservado é o do item (seção 6.4)
    unique("pedido_canal_itens_empresa_id_id_produto_id_key").on(t.empresaId, t.id, t.produtoId),
    index("pedido_canal_itens_empresa_id_pedido_canal_id_idx").on(t.empresaId, t.pedidoCanalId),
    index("pedido_canal_itens_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna("pedido_canal_itens", t.quantidade, sql`${t.quantidade} > 0`),
    checkColuna("pedido_canal_itens", t.precoUnitario, sql`${t.precoUnitario} >= 0`),
    checkColuna("pedido_canal_itens", t.taxa, sql`${t.taxa} >= 0`),
  ],
);

// 8.5 ------------------------------------------------------------------------
export const eventosIntegracao = pgTable(
  "eventos_integracao",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Os webhooks do Focus e do MDe não pertencem a um canal. */
    integracao: text("integracao", { enum: INTEGRACOES }).notNull(),
    /** Obrigatório em `mercado_livre` e `ecommerce`. */
    canalId: uuid("canal_id"),
    direcao: text("direcao", { enum: DIRECOES_EVENTO }).notNull(),
    /** Tópico: `orders_v2`, `items`, `pedido.status`, `nfe.autorizada`, `disponibilidade`… */
    tipo: text("tipo").notNull(),
    /** Recurso afetado (pedido, anúncio, ref). */
    idExterno: text("id_externo"),
    /** Composição por integração na seção 8.5 do modelo. */
    chaveIdempotencia: text("chave_idempotencia").notNull(),
    /** Corpo recebido ou enviado. */
    payload: jsonb("payload").notNull(),
    recebidoEm: timestamptz("recebido_em").notNull().defaultNow(),
    processadoEm: timestamptz("processado_em"),
    tentativas: integer("tentativas").notNull().default(0),
    erro: text("erro"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("eventos_integracao", [t.empresaId], [empresas.id]),
    fkEmpresa("eventos_integracao", t.empresaId, t.canalId, canaisVenda),
    chaveEmpresaId("eventos_integracao", t),
    // o webhook faz INSERT ... ON CONFLICT DO NOTHING; canal_id nulo (Focus, MDe) conta como igual
    unique("eventos_integracao_idempotencia_key")
      .on(t.empresaId, t.integracao, t.canalId, t.direcao, t.chaveIdempotencia)
      .nullsNotDistinct(),
    index("eventos_integracao_pendentes_idx")
      .on(t.recebidoEm)
      .where(sql`${t.processadoEm} is null`),
    index("eventos_integracao_empresa_integracao_recebido_idx").on(
      t.empresaId,
      t.integracao,
      t.recebidoEm.desc().nullsFirst(),
    ),
    checkIn("eventos_integracao", t.integracao, INTEGRACOES),
    checkIn("eventos_integracao", t.direcao, DIRECOES_EVENTO),
    checkColuna("eventos_integracao", t.tentativas, sql`${t.tentativas} >= 0`),
    check(
      "eventos_integracao_canal_check",
      sql`${t.integracao} not in ('mercado_livre', 'ecommerce') or ${t.canalId} is not null`,
    ),
  ],
);

// 8.6 ------------------------------------------------------------------------
export const apiChaves = pgTable(
  "api_chaves",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    canalId: uuid("canal_id").notNull(),
    nome: text("nome").notNull(),
    /** SHA-256 em hex. A chave em si nunca é gravada. */
    hash: text("hash").notNull(),
    /** Visível, ex.: `sk_ab12cd`. */
    prefixo: text("prefixo").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    /** Atualizado no máximo uma vez por minuto. */
    ultimoUsoEm: timestamptz("ultimo_uso_em"),
    revogadaEm: timestamptz("revogada_em"),
    criadoPor: uuid("criado_por").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("api_chaves", [t.empresaId], [empresas.id]),
    fkEmpresa("api_chaves", t.empresaId, t.canalId, canaisVenda),
    fk("api_chaves", [t.criadoPor], [usuarios.id]),
    chaveEmpresaId("api_chaves", t),
    // global: a busca acontece antes de saber a empresa
    unique("api_chaves_hash_key").on(t.hash),
    index("api_chaves_empresa_id_canal_id_idx").on(t.empresaId, t.canalId),
    checkRegex("api_chaves", t.hash, "^[0-9a-f]{64}$"),
  ],
);

// 8.7 ------------------------------------------------------------------------
export const outbox = pgTable(
  "outbox",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    tipo: text("tipo", { enum: TIPOS_OUTBOX }).notNull(),
    /** Chave de agrupamento: várias mudanças do mesmo produto viram um envio só. */
    produtoId: uuid("produto_id"),
    payload: jsonb("payload").notNull().default(sql`'{}'::jsonb`),
    processadoEm: timestamptz("processado_em"),
    tentativas: integer("tentativas").notNull().default(0),
    erro: text("erro"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("outbox", [t.empresaId], [empresas.id]),
    fkEmpresa("outbox", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("outbox", t),
    // created_at = "criado em"
    index("outbox_pendentes_idx").on(t.createdAt).where(sql`${t.processadoEm} is null`),
    index("outbox_agrupamento_idx")
      .on(t.empresaId, t.produtoId)
      .where(sql`${t.processadoEm} is null`),
    checkIn("outbox", t.tipo, TIPOS_OUTBOX),
  ],
);
