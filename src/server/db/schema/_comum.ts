/**
 * Peças comuns do schema Drizzle (docs/modelo-dados.md, seção 1).
 *
 * - Colunas comuns: `id`, `created_at` e `updated_at` (1.1). O `updated_at` é
 *   mantido pelo gatilho `set_updated_at()` (D005), não pela aplicação.
 * - Tipos (1.2): dinheiro numeric(14,2), quantidade numeric(14,4), custo
 *   numeric(16,6), percentual numeric(7,4). O Drizzle devolve `numeric` como
 *   string: o domínio converte para `Decimal`.
 * - Status e tipos (1.3, D004): `text` + `CHECK` com nome fixo
 *   `<tabela>_<coluna>_check`. Nunca `pgEnum`.
 * - FKs (1.4, 1.5, D003): nome explícito `<tabela>_<coluna>_fk`, `ON DELETE`
 *   sempre explícito (RESTRICT, salvo as exceções técnicas do Better Auth).
 *
 * Este arquivo não importa tabelas: os módulos passam as colunas de destino,
 * para não criar import circular.
 */
import { sql, type SQL } from "drizzle-orm";
import {
  boolean,
  check,
  customType,
  foreignKey,
  numeric,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
  type PgTableExtraConfigValue,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Tipos de coluna
// ---------------------------------------------------------------------------

/** Segredo cifrado na aplicação (AES-256-GCM, modelo 1.7). O Drizzle 0.45 não tem `bytea` nativo. */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

/**
 * Texto com collation ICU pt-BR no nível da coluna, para "Á" ordenar junto de "A"
 * nas listas ordenadas por nome ou descrição (modelo 1.11). Ver D022.
 */
export const textoPtBr = customType<{ data: string }>({
  dataType: () => 'text COLLATE "pt-BR-x-icu"',
});

/** `timestamptz`, lido como `Date`. A conversão para America/Sao_Paulo é só na exibição. */
export const timestamptz = (nome: string) => timestamp(nome, { withTimezone: true, mode: "date" });

/** Dinheiro: numeric(14,2). */
export const dinheiro = (nome: string) => numeric(nome, { precision: 14, scale: 2 });
/** Quantidade (saldo, item, fator): numeric(14,4). */
export const quantidade = (nome: string) => numeric(nome, { precision: 14, scale: 4 });
/** Custo unitário e custo médio: numeric(16,6). */
export const custo = (nome: string) => numeric(nome, { precision: 16, scale: 6 });
/** Alíquota, percentual, markup, MVA: numeric(7,4). */
export const percentual = (nome: string) => numeric(nome, { precision: 7, scale: 4 });

// ---------------------------------------------------------------------------
// Colunas comuns (1.1). São funções: cada tabela precisa de builders próprios.
// ---------------------------------------------------------------------------

export const colunaId = () => ({
  id: uuid("id").primaryKey().defaultRandom(),
});

export const colunaEmpresaId = () => ({
  empresaId: uuid("empresa_id").notNull(),
});

export const colunasTempo = () => ({
  createdAt: timestamptz("created_at").notNull().defaultNow(),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

/**
 * Tipo de retorno do terceiro argumento de `pgTable` (índices, FKs, checks).
 * Anotado em toda tabela: sem ele, tabelas que se referenciam (vendas ↔ orçamentos,
 * vendas ↔ documentos fiscais…) entram em ciclo na inferência de tipos do TypeScript.
 */
export type Restricoes = PgTableExtraConfigValue[];

type Colunas = [AnyPgColumn, ...AnyPgColumn[]];
type AcaoDelete = "restrict" | "cascade";

/**
 * FK com nome explícito. Padrão `<tabela>_<última coluna>_fk` e `ON DELETE RESTRICT`.
 * A última coluna é a que identifica o alvo (`produto_id` em `(empresa_id, produto_id)`).
 */
export function fk(
  tabela: string,
  colunas: Colunas,
  alvo: Colunas,
  opcoes: { onDelete?: AcaoDelete; nome?: string } = {},
) {
  const nome = opcoes.nome ?? `${tabela}_${colunas[colunas.length - 1].name}_fk`;
  return foreignKey({ name: nome, columns: colunas, foreignColumns: alvo }).onDelete(
    opcoes.onDelete ?? "restrict",
  );
}

/**
 * FK composta de isolamento (1.5): `(empresa_id, coluna) → alvo(empresa_id, id)`.
 * O banco recusa um documento da empresa A apontando para um cadastro da empresa B.
 */
export function fkEmpresa(
  tabela: string,
  empresaId: AnyPgColumn,
  coluna: AnyPgColumn,
  alvo: { empresaId: AnyPgColumn; id: AnyPgColumn },
  opcoes: { onDelete?: AcaoDelete; nome?: string } = {},
) {
  return fk(tabela, [empresaId, coluna], [alvo.empresaId, alvo.id], opcoes);
}

/**
 * Depósito vendável obrigatório (D28 do modelo): venda, OS e reserva nunca usam o
 * depósito "Garantia". A coluna é constante (`true`, com CHECK) e entra na FK
 * `(empresa_id, deposito_id, deposito_vendavel) → depositos (empresa_id, id, vendavel)`.
 */
export const colunaDepositoVendavel = () => ({
  depositoVendavel: boolean("deposito_vendavel").notNull().default(true),
});

export function restricoesDepositoVendavel(
  tabela: string,
  t: { empresaId: AnyPgColumn; depositoId: AnyPgColumn; depositoVendavel: AnyPgColumn },
  alvo: { empresaId: AnyPgColumn; id: AnyPgColumn; vendavel: AnyPgColumn },
) {
  return [
    fk(tabela, [t.empresaId, t.depositoId, t.depositoVendavel], [alvo.empresaId, alvo.id, alvo.vendavel], {
      nome: `${tabela}_deposito_id_fk`,
    }),
    checkColuna(tabela, t.depositoVendavel, sql`${t.depositoVendavel}`),
  ];
}

/** `unique (empresa_id, id)`: alvo das FKs compostas, presente em toda tabela [N] (1.1). */
export function chaveEmpresaId(tabela: string, t: { empresaId: AnyPgColumn; id: AnyPgColumn }) {
  return unique(`${tabela}_empresa_id_id_key`).on(t.empresaId, t.id);
}

function literal(valor: string | number): string {
  return typeof valor === "number" ? String(valor) : `'${valor.replaceAll("'", "''")}'`;
}

/** Lista SQL literal (`'a', 'b'`) a partir de constantes do código. Nunca recebe entrada do usuário. */
export function listaSql(valores: readonly (string | number)[]): SQL {
  return sql.raw(valores.map(literal).join(", "));
}

/** `CHECK (coluna in (...))` com o nome fixo `<tabela>_<coluna>_check` (1.3). */
export function checkIn(tabela: string, coluna: AnyPgColumn, valores: readonly (string | number)[]) {
  return check(`${tabela}_${coluna.name}_check`, sql`${coluna} in (${listaSql(valores)})`);
}

/** `CHECK` de uma coluna, com o nome fixo `<tabela>_<coluna>_check`. */
export function checkColuna(tabela: string, coluna: AnyPgColumn, condicao: SQL) {
  return check(`${tabela}_${coluna.name}_check`, condicao);
}

/** `CHECK (coluna ~ 'regex')`. A regex é constante do código. */
export function checkRegex(tabela: string, coluna: AnyPgColumn, regex: string) {
  return checkColuna(tabela, coluna, sql`${coluna} ~ ${sql.raw(literal(regex))}`);
}

// ---------------------------------------------------------------------------
// Formatos usados em vários módulos (1.2). O dígito verificador fica no domínio.
// ---------------------------------------------------------------------------

export const REGEX_CNPJ = "^[0-9A-Z]{12}[0-9]{2}$";
export const REGEX_CPF = "^[0-9]{11}$";
export const REGEX_CHAVE_NFE = "^[0-9]{44}$";
export const REGEX_CEP = "^[0-9]{8}$";
export const REGEX_IBGE = "^[0-9]{7}$";
export const REGEX_UF = "^[A-Z]{2}$";
export const REGEX_NCM = "^[0-9]{8}$";

export const TIPOS_PESSOA = ["pf", "pj"] as const;
export const INDICADORES_IE = [1, 2, 9] as const;

/** `status_fiscal` de venda, OS e devolução (7.3). */
export const STATUS_FISCAL = [
  "nao_emitido",
  "processando",
  "autorizado",
  "erro",
  "cancelado",
  "denegado",
  "externo",
] as const;

/** Formas de pagamento de venda e OS (7.5). */
export const FORMAS_PAGAMENTO = [
  "dinheiro",
  "pix",
  "debito",
  "credito",
  "boleto",
  "crediario",
  "marketplace",
  "outros",
] as const;

/** Ambiente fiscal (2.3, 9.1). */
export const AMBIENTES_FISCAIS = ["homologacao", "producao"] as const;
