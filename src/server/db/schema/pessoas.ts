/**
 * Pessoas, por empresa (docs/modelo-dados.md, seção 5).
 *
 * `empresa_grupo_id` aponta para outra empresa do mesmo tenant (regra 4.15).
 * O "mesmo tenant" não cabe numa FK (as tabelas de negócio não têm `tenant_id`):
 * a regra fica na action, com teste de integração (1.5).
 */
import { sql } from "drizzle-orm";
import {
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
  INDICADORES_IE,
  REGEX_CEP,
  REGEX_CNPJ,
  REGEX_CPF,
  REGEX_IBGE,
  REGEX_UF,
  TIPOS_PESSOA,
  chaveEmpresaId,
  checkColuna,
  checkIn,
  checkRegex,
  colunaEmpresaId,
  colunaId,
  colunasTempo,
  fk,
  fkEmpresa,
  quantidade,
  textoPtBr,
  type Restricoes,
} from "./_comum";
import { produtos, tabelasPreco } from "./catalogo";
import { empresas } from "./plataforma";
import { modelosMoto } from "./referencia";

// 5.1 ------------------------------------------------------------------------
export const clientes = pgTable(
  "clientes",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    tipoPessoa: text("tipo_pessoa", { enum: TIPOS_PESSOA }).notNull().default("pf"),
    /** Razão social, se PJ. */
    nome: textoPtBr("nome").notNull(),
    /** CPF (11 dígitos) ou CNPJ (14, alfanumérico), sem máscara. */
    cpfCnpj: text("cpf_cnpj"),
    ie: text("ie"),
    /** `indIEDest` da NF-e: 1 contribuinte, 2 isento, 9 não contribuinte. */
    indicadorIe: smallint("indicador_ie").notNull().default(9),
    /** Só dígitos, com DDD. */
    whatsapp: text("whatsapp"),
    email: text("email"),
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    municipio: text("municipio"),
    codigoIbgeMunicipio: text("codigo_ibge_municipio"),
    uf: text("uf"),
    tabelaPrecoId: uuid("tabela_preco_id"),
    empresaGrupoId: uuid("empresa_grupo_id"),
    /** O cliente "Consumidor final" da empresa. */
    consumidorFinalPadrao: boolean("consumidor_final_padrao").notNull().default(false),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("clientes", [t.empresaId], [empresas.id]),
    fkEmpresa("clientes", t.empresaId, t.tabelaPrecoId, tabelasPreco),
    fk("clientes", [t.empresaGrupoId], [empresas.id]),
    chaveEmpresaId("clientes", t),
    // a importação do TeraSoft mostra os duplicados na prévia (R11)
    uniqueIndex("clientes_empresa_id_cpf_cnpj_key")
      .on(t.empresaId, t.cpfCnpj)
      .where(sql`${t.cpfCnpj} is not null`),
    uniqueIndex("clientes_empresa_id_consumidor_final_key")
      .on(t.empresaId)
      .where(sql`${t.consumidorFinalPadrao}`),
    // paginação keyset (1.11); o GIN de busca por nome fica no passo 10
    index("clientes_empresa_id_nome_id_idx").on(t.empresaId, t.nome, t.id),
    index("clientes_empresa_id_whatsapp_idx").on(t.empresaId, t.whatsapp),
    checkIn("clientes", t.tipoPessoa, TIPOS_PESSOA),
    checkColuna(
      "clientes",
      t.cpfCnpj,
      sql`${t.cpfCnpj} is null or (${t.tipoPessoa} = 'pf' and ${t.cpfCnpj} ~ '${sql.raw(REGEX_CPF)}') or (${t.tipoPessoa} = 'pj' and ${t.cpfCnpj} ~ '${sql.raw(REGEX_CNPJ)}')`,
    ),
    checkIn("clientes", t.indicadorIe, INDICADORES_IE),
    checkRegex("clientes", t.whatsapp, "^[0-9]{10,13}$"),
    checkRegex("clientes", t.cep, REGEX_CEP),
    checkRegex("clientes", t.codigoIbgeMunicipio, REGEX_IBGE),
    checkRegex("clientes", t.uf, REGEX_UF),
    checkColuna("clientes", t.empresaGrupoId, sql`${t.empresaGrupoId} <> ${t.empresaId}`),
  ],
);

// 5.2 ------------------------------------------------------------------------
export const motosCliente = pgTable(
  "motos_cliente",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    clienteId: uuid("cliente_id").notNull(),
    modeloMotoId: uuid("modelo_moto_id"),
    /** Texto livre quando o modelo não está no cadastro. */
    descricao: text("descricao"),
    ano: smallint("ano"),
    /** Maiúsculas, sem hífen: padrão antigo e Mercosul. */
    placa: text("placa"),
    cor: text("cor"),
    kmAtual: integer("km_atual"),
    chassi: text("chassi"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("motos_cliente", [t.empresaId], [empresas.id]),
    fkEmpresa("motos_cliente", t.empresaId, t.clienteId, clientes),
    fk("motos_cliente", [t.modeloMotoId], [modelosMoto.id]),
    chaveEmpresaId("motos_cliente", t),
    // D8 do modelo: a moto é uma só; se trocar de dono, muda o cliente_id
    uniqueIndex("motos_cliente_empresa_id_placa_key")
      .on(t.empresaId, t.placa)
      .where(sql`${t.placa} is not null`),
    index("motos_cliente_empresa_id_cliente_id_idx").on(t.empresaId, t.clienteId),
    checkColuna("motos_cliente", t.ano, sql`${t.ano} between 1950 and 2100`),
    checkRegex("motos_cliente", t.placa, "^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$"),
    checkColuna("motos_cliente", t.kmAtual, sql`${t.kmAtual} >= 0`),
    check(
      "motos_cliente_modelo_check",
      sql`${t.modeloMotoId} is not null or ${t.descricao} is not null`,
    ),
  ],
);

// 5.3 ------------------------------------------------------------------------
export const fornecedores = pgTable(
  "fornecedores",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    /** Nulo para fornecedor importado sem CNPJ. */
    cnpj: text("cnpj"),
    razaoSocial: textoPtBr("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia"),
    /** Vem do XML. */
    ie: text("ie"),
    /** Nome do contato. */
    contato: text("contato"),
    telefone: text("telefone"),
    email: text("email"),
    // [ADIÇÃO] exigidos na NF-e de devolução ao fornecedor; preenchidos pelo XML
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    municipio: text("municipio"),
    codigoIbgeMunicipio: text("codigo_ibge_municipio"),
    uf: text("uf"),
    empresaGrupoId: uuid("empresa_grupo_id"),
    observacoes: text("observacoes"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("fornecedores", [t.empresaId], [empresas.id]),
    fk("fornecedores", [t.empresaGrupoId], [empresas.id]),
    chaveEmpresaId("fornecedores", t),
    uniqueIndex("fornecedores_empresa_id_cnpj_key")
      .on(t.empresaId, t.cnpj)
      .where(sql`${t.cnpj} is not null`),
    // paginação keyset (1.11); o GIN de busca por razão social fica no passo 10
    index("fornecedores_empresa_id_razao_social_id_idx").on(t.empresaId, t.razaoSocial, t.id),
    checkRegex("fornecedores", t.cnpj, REGEX_CNPJ),
    checkRegex("fornecedores", t.cep, REGEX_CEP),
    checkRegex("fornecedores", t.codigoIbgeMunicipio, REGEX_IBGE),
    checkRegex("fornecedores", t.uf, REGEX_UF),
    checkColuna("fornecedores", t.empresaGrupoId, sql`${t.empresaGrupoId} <> ${t.empresaId}`),
  ],
);

// 5.4 ------------------------------------------------------------------------
export const fornecedorProdutoVinculos = pgTable(
  "fornecedor_produto_vinculos",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    fornecedorId: uuid("fornecedor_id").notNull(),
    /** `cProd` do XML. */
    codigoFornecedor: text("codigo_fornecedor").notNull(),
    produtoId: uuid("produto_id").notNull(),
    /** `uCom` do XML. */
    unidadeCompra: text("unidade_compra"),
    /** Unidades de estoque por unidade de compra. */
    fator: quantidade("fator").notNull().default("1"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("fornecedor_produto_vinculos", [t.empresaId], [empresas.id]),
    fkEmpresa("fornecedor_produto_vinculos", t.empresaId, t.fornecedorId, fornecedores),
    fkEmpresa("fornecedor_produto_vinculos", t.empresaId, t.produtoId, produtos),
    chaveEmpresaId("fornecedor_produto_vinculos", t),
    unique("fornecedor_produto_vinculos_fornecedor_codigo_key").on(
      t.empresaId,
      t.fornecedorId,
      t.codigoFornecedor,
    ),
    index("fornecedor_produto_vinculos_empresa_id_produto_id_idx").on(t.empresaId, t.produtoId),
    checkColuna("fornecedor_produto_vinculos", t.fator, sql`${t.fator} > 0`),
  ],
);
