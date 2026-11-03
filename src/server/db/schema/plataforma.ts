/**
 * Plataforma e acesso (docs/modelo-dados.md, seção 2).
 *
 * As tabelas do Better Auth têm nome em português e colunas com os nomes do
 * Better Auth em snake_case; as chaves TypeScript ficam com o nome do Better Auth
 * (seção 1.9), para o `drizzleAdapter` mapear `user`, `session`, `account` e
 * `verification` sem renomear campos. Conferido com o better-auth 1.7.16.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import {
  AMBIENTES_FISCAIS,
  REGEX_CEP,
  REGEX_CNPJ,
  REGEX_IBGE,
  REGEX_UF,
  bytea,
  chaveEmpresaId,
  checkColuna,
  checkIn,
  checkRegex,
  colunaEmpresaId,
  colunaId,
  colunasTempo,
  fk,
  timestamptz,
  type Restricoes,
} from "./_comum";

export const STATUS_TENANT = ["ativo", "suspenso"] as const;
export const REGIMES_TRIBUTARIOS = ["simples_nacional", "lucro_presumido", "lucro_real"] as const;
export const PERFIS = ["dono", "balcao", "estoque", "mecanico"] as const;

// Padrões dos JSONs da empresa (seção 11). Valores decimais em JSON são strings (D5).
const CONFIG_EMPRESA_PADRAO = sql`'{"permite_estoque_negativo": false, "arredondamento_preco": {"modo": "nenhum"}, "limite_desconto_percentual": {"dono": "100.0000", "balcao": "0.0000", "estoque": "0.0000", "mecanico": "0.0000"}, "validade_orcamento_dias": 7}'::jsonb`;
const MODULOS_PADRAO = sql`'{"balcao": false, "os": false, "fiscal": false, "mercado_livre": false, "ecommerce": false, "estoque": false}'::jsonb`;
const CONFIG_FISCAL_PADRAO = sql`'{"ambiente": "homologacao", "nfe": {"serie": 1}, "nfce": {"serie": 1}, "series_emissor_externo": []}'::jsonb`;

// 2.1 ------------------------------------------------------------------------
export const tenants = pgTable(
  "tenants",
  {
    ...colunaId(),
    nome: text("nome").notNull(),
    status: text("status", { enum: STATUS_TENANT }).notNull().default("ativo"),
    ...colunasTempo(),
  },
  (t): Restricoes => [checkIn("tenants", t.status, STATUS_TENANT)],
);

// 2.2 ------------------------------------------------------------------------
export const empresas = pgTable(
  "empresas",
  {
    ...colunaId(),
    tenantId: uuid("tenant_id").notNull(),
    razaoSocial: text("razao_social").notNull(),
    nomeFantasia: text("nome_fantasia"),
    cnpj: text("cnpj").notNull(),
    ie: text("ie"),
    im: text("im"),
    regimeTributario: text("regime_tributario", { enum: REGIMES_TRIBUTARIOS }).notNull(),
    cep: text("cep"),
    logradouro: text("logradouro"),
    numero: text("numero"),
    complemento: text("complemento"),
    bairro: text("bairro"),
    municipio: text("municipio"),
    codigoIbgeMunicipio: text("codigo_ibge_municipio"),
    uf: text("uf"),
    telefone: text("telefone"),
    logoChave: text("logo_chave"),
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default(CONFIG_EMPRESA_PADRAO),
    modulos: jsonb("modulos").$type<Record<string, boolean>>().notNull().default(MODULOS_PADRAO),
    configFiscal: jsonb("config_fiscal")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(CONFIG_FISCAL_PADRAO),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("empresas", [t.tenantId], [tenants.id]),
    unique("empresas_cnpj_key").on(t.cnpj),
    index("empresas_tenant_id_idx").on(t.tenantId),
    checkRegex("empresas", t.cnpj, REGEX_CNPJ),
    checkIn("empresas", t.regimeTributario, REGIMES_TRIBUTARIOS),
    checkRegex("empresas", t.cep, REGEX_CEP),
    checkRegex("empresas", t.codigoIbgeMunicipio, REGEX_IBGE),
    checkRegex("empresas", t.uf, REGEX_UF),
  ],
);

// 2.4 Better Auth `user` -----------------------------------------------------
export const usuarios = pgTable("usuarios", {
  ...colunaId(),
  name: text("name").notNull(),
  email: text("email").notNull().unique("usuarios_email_key"),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  /** `additionalFields`, `input: false`. Dá acesso só a `/admin`. */
  adminPlataforma: boolean("admin_plataforma").notNull().default(false),
  ...colunasTempo(),
});

// 2.8 ------------------------------------------------------------------------
export const membros = pgTable(
  "membros",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    usuarioId: uuid("usuario_id").notNull(),
    perfil: text("perfil", { enum: PERFIS }).notNull(),
    pinHash: text("pin_hash"),
    pinFalhas: smallint("pin_falhas").notNull().default(0),
    pinBloqueadoAte: timestamptz("pin_bloqueado_ate"),
    ativo: boolean("ativo").notNull().default(true),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("membros", [t.empresaId], [empresas.id]),
    fk("membros", [t.usuarioId], [usuarios.id]),
    chaveEmpresaId("membros", t),
    // também é o alvo das FKs de `sessoes`, `mecanicos` e `vendedores`
    unique("membros_empresa_id_usuario_id_key").on(t.empresaId, t.usuarioId),
    index("membros_usuario_id_idx").on(t.usuarioId),
    checkIn("membros", t.perfil, PERFIS),
    checkColuna("membros", t.pinHash, sql`${t.pinHash} is null or ${t.perfil} = 'dono'`),
    checkColuna("membros", t.pinFalhas, sql`${t.pinFalhas} >= 0`),
  ],
);

// 2.5 Better Auth `session` --------------------------------------------------
export const sessoes = pgTable(
  "sessoes",
  {
    ...colunaId(),
    token: text("token").notNull().unique("sessoes_token_key"),
    expiresAt: timestamptz("expires_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: uuid("user_id").notNull(),
    /** `additionalFields`, `input: false`. Só muda pela action de trocar de empresa. */
    empresaAtivaId: uuid("empresa_ativa_id"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    // exceções técnicas de CASCADE (1.4)
    fk("sessoes", [t.userId], [usuarios.id], { onDelete: "cascade" }),
    fk("sessoes", [t.empresaAtivaId, t.userId], [membros.empresaId, membros.usuarioId], {
      onDelete: "cascade",
      nome: "sessoes_empresa_ativa_id_fk",
    }),
    index("sessoes_user_id_idx").on(t.userId),
  ],
);

// 2.6 Better Auth `account` --------------------------------------------------
export const contasAcesso = pgTable(
  "contas_acesso",
  {
    ...colunaId(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id").notNull(),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamptz("access_token_expires_at"),
    refreshTokenExpiresAt: timestamptz("refresh_token_expires_at"),
    scope: text("scope"),
    /** Hash da senha, gerado pelo Better Auth. */
    password: text("password"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("contas_acesso", [t.userId], [usuarios.id], { onDelete: "cascade" }),
    index("contas_acesso_user_id_idx").on(t.userId),
    unique("contas_acesso_provider_id_account_id_key").on(t.providerId, t.accountId),
  ],
);

// 2.7 Better Auth `verification` ---------------------------------------------
export const verificacoes = pgTable(
  "verificacoes",
  {
    ...colunaId(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    ...colunasTempo(),
  },
  (t): Restricoes => [index("verificacoes_identifier_idx").on(t.identifier)],
);

// 2.3 ------------------------------------------------------------------------
export const credenciaisFiscais = pgTable(
  "credenciais_fiscais",
  {
    ...colunaId(),
    ...colunaEmpresaId(),
    ambiente: text("ambiente", { enum: AMBIENTES_FISCAIS }).notNull(),
    focusTokenCifrado: bytea("focus_token_cifrado"),
    /** Identificador do CSC da NFC-e (não é segredo). */
    cscId: text("csc_id"),
    cscCifrado: bytea("csc_cifrado"),
    certificadoValidade: date("certificado_validade", { mode: "string" }),
    certificadoEnviadoEm: timestamptz("certificado_enviado_em"),
    ...colunasTempo(),
  },
  (t): Restricoes => [
    fk("credenciais_fiscais", [t.empresaId], [empresas.id]),
    chaveEmpresaId("credenciais_fiscais", t),
    unique("credenciais_fiscais_empresa_id_ambiente_key").on(t.empresaId, t.ambiente),
    checkIn("credenciais_fiscais", t.ambiente, AMBIENTES_FISCAIS),
  ],
);
