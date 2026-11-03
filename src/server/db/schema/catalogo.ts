/**
 * Catálogo, por empresa (docs/modelo-dados.md, seção 4).
 *
 * Sem `produtos.tipo` nem `kit_componentes`: o kit é um produto comum (D012).
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import {
  REGEX_NCM,
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
  percentual,
  quantidade,
  textoPtBr,
  type Restricoes,
} from "./_comum";
import { empresas, membros } from "./plataforma";
import { modelosMoto } from "./referencia";

export const REGIMES_PERFIL_TRIBUTARIO = ["simples", "normal"] as const;
/** Unidade de estoque (regra 4.6; `PCT` acrescentada pelo diretor, R13). */
export const UNIDADES = ["UN", "PC", "PAR", "JG", "KIT", "CX", "PCT", "LT", "ML", "M"] as const;
export const TIPOS_CODIGO_BARRAS = ["fabricante", "interno", "embalagem"] as const;
export const BASES_TABELA_PRECO = ["preco_base", "ultimo_custo", "custo_medio"] as const;

/** Medidas de frete em cm: numeric(8,2) (4.4). */
const centimetros = (nome: string) => numeric(nome, { precision: 8, scale: 2 });

// 4.1 ------------------------------------------------------------------------
export const categorias = pgTable(
  "categorias",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    nome: textoPtBr("nome").notNull(),
    /** Herdado pelo produto sem markup próprio. */
    markupPadrao: percentual("markup_padrao"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("categorias", [t.empresaId], [empresas.id]),
    chaveEmpresaId("categorias", t),
    uniqueIndex("categorias_empresa_id_nome_key").on(t.empresaId, sql`lower(${t.nome})`),
    checkColuna("categorias", t.markupPadrao, sql`${t.markupPadrao} >= 0`),
  ],
);

// 4.2 ------------------------------------------------------------------------
export const marcas = pgTable(
  "marcas",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Cobreq, Vaz, NGK… */
    nome: textoPtBr("nome").notNull(),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("marcas", [t.empresaId], [empresas.id]),
    chaveEmpresaId("marcas", t),
    uniqueIndex("marcas_empresa_id_nome_key").on(t.empresaId, sql`lower(${t.nome})`),
  ],
);

// 4.3 ------------------------------------------------------------------------
export const perfisTributarios = pgTable(
  "perfis_tributarios",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    nome: textoPtBr("nome").notNull(),
    descricao: text("descricao"),
    regime: text("regime", { enum: REGIMES_PERFIL_TRIBUTARIO }).notNull(),
    // ICMS
    csosn: text("csosn"),
    cstIcms: text("cst_icms"),
    aliquotaIcms: percentual("aliquota_icms"),
    reducaoBaseIcms: percentual("reducao_base_icms"),
    // ICMS-ST
    stRetidoAnteriormente: boolean("st_retido_anteriormente").notNull().default(false),
    mva: percentual("mva"),
    aliquotaSt: percentual("aliquota_st"),
    fcpSt: percentual("fcp_st"),
    // PIS/COFINS
    cstPis: text("cst_pis"),
    aliqPis: percentual("aliq_pis"),
    cstCofins: text("cst_cofins"),
    aliqCofins: percentual("aliq_cofins"),
    monofasico: boolean("monofasico").notNull().default(false),
    // IPI
    cstIpi: text("cst_ipi"),
    aliqIpi: percentual("aliq_ipi"),
    // IBS/CBS (reforma tributária)
    cstIbsCbs: text("cst_ibs_cbs"),
    cclasstrib: text("cclasstrib"),
    aliqCbs: percentual("aliq_cbs"),
    aliqIbsUf: percentual("aliq_ibs_uf"),
    aliqIbsMun: percentual("aliq_ibs_mun"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("perfis_tributarios", [t.empresaId], [empresas.id]),
    chaveEmpresaId("perfis_tributarios", t),
    uniqueIndex("perfis_tributarios_empresa_id_nome_key").on(t.empresaId, sql`lower(${t.nome})`),
    checkIn("perfis_tributarios", t.regime, REGIMES_PERFIL_TRIBUTARIO),
    checkRegex("perfis_tributarios", t.csosn, "^[0-9]{3}$"),
    checkRegex("perfis_tributarios", t.cstIcms, "^[0-9]{2}$"),
    checkColuna("perfis_tributarios", t.aliquotaIcms, sql`${t.aliquotaIcms} >= 0`),
    checkColuna(
      "perfis_tributarios",
      t.reducaoBaseIcms,
      sql`${t.reducaoBaseIcms} between 0 and 100`,
    ),
    checkColuna("perfis_tributarios", t.mva, sql`${t.mva} >= 0`),
    checkColuna("perfis_tributarios", t.aliquotaSt, sql`${t.aliquotaSt} >= 0`),
    checkColuna("perfis_tributarios", t.fcpSt, sql`${t.fcpSt} >= 0`),
    checkRegex("perfis_tributarios", t.cstPis, "^[0-9]{2}$"),
    checkColuna("perfis_tributarios", t.aliqPis, sql`${t.aliqPis} >= 0`),
    checkRegex("perfis_tributarios", t.cstCofins, "^[0-9]{2}$"),
    checkColuna("perfis_tributarios", t.aliqCofins, sql`${t.aliqCofins} >= 0`),
    checkRegex("perfis_tributarios", t.cstIpi, "^[0-9]{2}$"),
    checkColuna("perfis_tributarios", t.aliqIpi, sql`${t.aliqIpi} >= 0`),
    checkRegex("perfis_tributarios", t.cstIbsCbs, "^[0-9]{3}$"),
    checkRegex("perfis_tributarios", t.cclasstrib, "^[0-9]{6}$"),
    checkColuna("perfis_tributarios", t.aliqCbs, sql`${t.aliqCbs} >= 0`),
    checkColuna("perfis_tributarios", t.aliqIbsUf, sql`${t.aliqIbsUf} >= 0`),
    checkColuna("perfis_tributarios", t.aliqIbsMun, sql`${t.aliqIbsMun} >= 0`),
    // os demais obrigatórios dependem do CST e ficam na validação Zod do formulário
    check(
      "perfis_tributarios_regime_icms_check",
      sql`(${t.regime} = 'simples' and ${t.csosn} is not null) or (${t.regime} = 'normal' and ${t.cstIcms} is not null)`,
    ),
  ],
);

// 4.4 ------------------------------------------------------------------------
export const produtos = pgTable(
  "produtos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** SKU. Gerado em `sequencias.produto` se vier em branco (regra 4.7). */
    codigo: text("codigo").notNull(),
    descricao: textoPtBr("descricao").notNull(),
    /** Etiqueta. */
    descricaoCurta: text("descricao_curta"),
    /** Canais; também guarda o conteúdo do kit (R13). */
    descricaoCompleta: text("descricao_completa"),
    categoriaId: uuid("categoria_id"),
    marcaId: uuid("marca_id"),
    referenciaFabricante: text("referencia_fabricante"),
    /** Código da montadora. */
    codigoOriginal: text("codigo_original"),
    unidade: text("unidade", { enum: UNIDADES }).notNull().default("UN"),
    corredor: text("corredor"),
    prateleira: text("prateleira"),
    gaveta: text("gaveta"),
    estoqueMinimo: quantidade("estoque_minimo").notNull().default("0"),
    /** Nulo: herda `categorias.markup_padrao`. */
    markup: percentual("markup"),
    /** Preço de venda base. */
    precoVenda: dinheiro("preco_venda").notNull().default("0"),
    ativo: boolean("ativo").notNull().default(true),
    observacoes: text("observacoes"),
    pesoG: integer("peso_g"),
    alturaCm: centimetros("altura_cm"),
    larguraCm: centimetros("largura_cm"),
    comprimentoCm: centimetros("comprimento_cm"),
    ncm: text("ncm"),
    cest: text("cest"),
    origem: smallint("origem"),
    /** Dígito verificador validado no domínio. Vazio = `SEM GTIN`. */
    gtinFiscal: text("gtin_fiscal"),
    /** Nula: igual a `unidade`. */
    unidadeTributavel: text("unidade_tributavel"),
    perfilTributarioId: uuid("perfil_tributario_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("produtos", [t.empresaId], [empresas.id]),
    fkEmpresa("produtos", t.empresaId, t.categoriaId, categorias),
    fkEmpresa("produtos", t.empresaId, t.marcaId, marcas),
    fkEmpresa("produtos", t.empresaId, t.perfilTributarioId, perfisTributarios),
    unique("produtos_empresa_id_codigo_key").on(t.empresaId, t.codigo),
    chaveEmpresaId("produtos", t),
    // lista por descrição, paginação keyset (1.11)
    index("produtos_empresa_id_descricao_id_idx").on(t.empresaId, t.descricao, t.id),
    index("produtos_empresa_id_categoria_id_idx").on(t.empresaId, t.categoriaId),
    index("produtos_empresa_id_marca_id_idx").on(t.empresaId, t.marcaId),
    // os índices GIN de busca (f_unaccent + pg_trgm) estão na migração custom do passo 10
    checkColuna("produtos", t.codigo, sql`${t.codigo} = btrim(${t.codigo}) and ${t.codigo} <> ''`),
    checkIn("produtos", t.unidade, UNIDADES),
    checkColuna("produtos", t.estoqueMinimo, sql`${t.estoqueMinimo} >= 0`),
    checkColuna("produtos", t.markup, sql`${t.markup} >= 0`),
    checkColuna("produtos", t.precoVenda, sql`${t.precoVenda} >= 0`),
    checkColuna("produtos", t.pesoG, sql`${t.pesoG} > 0`),
    checkColuna("produtos", t.alturaCm, sql`${t.alturaCm} > 0`),
    checkColuna("produtos", t.larguraCm, sql`${t.larguraCm} > 0`),
    checkColuna("produtos", t.comprimentoCm, sql`${t.comprimentoCm} > 0`),
    checkRegex("produtos", t.ncm, REGEX_NCM),
    checkRegex("produtos", t.cest, "^[0-9]{7}$"),
    checkColuna("produtos", t.origem, sql`${t.origem} between 0 and 8`),
    // a última barreira contra o EAN interno no GTIN fiscal; o domínio barra o resto (D019)
    checkColuna(
      "produtos",
      t.gtinFiscal,
      sql`${t.gtinFiscal} ~ '^([0-9]{8}|[0-9]{12,14})$' and not (length(${t.gtinFiscal}) = 13 and ${t.gtinFiscal} like '2%')`,
    ),
  ],
);

// 4.5 ------------------------------------------------------------------------
export const produtoCodigosBarras = pgTable(
  "produto_codigos_barras",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    produtoId: uuid("produto_id").notNull(),
    /** Aceita EAN, GTIN e Code128. */
    codigo: text("codigo").notNull(),
    tipo: text("tipo", { enum: TIPOS_CODIGO_BARRAS }).notNull(),
    /** Unidades de estoque que o código representa. */
    fator: quantidade("fator").notNull().default("1"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("produto_codigos_barras", [t.empresaId], [empresas.id]),
    fkEmpresa("produto_codigos_barras", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("produto_codigos_barras", t),
    unique("produto_codigos_barras_empresa_id_codigo_key").on(t.empresaId, t.codigo),
    index("produto_codigos_barras_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna(
      "produto_codigos_barras",
      t.codigo,
      sql`${t.codigo} = btrim(${t.codigo}) and ${t.codigo} <> ''`,
    ),
    checkIn("produto_codigos_barras", t.tipo, TIPOS_CODIGO_BARRAS),
    checkColuna("produto_codigos_barras", t.fator, sql`${t.fator} > 0`),
  ],
);

// 4.6 ------------------------------------------------------------------------
export const produtoImagens = pgTable(
  "produto_imagens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    produtoId: uuid("produto_id").notNull(),
    /** Chave no storage. */
    chave: text("chave").notNull(),
    ordem: smallint("ordem").notNull().default(0),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("produto_imagens", [t.empresaId], [empresas.id]),
    fkEmpresa("produto_imagens", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("produto_imagens", t),
    index("produto_imagens_empresa_id_produto_id_ordem_idx").on(t.empresaId, t.produtoId, t.ordem),
    checkColuna("produto_imagens", t.ordem, sql`${t.ordem} >= 0`),
  ],
);

// 4.7 ------------------------------------------------------------------------
export const produtoAplicacoes = pgTable(
  "produto_aplicacoes",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    produtoId: uuid("produto_id").notNull(),
    /** Global (`modelos_moto` não tem empresa). */
    modeloMotoId: uuid("modelo_moto_id").notNull(),
    /** Nulo: sem limite inferior. */
    anoInicial: smallint("ano_inicial"),
    /** Nulo: até hoje. */
    anoFinal: smallint("ano_final"),
    /** "dianteira". */
    observacao: text("observacao"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("produto_aplicacoes", [t.empresaId], [empresas.id]),
    fkEmpresa("produto_aplicacoes", t.empresaId, t.produtoId, produtos),
    fk("produto_aplicacoes", [t.modeloMotoId], [modelosMoto.id]),
    chaveEmpresaId("produto_aplicacoes", t),
    // "peças por moto"
    index("produto_aplicacoes_empresa_id_modelo_moto_id_idx").on(t.empresaId, t.modeloMotoId),
    index("produto_aplicacoes_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna("produto_aplicacoes", t.anoInicial, sql`${t.anoInicial} between 1950 and 2100`),
    checkColuna("produto_aplicacoes", t.anoFinal, sql`${t.anoFinal} between 1950 and 2100`),
    check(
      "produto_aplicacoes_anos_check",
      sql`${t.anoFinal} is null or ${t.anoInicial} is null or ${t.anoFinal} >= ${t.anoInicial}`,
    ),
  ],
);

// 4.8 ------------------------------------------------------------------------
export const servicos = pgTable(
  "servicos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Digitado. */
    codigo: text("codigo").notNull(),
    descricao: textoPtBr("descricao").notNull(),
    precoPadrao: dinheiro("preco_padrao").notNull().default("0"),
    /** Valor fixo pago ao mecânico (regra 4.13). */
    comissaoValor: dinheiro("comissao_valor").notNull().default("0"),
    tempoEstimadoMin: integer("tempo_estimado_min"),
    ativo: boolean("ativo").notNull().default(true),
    // NFS-e, ocultos (backlog)
    itemListaServico: text("item_lista_servico"),
    codigoTributacaoMunicipio: text("codigo_tributacao_municipio"),
    aliquotaIss: percentual("aliquota_iss"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("servicos", [t.empresaId], [empresas.id]),
    chaveEmpresaId("servicos", t),
    unique("servicos_empresa_id_codigo_key").on(t.empresaId, t.codigo),
    checkColuna("servicos", t.codigo, sql`btrim(${t.codigo}) <> ''`),
    checkColuna("servicos", t.precoPadrao, sql`${t.precoPadrao} >= 0`),
    checkColuna("servicos", t.comissaoValor, sql`${t.comissaoValor} >= 0`),
    checkColuna("servicos", t.tempoEstimadoMin, sql`${t.tempoEstimadoMin} > 0`),
    checkColuna("servicos", t.aliquotaIss, sql`${t.aliquotaIss} >= 0`),
  ],
);

// 4.9 ------------------------------------------------------------------------
export const mecanicos = pgTable(
  "mecanicos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    nome: textoPtBr("nome").notNull(),
    /** O mecânico pode não ter login. A FK garante que o login é membro desta empresa. */
    usuarioId: uuid("usuario_id"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("mecanicos", [t.empresaId], [empresas.id]),
    fk("mecanicos", [t.empresaId, t.usuarioId], [membros.empresaId, membros.usuarioId]),
    chaveEmpresaId("mecanicos", t),
    uniqueIndex("mecanicos_empresa_id_usuario_id_key")
      .on(t.empresaId, t.usuarioId)
      .where(sql`${t.usuarioId} is not null`),
  ],
);

// 4.10 [ADIÇÃO, D22] ---------------------------------------------------------
export const vendedores = pgTable(
  "vendedores",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    nome: textoPtBr("nome").notNull(),
    /** Opcional. Com login, o balcão já vem com ele preenchido. */
    usuarioId: uuid("usuario_id"),
    /** Percentual sobre o valor das peças. Só o dono altera, com auditoria. */
    percentualComissao: percentual("percentual_comissao").notNull().default("0"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("vendedores", [t.empresaId], [empresas.id]),
    fk("vendedores", [t.empresaId, t.usuarioId], [membros.empresaId, membros.usuarioId]),
    chaveEmpresaId("vendedores", t),
    uniqueIndex("vendedores_empresa_id_usuario_id_key")
      .on(t.empresaId, t.usuarioId)
      .where(sql`${t.usuarioId} is not null`),
    uniqueIndex("vendedores_empresa_id_nome_key").on(t.empresaId, sql`lower(${t.nome})`),
    checkColuna(
      "vendedores",
      t.percentualComissao,
      sql`${t.percentualComissao} between 0 and 100`,
    ),
  ],
);

// 4.11 -----------------------------------------------------------------------
export const tabelasPreco = pgTable(
  "tabelas_preco",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    nome: textoPtBr("nome").notNull(),
    base: text("base", { enum: BASES_TABELA_PRECO }).notNull().default("preco_base"),
    /** Preço = base × (1 + percentual/100). Negativo = desconto. */
    percentual: percentual("percentual").notNull().default("0"),
    /** Tabela usada quando o cliente não tem tabela padrão. */
    padrao: boolean("padrao").notNull().default(false),
    /** Aplica `empresas.config.arredondamento_preco` ao preço calculado (D26 do modelo). */
    aplicarArredondamento: boolean("aplicar_arredondamento").notNull().default(true),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("tabelas_preco", [t.empresaId], [empresas.id]),
    chaveEmpresaId("tabelas_preco", t),
    uniqueIndex("tabelas_preco_empresa_id_nome_key").on(t.empresaId, sql`lower(${t.nome})`),
    uniqueIndex("tabelas_preco_empresa_id_padrao_key").on(t.empresaId).where(sql`${t.padrao}`),
    checkIn("tabelas_preco", t.base, BASES_TABELA_PRECO),
    checkColuna("tabelas_preco", t.percentual, sql`${t.percentual} > -100`),
  ],
);

// 4.12 -----------------------------------------------------------------------
export const tabelaPrecoItens = pgTable(
  "tabela_preco_itens",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    tabelaPrecoId: uuid("tabela_preco_id").notNull(),
    produtoId: uuid("produto_id").notNull(),
    /** Preço fixo; a linha só existe se houver preço fixo. Nunca é arredondado. */
    preco: dinheiro("preco").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("tabela_preco_itens", [t.empresaId], [empresas.id]),
    fkEmpresa("tabela_preco_itens", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    fkEmpresa("tabela_preco_itens", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("tabela_preco_itens", t),
    unique("tabela_preco_itens_tabela_preco_id_produto_id_key").on(t.tabelaPrecoId, t.produtoId),
    index("tabela_preco_itens_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna("tabela_preco_itens", t.preco, sql`${t.preco} >= 0`),
  ],
);
