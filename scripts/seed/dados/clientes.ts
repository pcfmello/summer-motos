/**
 * Clientes de demonstração com motos (seção 8): 15 clientes (13 PF e 2 PJ), com
 * nomes, CPFs, CNPJs, telefones e e-mails fictícios. Os dígitos verificadores
 * saem do domínio; as placas misturam o padrão antigo e o Mercosul.
 *
 * O "Consumidor final" não está aqui: ele nasce com a empresa.
 * Os mesmos clientes vão para as duas empresas (cada uma tem o próprio cadastro).
 */
import { cnpj, cpf } from "./_gerar";
import type { ChaveTabelaPreco } from "./cadastros";
import type { ChaveModeloMoto } from "./motos";

export interface MotoClienteSeed {
  modelo: ChaveModeloMoto | null;
  /** Texto livre quando o modelo não está no cadastro. */
  descricao: string | null;
  ano: number;
  /** Maiúsculas, sem hífen (ABC1234 ou ABC1D23). */
  placa: string;
  cor: string;
  kmAtual: number;
}

export interface ClienteSeed {
  tipoPessoa: "pf" | "pj";
  nome: string;
  cpfCnpj: string;
  whatsapp: string;
  email: string | null;
  endereco: {
    cep: string;
    logradouro: string;
    numero: string;
    bairro: string;
    municipio: string;
    codigoIbgeMunicipio: string;
    uf: string;
  } | null;
  tabelaPreco: ChaveTabelaPreco | null;
  observacoes: string | null;
  motos: readonly MotoClienteSeed[];
}

const SAO_PAULO = { municipio: "São Paulo", codigoIbgeMunicipio: "3550308", uf: "SP" } as const;
const SANTO_ANDRE = { municipio: "Santo André", codigoIbgeMunicipio: "3547809", uf: "SP" } as const;

function moto(
  modelo: ChaveModeloMoto,
  ano: number,
  placa: string,
  cor: string,
  kmAtual: number,
): MotoClienteSeed {
  return { modelo, descricao: null, ano, placa, cor, kmAtual };
}

export const CLIENTES: readonly ClienteSeed[] = [
  {
    tipoPessoa: "pf",
    nome: "Ana Paula Ferreira",
    cpfCnpj: cpf("318405627"),
    whatsapp: "11987650001",
    email: "ana.ferreira@example.com",
    endereco: { cep: "01310100", logradouro: "Rua das Flores", numero: "120", bairro: "Bela Vista", ...SAO_PAULO },
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-biz-125", 2019, "FRT4B21", "Vermelha", 18_400)],
  },
  {
    tipoPessoa: "pf",
    nome: "Bruno Henrique Santos",
    cpfCnpj: cpf("427561938"),
    whatsapp: "11987650002",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: "Motoboy; troca óleo a cada 1.000 km.",
    motos: [
      moto("honda-cg-160-fan", 2021, "GHJ2C45", "Preta", 64_200),
      moto("honda-cg-150-titan", 2013, "EKP7731", "Prata", 121_500),
    ],
  },
  {
    tipoPessoa: "pf",
    nome: "Camila Rodrigues Lima",
    cpfCnpj: cpf("536182049"),
    whatsapp: "11987650003",
    email: "camila.lima@example.com",
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-pcx-160", 2024, "SPA3E19", "Branca", 7_900)],
  },
  {
    tipoPessoa: "pf",
    nome: "Diego Martins Souza",
    cpfCnpj: cpf("645293150"),
    whatsapp: "11987650004",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("yamaha-fazer-250", 2020, "FZB8D62", "Azul", 32_100)],
  },
  {
    tipoPessoa: "pf",
    nome: "Eduarda Costa Almeida",
    cpfCnpj: cpf("754304261"),
    whatsapp: "11987650005",
    email: "eduarda.almeida@example.com",
    endereco: { cep: "09010000", logradouro: "Rua do Comércio", numero: "45", bairro: "Centro", ...SANTO_ANDRE },
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-pop-110i", 2022, "DRE5F70", "Branca", 11_300)],
  },
  {
    tipoPessoa: "pf",
    nome: "Felipe Augusto Ribeiro",
    cpfCnpj: cpf("863415372"),
    whatsapp: "11987650006",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-xre-300", 2018, "HJK1234", "Vermelha", 45_800)],
  },
  {
    tipoPessoa: "pf",
    nome: "Gabriela Nogueira Dias",
    cpfCnpj: cpf("972526483"),
    whatsapp: "11987650007",
    email: "gabi.dias@example.com",
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("yamaha-nmax-160", 2023, "QWE6G88", "Cinza", 9_600)],
  },
  {
    tipoPessoa: "pf",
    nome: "Henrique Oliveira Prado",
    cpfCnpj: cpf("181637594"),
    whatsapp: "11987650008",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-bros-160", 2019, "BRS2H34", "Verde", 38_900)],
  },
  {
    tipoPessoa: "pf",
    nome: "Isabela Carvalho Mendes",
    cpfCnpj: cpf("290748605"),
    whatsapp: "11987650009",
    email: "isabela.mendes@example.com",
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("royal-enfield-meteor-350", 2023, "RYL4J56", "Azul", 6_200)],
  },
  {
    tipoPessoa: "pf",
    nome: "João Pedro Barbosa",
    cpfCnpj: cpf("309859716"),
    whatsapp: "11987650010",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-cg-125-fan", 2011, "CXA9182", "Preta", 98_000)],
  },
  {
    tipoPessoa: "pf",
    nome: "Larissa Teixeira Gomes",
    cpfCnpj: cpf("418960827"),
    whatsapp: "11987650011",
    email: "larissa.gomes@example.com",
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("honda-cb-300f-twister", 2024, "TWS7K21", "Vermelha", 4_100)],
  },
  {
    tipoPessoa: "pf",
    nome: "Marcelo Vieira Rocha",
    cpfCnpj: cpf("527071938"),
    whatsapp: "11987650012",
    email: null,
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [
      moto("yamaha-lander-250", 2021, "LDR3L45", "Azul", 27_300),
      { modelo: null, descricao: "Honda CG 125 Cargo 1998", ano: 1998, placa: "BKC4410", cor: "Branca", kmAtual: 140_200 },
    ],
  },
  {
    tipoPessoa: "pf",
    nome: "Natália Freitas Moura",
    cpfCnpj: cpf("636182049"),
    whatsapp: "11987650013",
    email: "natalia.moura@example.com",
    endereco: null,
    tabelaPreco: null,
    observacoes: null,
    motos: [moto("yamaha-factor-150", 2020, "FCT6M78", "Preta", 22_700)],
  },
  {
    tipoPessoa: "pj",
    nome: "Entregas Rápidas Demo Ltda",
    cpfCnpj: cnpj("456789120001"),
    whatsapp: "11987650014",
    email: "frota@entregas-demo.example.com",
    endereco: { cep: "01001000", logradouro: "Praça Exemplo", numero: "10", bairro: "Sé", ...SAO_PAULO },
    tabelaPreco: null,
    observacoes: "Frota de entregas: 3 CG 160.",
    motos: [
      moto("honda-cg-160-start", 2022, "ENT1N01", "Branca", 52_300),
      moto("honda-cg-160-start", 2022, "ENT1N02", "Branca", 49_800),
      moto("honda-cg-160-start", 2023, "ENT2P03", "Branca", 31_000),
    ],
  },
  {
    tipoPessoa: "pj",
    nome: "Oficina Parceira Demo ME",
    cpfCnpj: cnpj("AB12CD340001"),
    whatsapp: "11987650015",
    email: "contato@oficina-demo.example.com",
    endereco: { cep: "09020000", logradouro: "Avenida Parceira", numero: "800", bairro: "Jardim", ...SANTO_ANDRE },
    tabelaPreco: "mecanico_parceiro",
    observacoes: "Mecânico parceiro: compra com a tabela Mecânico parceiro.",
    motos: [moto("suzuki-yes-125", 2015, "OFC5Q67", "Prata", 76_400)],
  },
];
