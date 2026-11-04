/**
 * Canais de venda de demonstração (seção 8): Mercado Livre e e-commerce, **sem
 * credenciais** e desligados (`ativo = false`), com alguns anúncios vinculados pelo
 * SKU (código interno). Ids externos fictícios.
 *
 * - Mercado Livre: emissor fiscal externo (regra 4.14), anúncios já existentes.
 *   Um anúncio tem SKU sem produto, para a lista de "anúncios sem vínculo".
 * - E-commerce: emissor Focus; o webhook de saída aponta para um domínio de exemplo.
 * - `config` segue o modelo 11.4. Números nele são contadores, não valores monetários.
 */
import type { ChaveTabelaPreco } from "./cadastros";
import type { DecimalTexto } from "./tipos";

export interface AnuncioSeed {
  idExterno: string;
  /** SKU lido do canal; vincula ao produto de mesmo `codigo`, se existir. */
  sku: string;
  titulo: string;
}

export interface CanalSeed {
  tipo: "mercado_livre" | "ecommerce";
  nome: string;
  tabelaPreco: ChaveTabelaPreco;
  estoqueSeguranca: DecimalTexto;
  eventoFaturamento: "pago" | "faturado" | "enviado" | "entregue";
  emissorFiscal: "focus" | "externo";
  config: Record<string, string | number | boolean>;
  anuncios: readonly AnuncioSeed[];
}

export const CANAIS = [
  {
    tipo: "mercado_livre",
    nome: "Mercado Livre (demonstração)",
    tabelaPreco: "mercado_livre",
    estoqueSeguranca: "1",
    eventoFaturamento: "pago",
    emissorFiscal: "externo",
    config: {
      site_id: "MLB",
      sincronizar_estoque: true,
      sincronizar_preco: true,
      janela_agrupamento_segundos: 10,
      max_tentativas: 8,
    },
    anuncios: [
      { idExterno: "MLB9000000001", sku: "000201", titulo: "Kit Relação Vaz CG 160 Titan Fan Start Coroa Pinhão Corrente" },
      { idExterno: "MLB9000000002", sku: "000101", titulo: "Pastilha Freio Dianteira Cobreq CG 160 Bros 160" },
      { idExterno: "MLB9000000003", sku: "000301", titulo: "Vela Ignição NGK CPR8EA-9 CG 160 Bros XRE 300" },
      { idExterno: "MLB9000000004", sku: "000701", titulo: "Óleo Mobil Super Moto 20w50 4T Mineral 1 Litro" },
      { idExterno: "MLB9000000005", sku: "001003", titulo: "Capacete LS2 FF353 Rapid Preto Fosco 58" },
      { idExterno: "MLB9000000006", sku: "999999", titulo: "Antigo anúncio sem cadastro no SUMMER" },
    ],
  },
  {
    tipo: "ecommerce",
    nome: "Loja virtual (demonstração)",
    tabelaPreco: "ecommerce",
    estoqueSeguranca: "0",
    eventoFaturamento: "pago",
    emissorFiscal: "focus",
    config: {
      webhook_url: "https://loja.example.com/api/summer/webhook",
      sincronizar_estoque: true,
      sincronizar_preco: true,
      janela_agrupamento_segundos: 10,
      max_tentativas: 8,
      limite_requisicoes_por_minuto: 120,
    },
    anuncios: [
      { idExterno: "ECOM-000201", sku: "000201", titulo: "Kit relação CG 160 (coroa + pinhão + corrente)" },
      { idExterno: "ECOM-000601", sku: "000601", titulo: "Pneu traseiro 100/80-18 Pirelli Super City" },
      { idExterno: "ECOM-000702", sku: "000702", titulo: "Óleo Motul 5100 15W-50 4T 1 L" },
      { idExterno: "ECOM-001001", sku: "001001", titulo: "Capacete Pro Tork Liberty 4 preto 58" },
      { idExterno: "ECOM-000903", sku: "000903", titulo: "Baú 41 L Pro Tork com base" },
    ],
  },
] as const satisfies readonly CanalSeed[];
