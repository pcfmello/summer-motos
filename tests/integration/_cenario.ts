/**
 * Cenários dos testes de integração: tenants, empresas e documentos mínimos,
 * gravados pelo schema Drizzle (o que também confere que o schema bate com o banco).
 *
 * Cada empresa nasce como na criação real: depósitos "Loja" (padrão, vendável) e
 * "Garantia" (não vendável, D28 do modelo), tabela de preço padrão, "Consumidor
 * final" e dois produtos.
 */
import {
  criarBanco,
  criarPool,
  criarWithTransaction,
  type Banco,
} from "../../src/server/db/conexao";
import {
  clientes,
  depositos,
  empresas,
  membros,
  motosCliente,
  movimentacoesEstoque,
  ordensServico,
  osItens,
  produtos,
  tabelasPreco,
  tenants,
  usuarios,
  vendas,
} from "../../src/server/db/schema";
import { urlBancoTeste } from "./_banco";

export function abrirBanco() {
  const pool = criarPool({ connectionString: urlBancoTeste(), applicationName: "summer-test" });
  const db = criarBanco(pool);
  return { pool, db, withTransaction: criarWithTransaction(db) };
}

let cnpjSequencial = 0;
/** CNPJ só com formato válido (o dígito verificador é do domínio, não do banco). */
function proximoCnpj(): string {
  cnpjSequencial += 1;
  return `${String(cnpjSequencial).padStart(12, "0")}00`;
}

export async function criarTenant(db: Banco, nome = "Tenant") {
  const [tenant] = await db.insert(tenants).values({ nome }).returning();
  return tenant;
}

export async function criarUsuario(db: Banco, email: string) {
  const [usuario] = await db.insert(usuarios).values({ name: email, email }).returning();
  return usuario;
}

export async function criarMembro(
  db: Banco,
  empresaId: string,
  usuarioId: string,
  perfil: "dono" | "balcao" | "estoque" | "mecanico" = "dono",
) {
  const [membro] = await db.insert(membros).values({ empresaId, usuarioId, perfil }).returning();
  return membro;
}

export async function criarEmpresa(db: Banco, tenantId: string, nome: string) {
  const [empresa] = await db
    .insert(empresas)
    .values({ tenantId, razaoSocial: nome, cnpj: proximoCnpj(), regimeTributario: "simples_nacional" })
    .returning();
  const [loja] = await db
    .insert(depositos)
    .values({ empresaId: empresa.id, nome: "Loja", padrao: true, vendavel: true })
    .returning();
  const [garantia] = await db
    .insert(depositos)
    .values({ empresaId: empresa.id, nome: "Garantia", vendavel: false })
    .returning();
  const [tabela] = await db
    .insert(tabelasPreco)
    .values({ empresaId: empresa.id, nome: "Balcão", padrao: true })
    .returning();
  const [cliente] = await db
    .insert(clientes)
    .values({ empresaId: empresa.id, nome: "Consumidor final", consumidorFinalPadrao: true })
    .returning();
  const [produto, produto2] = await db
    .insert(produtos)
    .values([
      { empresaId: empresa.id, codigo: "000001", descricao: `Pastilha de freio ${nome}` },
      { empresaId: empresa.id, codigo: "000002", descricao: `Corrente 428H ${nome}` },
    ])
    .returning();
  return { empresa, loja, garantia, tabela, cliente, produto, produto2 };
}

export type EmpresaTeste = Awaited<ReturnType<typeof criarEmpresa>>;

/** Tenant com duas empresas (A e B) e um usuário dono das duas. */
export async function criarCenario(db: Banco) {
  const tenant = await criarTenant(db, "Moto Peças Teste");
  const a = await criarEmpresa(db, tenant.id, "Empresa A");
  const b = await criarEmpresa(db, tenant.id, "Empresa B");
  const usuario = await criarUsuario(db, `dono-${tenant.id}@teste.local`);
  await criarMembro(db, a.empresa.id, usuario.id);
  await criarMembro(db, b.empresa.id, usuario.id);
  return { tenant, a, b, usuario };
}

let numeroDocumento = 0;

export async function criarVenda(
  db: Banco,
  e: EmpresaTeste,
  usuarioId: string,
  extra: Partial<typeof vendas.$inferInsert> = {},
) {
  numeroDocumento += 1;
  const [venda] = await db
    .insert(vendas)
    .values({
      empresaId: e.empresa.id,
      numero: numeroDocumento,
      clienteId: e.cliente.id,
      depositoId: e.loja.id,
      tabelaPrecoId: e.tabela.id,
      valorProdutos: "10.00",
      valorTotal: "10.00",
      usuarioId,
      ...extra,
    })
    .returning();
  return venda;
}

export async function criarOs(
  db: Banco,
  e: EmpresaTeste,
  usuarioId: string,
  extra: Partial<typeof ordensServico.$inferInsert> = {},
) {
  numeroDocumento += 1;
  const [moto] = await db
    .insert(motosCliente)
    .values({ empresaId: e.empresa.id, clienteId: e.cliente.id, descricao: "CG 160" })
    .returning();
  const [os] = await db
    .insert(ordensServico)
    .values({
      empresaId: e.empresa.id,
      numero: numeroDocumento,
      clienteId: e.cliente.id,
      motoClienteId: moto.id,
      defeitoRelatado: "barulho no freio",
      depositoId: e.loja.id,
      tabelaPrecoId: e.tabela.id,
      usuarioId,
      ...extra,
    })
    .returning();
  return os;
}

/** Item de peça da OS: 1 × R$ 10,00. */
export async function criarItemPecaOs(db: Banco, e: EmpresaTeste, osId: string, produtoId: string) {
  const [item] = await db
    .insert(osItens)
    .values({
      empresaId: e.empresa.id,
      ordemServicoId: osId,
      ordem: 1,
      tipo: "produto",
      descricao: "Pastilha de freio",
      quantidade: "1.0000",
      precoUnitario: "10.00",
      valorBruto: "10.00",
      valorTotal: "10.00",
      produtoId,
    })
    .returning();
  return item;
}

/** Item de serviço da OS: mão de obra de R$ 50,00 com comissão de R$ 20,00. */
export async function criarItemServicoOs(db: Banco, e: EmpresaTeste, osId: string) {
  const [item] = await db
    .insert(osItens)
    .values({
      empresaId: e.empresa.id,
      ordemServicoId: osId,
      ordem: 2,
      tipo: "servico",
      descricao: "Regulagem de freio",
      quantidade: "1.0000",
      precoUnitario: "50.00",
      valorBruto: "50.00",
      valorTotal: "50.00",
      comissaoValor: "20.00",
    })
    .returning();
  return item;
}

export async function criarMovimento(
  db: Banco,
  e: EmpresaTeste,
  extra: Partial<typeof movimentacoesEstoque.$inferInsert> = {},
) {
  const [mov] = await db
    .insert(movimentacoesEstoque)
    .values({
      empresaId: e.empresa.id,
      produtoId: e.produto.id,
      depositoId: e.loja.id,
      tipo: "saldo_inicial",
      quantidade: "5.0000",
      custoUnitario: "12.500000",
      saldoApos: "5.0000",
      ...extra,
    })
    .returning();
  return mov;
}
