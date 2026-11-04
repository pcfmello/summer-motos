/**
 * Dados do seed de demonstração (seção 8 da especificação). O script do seed
 * (`scripts/seed.ts`, a escrever) lê daqui e grava pelo caminho oficial de cada
 * cadastro; o estoque inicial entra por `servicos/estoque.lancarSaldoInicial` (D030).
 */
export * from "./cadastros";
export * from "./canais";
export * from "./catalogo";
export * from "./clientes";
export * from "./empresas";
export * from "./motos";
export * from "./tipos";
export * from "./tributacao";
export { cnpj, cpf, eanFabricante, gtin14Embalagem } from "./_gerar";
