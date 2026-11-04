/**
 * Cadastros de apoio do seed (seção 8): serviços com comissão, mecânicos,
 * vendedores (D018) e tabelas de preço. Iguais nas duas empresas; o seed grava
 * uma vez por empresa. Nomes de pessoas são fictícios.
 */
import type { servicos, tabelasPreco } from "../../../src/server/db/schema/catalogo";
import type { ChaveUsuarioDemo } from "./empresas";
import type { ChaveEmpresaDemo, DecimalTexto } from "./tipos";

// ---------------------------------------------------------------- Serviços

type ServicoInsert = Omit<
  typeof servicos.$inferInsert,
  "id" | "empresaId" | "createdAt" | "updatedAt" | "itemListaServico" | "codigoTributacaoMunicipio" | "aliquotaIss"
>;

export interface ServicoSeed extends ServicoInsert {
  codigo: string;
  descricao: string;
  precoPadrao: DecimalTexto;
  /** Valor fixo pago ao mecânico (regra 4.13). */
  comissaoValor: DecimalTexto;
  tempoEstimadoMin: number;
}

export const SERVICOS = [
  { codigo: "S001", descricao: "Troca de óleo e filtro", precoPadrao: "30.00", comissaoValor: "10.00", tempoEstimadoMin: 20 },
  { codigo: "S002", descricao: "Revisão geral", precoPadrao: "150.00", comissaoValor: "50.00", tempoEstimadoMin: 120 },
  { codigo: "S003", descricao: "Troca de relação (kit)", precoPadrao: "60.00", comissaoValor: "25.00", tempoEstimadoMin: 45 },
  { codigo: "S004", descricao: "Regulagem de freio", precoPadrao: "25.00", comissaoValor: "10.00", tempoEstimadoMin: 15 },
  { codigo: "S005", descricao: "Troca de pastilha de freio", precoPadrao: "35.00", comissaoValor: "12.00", tempoEstimadoMin: 25 },
  { codigo: "S006", descricao: "Troca de pneu", precoPadrao: "30.00", comissaoValor: "12.00", tempoEstimadoMin: 30 },
  { codigo: "S007", descricao: "Troca de câmara de ar", precoPadrao: "25.00", comissaoValor: "10.00", tempoEstimadoMin: 25 },
  { codigo: "S008", descricao: "Troca de cabo (acelerador ou embreagem)", precoPadrao: "30.00", comissaoValor: "12.00", tempoEstimadoMin: 30 },
  { codigo: "S009", descricao: "Limpeza e regulagem do carburador", precoPadrao: "80.00", comissaoValor: "30.00", tempoEstimadoMin: 60 },
  { codigo: "S010", descricao: "Troca de bateria e teste do sistema de carga", precoPadrao: "20.00", comissaoValor: "8.00", tempoEstimadoMin: 15 },
] as const satisfies readonly ServicoSeed[];

// ---------------------------------------------------------------- Mecânicos e vendedores

export interface MecanicoSeed {
  nome: string;
  /** Login ligado ao mecânico (opcional: o mecânico pode não ter login). */
  usuario: ChaveUsuarioDemo | null;
  /** Empresas em que trabalha. */
  empresas: readonly ChaveEmpresaDemo[];
}

export const MECANICOS = [
  { nome: "Marcos Mecânico", usuario: "mecanico", empresas: ["simples"] },
  { nome: "Rogério Alves", usuario: null, empresas: ["simples", "real"] },
  { nome: "Tiago Nunes", usuario: null, empresas: ["simples", "real"] },
] as const satisfies readonly MecanicoSeed[];

export interface VendedorSeed {
  nome: string;
  usuario: ChaveUsuarioDemo | null;
  /** Percentual sobre o valor das peças depois do desconto (D018, D021). */
  percentualComissao: DecimalTexto;
  empresas: readonly ChaveEmpresaDemo[];
}

export const VENDEDORES = [
  { nome: "Bruna Balcão", usuario: "balcao", percentualComissao: "2.0000", empresas: ["simples", "real"] },
  { nome: "Carlos Pereira", usuario: null, percentualComissao: "2.5000", empresas: ["simples", "real"] },
] as const satisfies readonly VendedorSeed[];

// ---------------------------------------------------------------- Tabelas de preço

type TabelaInsert = Omit<typeof tabelasPreco.$inferInsert, "id" | "empresaId" | "createdAt" | "updatedAt">;

export interface TabelaPrecoSeed extends TabelaInsert {
  chave: "balcao" | "mecanico_parceiro" | "mercado_livre" | "ecommerce";
  nome: string;
  percentual: DecimalTexto;
  /** Preços fixos por SKU (`tabela_preco_itens`), nunca arredondados (D26 do modelo). */
  precosFixos: readonly { codigo: string; preco: DecimalTexto }[];
}

export const TABELAS_PRECO = [
  {
    chave: "balcao",
    nome: "Balcão",
    base: "preco_base",
    percentual: "0.0000",
    padrao: true,
    aplicarArredondamento: true,
    precosFixos: [],
  },
  {
    chave: "mecanico_parceiro",
    nome: "Mecânico parceiro",
    base: "preco_base",
    percentual: "-10.0000",
    padrao: false,
    aplicarArredondamento: true,
    precosFixos: [],
  },
  {
    chave: "mercado_livre",
    nome: "Mercado Livre",
    base: "preco_base",
    percentual: "18.0000",
    padrao: false,
    aplicarArredondamento: true,
    precosFixos: [
      { codigo: "000201", preco: "259.90" },
      { codigo: "000701", preco: "36.90" },
    ],
  },
  {
    chave: "ecommerce",
    nome: "E-commerce",
    base: "preco_base",
    percentual: "5.0000",
    padrao: false,
    aplicarArredondamento: true,
    precosFixos: [],
  },
] as const satisfies readonly TabelaPrecoSeed[];

export type ChaveTabelaPreco = (typeof TABELAS_PRECO)[number]["chave"];
