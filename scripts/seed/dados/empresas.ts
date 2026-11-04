/**
 * Tenant, empresas e usuários de demonstração (seção 8).
 *
 * - Tenant "Moto Peças Demo" com 2 empresas: uma no Simples Nacional e outra no
 *   Lucro Real. A do Simples tem CNPJ alfanumérico (válido desde julho de 2026),
 *   para a demonstração exercitar os dois formatos.
 * - CNPJ, IE e endereços são fictícios; os dígitos verificadores do CNPJ saem do domínio.
 * - As senhas não ficam aqui: vêm das variáveis `SEED_SENHA_*` (`.env.example`).
 */
import type { ConfigArredondamento } from "../../../src/server/domain/preco";
import { cnpj } from "./_gerar";
import type { ChaveEmpresaDemo, PerfilDemo } from "./tipos";

export const TENANT_DEMO = { nome: "Moto Peças Demo" } as const;

/** Arredondamento do preço nas duas empresas: termina em ,90 para cima (modelo 11.1). */
export const ARREDONDAMENTO_PRECO_DEMO = {
  modo: "terminacao",
  centavos: "0.90",
  direcao: "cima",
} as const satisfies ConfigArredondamento;

export interface EmpresaDemoSeed {
  chave: ChaveEmpresaDemo;
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  ie: string;
  regimeTributario: "simples_nacional" | "lucro_real";
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    codigoIbgeMunicipio: string;
    uf: string;
  };
  telefone: string;
  /** `empresas.config` (modelo 11.1): percentuais em texto, como no JSON. */
  config: {
    permite_estoque_negativo: boolean;
    arredondamento_preco: typeof ARREDONDAMENTO_PRECO_DEMO;
    limite_desconto_percentual: Record<PerfilDemo, string>;
    validade_orcamento_dias: number;
  };
  /** `empresas.modulos` (modelo 11.2): o seed liga todos. */
  modulos: Record<"balcao" | "os" | "fiscal" | "mercado_livre" | "ecommerce" | "estoque", boolean>;
}

const CONFIG_DEMO: EmpresaDemoSeed["config"] = {
  permite_estoque_negativo: false,
  arredondamento_preco: ARREDONDAMENTO_PRECO_DEMO,
  limite_desconto_percentual: { dono: "100.0000", balcao: "5.0000", estoque: "0.0000", mecanico: "0.0000" },
  validade_orcamento_dias: 7,
};

const MODULOS_DEMO: EmpresaDemoSeed["modulos"] = {
  balcao: true,
  os: true,
  fiscal: true,
  mercado_livre: true,
  ecommerce: true,
  estoque: true,
};

export const EMPRESAS_DEMO = [
  {
    chave: "simples",
    razaoSocial: "Moto Peças Demo Centro Ltda",
    nomeFantasia: "Moto Peças Demo Centro",
    cnpj: cnpj("D3M0SUMM0001"),
    ie: "110042490114",
    regimeTributario: "simples_nacional",
    endereco: {
      cep: "01310100",
      logradouro: "Avenida Exemplo",
      numero: "1000",
      bairro: "Centro",
      municipio: "São Paulo",
      codigoIbgeMunicipio: "3550308",
      uf: "SP",
    },
    telefone: "1130000001",
    config: CONFIG_DEMO,
    modulos: MODULOS_DEMO,
  },
  {
    chave: "real",
    razaoSocial: "Moto Peças Demo Distribuidora Ltda",
    nomeFantasia: "Moto Peças Demo Distribuidora",
    cnpj: cnpj("123456780001"),
    ie: "110042490125",
    regimeTributario: "lucro_real",
    endereco: {
      cep: "09010000",
      logradouro: "Rua Demonstração",
      numero: "250",
      bairro: "Centro",
      municipio: "Santo André",
      codigoIbgeMunicipio: "3547809",
      uf: "SP",
    },
    telefone: "1130000002",
    config: CONFIG_DEMO,
    modulos: MODULOS_DEMO,
  },
] as const satisfies readonly EmpresaDemoSeed[];

/** Admin da plataforma (flag `admin_plataforma`): só acessa `/admin`, não é membro de empresa. */
export const ADMIN_PLATAFORMA_DEMO = {
  nome: "Admin da Plataforma",
  email: "admin@demo.summer.local",
  variavelSenha: "SEED_SENHA_ADMIN",
} as const;

export interface UsuarioDemoSeed {
  chave: string;
  nome: string;
  email: string;
  /** Nome da variável de ambiente com a senha (nunca a senha). */
  variavelSenha: string;
  /** Perfil em cada empresa; empresa ausente = não é membro dela. */
  perfis: Partial<Record<ChaveEmpresaDemo, PerfilDemo>>;
}

/** Um dono nas duas empresas, mais balcão, estoque e mecânico (seção 8). */
export const USUARIOS_DEMO = [
  {
    chave: "dono",
    nome: "Diretor Demo",
    email: "dono@demo.summer.local",
    variavelSenha: "SEED_SENHA_DONO",
    perfis: { simples: "dono", real: "dono" },
  },
  {
    chave: "balcao",
    nome: "Bruna Balcão",
    email: "balcao@demo.summer.local",
    variavelSenha: "SEED_SENHA_BALCAO",
    perfis: { simples: "balcao", real: "balcao" },
  },
  {
    chave: "estoque",
    nome: "Edson Estoque",
    email: "estoque@demo.summer.local",
    variavelSenha: "SEED_SENHA_ESTOQUE",
    perfis: { simples: "estoque", real: "estoque" },
  },
  {
    chave: "mecanico",
    nome: "Marcos Mecânico",
    email: "mecanico@demo.summer.local",
    variavelSenha: "SEED_SENHA_MECANICO",
    perfis: { simples: "mecanico" },
  },
] as const satisfies readonly UsuarioDemoSeed[];

export type ChaveUsuarioDemo = (typeof USUARIOS_DEMO)[number]["chave"];
