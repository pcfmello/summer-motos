/**
 * Execução do seed de demonstração (seção 8, D030, D031): grava os dados de
 * `./dados` pelos caminhos oficiais e é **idempotente**.
 *
 * Como cada parte é localizada (chaves naturais), para rodar de novo sem duplicar:
 * - motos globais por nome (sem caixa); usuários por e-mail; tenant pelo nome;
 *   empresas pelo CNPJ;
 * - cadastros por chave única da empresa: categoria, marca, perfil, tabela de
 *   preço e vendedor pelo nome; produto, serviço e código de barras pelo código;
 *   cliente pelo CPF/CNPJ; moto pela placa; canal por tipo e nome; anúncio pelo id
 *   externo; mecânico pelo nome; aplicação por modelo e anos;
 * - a tabela "Balcão" que `criarEmpresa` já cria é reaproveitada pelo nome;
 * - o saldo inicial só é lançado para produtos **sem nenhum movimento** na empresa,
 *   por `servicos/estoque.lancarSaldoInicial` (nunca insert direto no saldo).
 *
 * Um cadastro que já existe não é alterado (o que a pessoa mudou na demonstração
 * fica). Configuração, módulos e endereço da empresa são gravados só quando ela
 * nasce.
 *
 * Transações: uma para o que é global (motos, usuários e tenant) e uma por
 * empresa. Falhou no meio de uma empresa, nada dela fica; rodar de novo completa.
 *
 * Recebe banco e senhas de quem chama (`./index.ts` ou o teste); não lê o ambiente.
 */
import { and, eq, inArray, sql } from "drizzle-orm";

import { definirPin } from "../../src/server/auth/pin";
import { criarAdminPlataforma, criarUsuarioComSenha } from "../../src/server/auth/usuarios";
import type { Banco, Transacao, WithTransaction } from "../../src/server/db/conexao";
import {
  canaisVenda,
  canalAnuncios,
  categorias,
  clientes,
  empresas,
  estoqueSaldos,
  marcas,
  marcasMoto,
  mecanicos,
  membros,
  modelosMoto,
  motosCliente,
  movimentacoesEstoque,
  perfisTributarios,
  produtoAplicacoes,
  produtoCodigosBarras,
  produtos,
  servicos,
  tabelaPrecoItens,
  tabelasPreco,
  tenants,
  usuarios,
  vendedores,
} from "../../src/server/db/schema";
import { adicionarMembro, criarEmpresa, criarTenant } from "../../src/server/servicos/empresas";
import { lancarSaldoInicial } from "../../src/server/servicos/estoque";
import type { ConfiguracaoSeed } from "./ambiente";
import {
  ADMIN_PLATAFORMA_DEMO,
  CANAIS,
  CATEGORIAS,
  CLIENTES,
  EMPRESAS_DEMO,
  MARCAS_MOTO,
  MARCAS_PECA,
  MECANICOS,
  MODELOS_MOTO,
  PERFIS_TRIBUTARIOS,
  PRODUTOS,
  SERVICOS,
  TABELAS_PRECO,
  TENANT_DEMO,
  USUARIOS_DEMO,
  VENDEDORES,
  type ChaveEmpresaDemo,
  type EmpresaDemoSeed,
  type PerfilDemo,
} from "./dados";

export const MOTIVO_SALDO_SEED = "Seed de demonstração";

export type ResumoEmpresa = {
  chave: ChaveEmpresaDemo;
  nome: string;
  cnpj: string;
  criada: boolean;
  /** Produtos que receberam saldo inicial nesta execução. */
  saldosLancados: number;
  contagens: Record<string, number>;
};

export type ResumoSeed = {
  tenant: { nome: string; criado: boolean };
  usuariosCriados: number;
  empresas: ResumoEmpresa[];
  logins: { email: string; perfis: string }[];
};

type Deps = { withTransaction: WithTransaction };
type Log = (mensagem: string) => void;

const chaveNome = (nome: string) => nome.trim().toLowerCase();

// ---------------------------------------------------------------- Global

async function garantirMotos(tx: Transacao): Promise<Map<string, string>> {
  await tx
    .insert(marcasMoto)
    .values(MARCAS_MOTO.map((nome) => ({ nome })))
    .onConflictDoNothing();
  const marcas = await tx.select({ id: marcasMoto.id, nome: marcasMoto.nome }).from(marcasMoto);
  const marcaPorNome = new Map(marcas.map((m) => [chaveNome(m.nome), m.id]));

  await tx
    .insert(modelosMoto)
    .values(
      MODELOS_MOTO.map((m) => ({
        marcaMotoId: marcaPorNome.get(chaveNome(m.marca)) as string,
        nome: m.nome,
        cilindrada: m.cilindrada,
      })),
    )
    .onConflictDoNothing();
  const modelos = await tx
    .select({ id: modelosMoto.id, nome: modelosMoto.nome, marcaMotoId: modelosMoto.marcaMotoId })
    .from(modelosMoto);
  const modeloPorMarcaNome = new Map(modelos.map((m) => [`${m.marcaMotoId}|${chaveNome(m.nome)}`, m.id]));

  // chave do dado (ex.: "honda-cg-160-titan") → id
  return new Map(
    MODELOS_MOTO.map((m) => {
      const id = modeloPorMarcaNome.get(`${marcaPorNome.get(chaveNome(m.marca))}|${chaveNome(m.nome)}`);
      if (!id) throw new Error(`Modelo de moto não gravado: ${m.marca} ${m.nome}`);
      return [m.chave, id];
    }),
  );
}

async function garantirUsuarios(
  tx: Transacao,
  config: ConfiguracaoSeed,
): Promise<{ porChave: Map<string, string>; criados: number }> {
  const porChave = new Map<string, string>();
  let criados = 0;
  const pedidos = [
    ...USUARIOS_DEMO.map((u) => ({ chave: u.chave as string, nome: u.nome, email: u.email, variavel: u.variavelSenha, admin: false })),
    {
      chave: "admin",
      nome: ADMIN_PLATAFORMA_DEMO.nome,
      email: ADMIN_PLATAFORMA_DEMO.email,
      variavel: ADMIN_PLATAFORMA_DEMO.variavelSenha,
      admin: true,
    },
  ];
  for (const u of pedidos) {
    const [existente] = await tx
      .select({ id: usuarios.id, admin: usuarios.adminPlataforma })
      .from(usuarios)
      .where(eq(usuarios.email, u.email));
    if (existente) {
      if (existente.admin !== u.admin) {
        throw new Error(`O e-mail ${u.email} já existe com outro tipo de acesso (admin da plataforma ou não).`);
      }
      porChave.set(u.chave, existente.id);
      continue;
    }
    const dados = { nome: u.nome, email: u.email, senha: config.senhas[u.variavel as keyof ConfiguracaoSeed["senhas"]] };
    const novo = u.admin ? await criarAdminPlataforma(tx, dados) : await criarUsuarioComSenha(tx, dados);
    porChave.set(u.chave, novo.id);
    criados += 1;
  }
  return { porChave, criados };
}

async function garantirTenant(tx: Transacao): Promise<{ id: string; criado: boolean }> {
  const [existente] = await tx.select({ id: tenants.id }).from(tenants).where(eq(tenants.nome, TENANT_DEMO.nome));
  if (existente) return { id: existente.id, criado: false };
  const tenant = await criarTenant(tx, { nome: TENANT_DEMO.nome });
  return { id: tenant.id, criado: true };
}

// ---------------------------------------------------------------- Empresa

async function garantirEmpresa(
  tx: Transacao,
  tenantId: string,
  dados: EmpresaDemoSeed,
): Promise<{ id: string; criada: boolean }> {
  const [existente] = await tx
    .select({ id: empresas.id, tenantId: empresas.tenantId })
    .from(empresas)
    .where(eq(empresas.cnpj, dados.cnpj));
  if (existente) {
    if (existente.tenantId !== tenantId) {
      throw new Error(`O CNPJ ${dados.cnpj} já pertence a outro tenant; o seed não mexe nele.`);
    }
    return { id: existente.id, criada: false };
  }

  const { empresa } = await criarEmpresa(tx, {
    tenantId,
    razaoSocial: dados.razaoSocial,
    nomeFantasia: dados.nomeFantasia,
    cnpj: dados.cnpj,
    regimeTributario: dados.regimeTributario,
    uf: dados.endereco.uf,
    codigoIbgeMunicipio: dados.endereco.codigoIbgeMunicipio,
    // demonstração: todos os módulos ligados (seção 8)
    modulos: dados.modulos,
    usuario: null,
  });
  // endereço e config da demonstração; a config é mesclada sobre o padrão do banco (modelo 11.1)
  await tx
    .update(empresas)
    .set({
      ie: dados.ie,
      cep: dados.endereco.cep,
      logradouro: dados.endereco.logradouro,
      numero: dados.endereco.numero,
      bairro: dados.endereco.bairro,
      municipio: dados.endereco.municipio,
      telefone: dados.telefone,
      config: sql`${empresas.config} || ${JSON.stringify(dados.config)}::jsonb`,
    })
    .where(eq(empresas.id, empresa.id));
  return { id: empresa.id, criada: true };
}

async function garantirMembros(
  tx: Transacao,
  empresaId: string,
  chave: ChaveEmpresaDemo,
  usuarioPorChave: Map<string, string>,
  pinDono: string,
): Promise<void> {
  for (const u of USUARIOS_DEMO) {
    const perfil = (u.perfis as Partial<Record<ChaveEmpresaDemo, PerfilDemo>>)[chave];
    if (!perfil) continue;
    const usuarioId = usuarioPorChave.get(u.chave) as string;
    const [membro] = await tx
      .select({ id: membros.id, pinHash: membros.pinHash })
      .from(membros)
      .where(and(eq(membros.empresaId, empresaId), eq(membros.usuarioId, usuarioId)));
    if (!membro) await adicionarMembro(tx, { empresaId, usuarioId, perfil, usuario: null });

    if (perfil === "dono" && !membro?.pinHash) {
      const r = await definirPin(tx, { empresaId, usuario: { id: usuarioId }, perfil: "dono" }, pinDono);
      if (!r.ok) throw new Error(`Não foi possível definir o PIN do dono (${r.motivo}).`);
    }
  }
}

/** Mapa nome (minúsculo) → id de um cadastro da empresa. */
async function mapaPorNome(
  tx: Transacao,
  tabela: typeof categorias | typeof marcas | typeof perfisTributarios | typeof tabelasPreco | typeof vendedores,
  empresaId: string,
): Promise<Map<string, string>> {
  const linhas = await tx.select({ id: tabela.id, nome: tabela.nome }).from(tabela).where(eq(tabela.empresaId, empresaId));
  return new Map(linhas.map((l) => [chaveNome(l.nome), l.id]));
}

function exigir(mapa: Map<string, string>, chave: string, oQue: string): string {
  const id = mapa.get(chave);
  if (!id) throw new Error(`${oQue} não encontrado(a) depois de gravar: ${chave}`);
  return id;
}

async function popularEmpresa(
  tx: Transacao,
  empresaId: string,
  chave: ChaveEmpresaDemo,
  modeloPorChave: Map<string, string>,
  usuarioPorChave: Map<string, string>,
): Promise<number> {
  // 1. categorias, marcas e perfis tributários
  await tx
    .insert(categorias)
    .values(CATEGORIAS.map((c) => ({ empresaId, nome: c.nome, markupPadrao: c.markupPadrao })))
    .onConflictDoNothing();
  await tx
    .insert(marcas)
    .values(MARCAS_PECA.map((m) => ({ empresaId, nome: m.nome })))
    .onConflictDoNothing();
  const perfisDaEmpresa = PERFIS_TRIBUTARIOS.filter((p) => p.empresa === chave);
  await tx
    .insert(perfisTributarios)
    .values(perfisDaEmpresa.map((p) => ({ ...p.dados, empresaId })))
    .onConflictDoNothing();
  const categoriaPorNome = await mapaPorNome(tx, categorias, empresaId);
  const marcaPorNome = await mapaPorNome(tx, marcas, empresaId);
  const perfilPorNome = await mapaPorNome(tx, perfisTributarios, empresaId);
  const perfilPorGrupo = new Map(
    perfisDaEmpresa.map((p) => [p.grupoFiscal, exigir(perfilPorNome, chaveNome(p.dados.nome), "Perfil tributário")]),
  );

  // 2. produtos, códigos de barras e aplicações
  await tx
    .insert(produtos)
    .values(
      PRODUTOS.map((p) => ({
        empresaId,
        codigo: p.codigo,
        descricao: p.descricao,
        descricaoCurta: p.descricaoCurta,
        descricaoCompleta: p.descricaoCompleta,
        categoriaId: exigir(categoriaPorNome, chaveNome(p.categoria), "Categoria"),
        marcaId: exigir(marcaPorNome, chaveNome(p.marca), "Marca"),
        referenciaFabricante: p.referenciaFabricante,
        codigoOriginal: p.codigoOriginal,
        unidade: p.unidade,
        corredor: p.corredor,
        prateleira: p.prateleira,
        gaveta: p.gaveta,
        estoqueMinimo: p.estoqueMinimo,
        markup: p.markup,
        precoVenda: p.precoVenda,
        pesoG: p.pesoG,
        ncm: p.ncm,
        origem: p.origem,
        // gtin_fiscal vazio = SEM GTIN: o EAN do seed é fictício (D031)
        perfilTributarioId: perfilPorGrupo.get(p.grupoFiscal) ?? null,
      })),
    )
    .onConflictDoNothing();
  const linhasProduto = await tx
    .select({ id: produtos.id, codigo: produtos.codigo })
    .from(produtos)
    .where(and(eq(produtos.empresaId, empresaId), inArray(produtos.codigo, PRODUTOS.map((p) => p.codigo))));
  const produtoPorCodigo = new Map(linhasProduto.map((p) => [p.codigo, p.id]));

  const codigosBarras = PRODUTOS.flatMap((p) =>
    p.codigosBarras.map((c) => ({
      empresaId,
      produtoId: exigir(produtoPorCodigo, p.codigo, "Produto"),
      codigo: c.codigo,
      tipo: c.tipo,
      fator: c.fator,
    })),
  );
  if (codigosBarras.length > 0) await tx.insert(produtoCodigosBarras).values(codigosBarras).onConflictDoNothing();

  const existentes = await tx
    .select({
      produtoId: produtoAplicacoes.produtoId,
      modeloMotoId: produtoAplicacoes.modeloMotoId,
      anoInicial: produtoAplicacoes.anoInicial,
      anoFinal: produtoAplicacoes.anoFinal,
    })
    .from(produtoAplicacoes)
    .where(eq(produtoAplicacoes.empresaId, empresaId));
  const chaveAplicacao = (a: { produtoId: string; modeloMotoId: string; anoInicial: number | null; anoFinal: number | null }) =>
    `${a.produtoId}|${a.modeloMotoId}|${a.anoInicial}|${a.anoFinal}`;
  const jaTem = new Set(existentes.map(chaveAplicacao));
  const novasAplicacoes = PRODUTOS.flatMap((p) =>
    p.aplicacoes.map((a) => ({
      empresaId,
      produtoId: exigir(produtoPorCodigo, p.codigo, "Produto"),
      modeloMotoId: exigir(modeloPorChave, a.modelo, "Modelo de moto"),
      anoInicial: a.anoInicial,
      anoFinal: a.anoFinal,
      observacao: a.observacao,
    })),
  ).filter((a) => !jaTem.has(chaveAplicacao(a)));
  if (novasAplicacoes.length > 0) await tx.insert(produtoAplicacoes).values(novasAplicacoes);

  // 3. tabelas de preço (o "Balcão" padrão já nasce com a empresa) e preços fixos
  await tx
    .insert(tabelasPreco)
    .values(
      TABELAS_PRECO.map((t) => ({
        empresaId,
        nome: t.nome,
        base: t.base,
        percentual: t.percentual,
        padrao: t.padrao,
        aplicarArredondamento: t.aplicarArredondamento,
      })),
    )
    .onConflictDoNothing();
  const tabelaPorNome = await mapaPorNome(tx, tabelasPreco, empresaId);
  const tabelaPorChave = new Map(TABELAS_PRECO.map((t) => [t.chave, exigir(tabelaPorNome, chaveNome(t.nome), "Tabela de preço")]));
  const precosFixos = TABELAS_PRECO.flatMap((t) =>
    t.precosFixos.map((f) => ({
      empresaId,
      tabelaPrecoId: tabelaPorChave.get(t.chave) as string,
      produtoId: exigir(produtoPorCodigo, f.codigo, "Produto"),
      preco: f.preco,
    })),
  );
  if (precosFixos.length > 0) await tx.insert(tabelaPrecoItens).values(precosFixos).onConflictDoNothing();

  // 4. serviços, mecânicos e vendedores
  await tx
    .insert(servicos)
    .values(SERVICOS.map((s) => ({ ...s, empresaId })))
    .onConflictDoNothing();
  const mecanicosExistentes = await tx
    .select({ nome: mecanicos.nome })
    .from(mecanicos)
    .where(eq(mecanicos.empresaId, empresaId));
  const nomesMecanicos = new Set(mecanicosExistentes.map((m) => chaveNome(m.nome)));
  const novosMecanicos = MECANICOS.filter(
    (m) => (m.empresas as readonly string[]).includes(chave) && !nomesMecanicos.has(chaveNome(m.nome)),
  ).map((m) => ({ empresaId, nome: m.nome, usuarioId: m.usuario ? (usuarioPorChave.get(m.usuario) ?? null) : null }));
  if (novosMecanicos.length > 0) await tx.insert(mecanicos).values(novosMecanicos);
  const novosVendedores = VENDEDORES.filter((v) => (v.empresas as readonly string[]).includes(chave)).map((v) => ({
    empresaId,
    nome: v.nome,
    percentualComissao: v.percentualComissao,
    usuarioId: v.usuario ? (usuarioPorChave.get(v.usuario) ?? null) : null,
  }));
  if (novosVendedores.length > 0) await tx.insert(vendedores).values(novosVendedores).onConflictDoNothing();

  // 5. clientes e motos
  await tx
    .insert(clientes)
    .values(
      CLIENTES.map((c) => ({
        empresaId,
        tipoPessoa: c.tipoPessoa,
        nome: c.nome,
        cpfCnpj: c.cpfCnpj,
        whatsapp: c.whatsapp,
        email: c.email,
        ...(c.endereco ?? {}),
        tabelaPrecoId: c.tabelaPreco ? (tabelaPorChave.get(c.tabelaPreco) ?? null) : null,
        observacoes: c.observacoes,
      })),
    )
    .onConflictDoNothing();
  const linhasCliente = await tx
    .select({ id: clientes.id, cpfCnpj: clientes.cpfCnpj })
    .from(clientes)
    .where(and(eq(clientes.empresaId, empresaId), inArray(clientes.cpfCnpj, CLIENTES.map((c) => c.cpfCnpj))));
  const clientePorDocumento = new Map(linhasCliente.map((c) => [c.cpfCnpj as string, c.id]));
  await tx
    .insert(motosCliente)
    .values(
      CLIENTES.flatMap((c) =>
        c.motos.map((m) => ({
          empresaId,
          clienteId: exigir(clientePorDocumento, c.cpfCnpj, "Cliente"),
          modeloMotoId: m.modelo ? exigir(modeloPorChave, m.modelo, "Modelo de moto") : null,
          descricao: m.descricao,
          ano: m.ano,
          placa: m.placa,
          cor: m.cor,
          kmAtual: m.kmAtual,
        })),
      ),
    )
    .onConflictDoNothing();

  // 6. canais (desligados, sem credenciais) e anúncios vinculados pelo SKU
  await tx
    .insert(canaisVenda)
    .values(
      CANAIS.map((c) => ({
        empresaId,
        tipo: c.tipo,
        nome: c.nome,
        ativo: false,
        tabelaPrecoId: tabelaPorChave.get(c.tabelaPreco) as string,
        estoqueSeguranca: c.estoqueSeguranca,
        eventoFaturamento: c.eventoFaturamento,
        emissorFiscal: c.emissorFiscal,
        config: c.config,
      })),
    )
    .onConflictDoNothing();
  const linhasCanal = await tx
    .select({ id: canaisVenda.id, tipo: canaisVenda.tipo, nome: canaisVenda.nome })
    .from(canaisVenda)
    .where(eq(canaisVenda.empresaId, empresaId));
  const canalPorTipoNome = new Map(linhasCanal.map((c) => [`${c.tipo}|${c.nome}`, c.id]));
  await tx
    .insert(canalAnuncios)
    .values(
      CANAIS.flatMap((c) =>
        c.anuncios.map((a) => ({
          empresaId,
          canalId: exigir(canalPorTipoNome, `${c.tipo}|${c.nome}`, "Canal"),
          produtoId: produtoPorCodigo.get(a.sku) ?? null,
          idExterno: a.idExterno,
          sku: a.sku,
          titulo: a.titulo,
        })),
      ),
    )
    .onConflictDoNothing();

  // 7. saldo inicial pelo caminho oficial, só para produtos sem nenhum movimento
  const comMovimento = await tx
    .selectDistinct({ produtoId: movimentacoesEstoque.produtoId })
    .from(movimentacoesEstoque)
    .where(eq(movimentacoesEstoque.empresaId, empresaId));
  const movimentados = new Set(comMovimento.map((m) => m.produtoId));
  const itens = PRODUTOS.flatMap((p) => {
    const saldo = p.saldos[chave];
    const produtoId = produtoPorCodigo.get(p.codigo) as string;
    if (!saldo || movimentados.has(produtoId)) return [];
    return [{ produtoId, quantidade: saldo.quantidade, custoUnitario: saldo.custoUnitario }];
  });
  const lancados = await lancarSaldoInicial(tx, { empresaId, usuario: null }, itens, { motivo: MOTIVO_SALDO_SEED });

  // 8. o contador de código continua depois do maior código numérico (regra 4.7)
  await tx.execute(sql`
    update sequencias
       set ultimo_valor = greatest(ultimo_valor, coalesce((
             select max(codigo::bigint) from produtos
              where empresa_id = ${empresaId} and codigo ~ '^[0-9]{1,18}$'), 0))
     where empresa_id = ${empresaId} and chave = 'produto'
  `);

  return lancados.length;
}

/** Contagens da empresa para o resumo (e para o teste de idempotência). */
export async function contarEmpresa(db: Banco | Transacao, empresaId: string): Promise<Record<string, number>> {
  const conta = async (tabela: string, filtro = sql``) => {
    const r = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from ${sql.identifier(tabela)} where empresa_id = ${empresaId} ${filtro}`,
    );
    return r.rows[0]?.n ?? 0;
  };
  const abaixo = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(estoqueSaldos)
    .innerJoin(produtos, and(eq(produtos.id, estoqueSaldos.produtoId), eq(produtos.empresaId, estoqueSaldos.empresaId)))
    .where(and(eq(estoqueSaldos.empresaId, empresaId), sql`${estoqueSaldos.quantidade} < ${produtos.estoqueMinimo}`));
  return {
    membros: await conta("membros"),
    categorias: await conta("categorias"),
    marcas: await conta("marcas"),
    perfis_tributarios: await conta("perfis_tributarios"),
    produtos: await conta("produtos"),
    codigos_barras: await conta("produto_codigos_barras"),
    aplicacoes: await conta("produto_aplicacoes"),
    tabelas_preco: await conta("tabelas_preco"),
    servicos: await conta("servicos"),
    mecanicos: await conta("mecanicos"),
    vendedores: await conta("vendedores"),
    clientes: await conta("clientes"),
    motos: await conta("motos_cliente"),
    canais: await conta("canais_venda"),
    anuncios: await conta("canal_anuncios"),
    saldos: await conta("estoque_saldos"),
    movimentos: await conta("movimentacoes_estoque"),
    abaixo_do_minimo: abaixo[0]?.n ?? 0,
  };
}

// ---------------------------------------------------------------- Execução

export async function executarSeed(deps: Deps, config: ConfiguracaoSeed, log: Log = () => {}): Promise<ResumoSeed> {
  const { withTransaction } = deps;

  const global = await withTransaction(async (tx) => {
    const modeloPorChave = await garantirMotos(tx);
    const usuariosSeed = await garantirUsuarios(tx, config);
    const tenant = await garantirTenant(tx);
    return { modeloPorChave, usuariosSeed, tenant };
  });
  log(`tenant "${TENANT_DEMO.nome}": ${global.tenant.criado ? "criado" : "já existia"}`);
  log(`motos: ${MODELOS_MOTO.length} modelos; usuários novos: ${global.usuariosSeed.criados}`);

  const resumos: ResumoEmpresa[] = [];
  for (const dados of EMPRESAS_DEMO) {
    const r = await withTransaction(
      async (tx) => {
        const empresa = await garantirEmpresa(tx, global.tenant.id, dados);
        await garantirMembros(tx, empresa.id, dados.chave, global.usuariosSeed.porChave, config.pinDono);
        const saldosLancados = await popularEmpresa(
          tx,
          empresa.id,
          dados.chave,
          global.modeloPorChave,
          global.usuariosSeed.porChave,
        );
        return { empresa, saldosLancados, contagens: await contarEmpresa(tx, empresa.id) };
      },
      { esperaLockMs: 30_000 },
    );
    resumos.push({
      chave: dados.chave,
      nome: dados.nomeFantasia,
      cnpj: dados.cnpj,
      criada: r.empresa.criada,
      saldosLancados: r.saldosLancados,
      contagens: r.contagens,
    });
    log(`empresa ${dados.nomeFantasia}: ${r.empresa.criada ? "criada" : "já existia"}; saldos lançados agora: ${r.saldosLancados}`);
  }

  const logins = [
    { email: ADMIN_PLATAFORMA_DEMO.email, perfis: "admin da plataforma (só /admin)" },
    ...USUARIOS_DEMO.map((u) => ({
      email: u.email,
      perfis: EMPRESAS_DEMO.filter((e) => (u.perfis as Partial<Record<string, string>>)[e.chave])
        .map((e) => `${(u.perfis as Partial<Record<string, string>>)[e.chave]} em ${e.nomeFantasia}`)
        .join("; "),
    })),
  ];
  return {
    tenant: { nome: TENANT_DEMO.nome, criado: global.tenant.criado },
    usuariosCriados: global.usuariosSeed.criados,
    empresas: resumos,
    logins,
  };
}

/** Produtos da empresa cujo saldo não bate com a soma dos movimentos `saldo_inicial` (deve ser vazio). */
export async function saldosDivergentes(db: Banco, empresaId: string): Promise<string[]> {
  const r = await db.execute<{ produto_id: string }>(sql`
    select s.produto_id
      from estoque_saldos s
      left join (
        select produto_id, deposito_id, sum(quantidade) as soma
          from movimentacoes_estoque
         where empresa_id = ${empresaId} and tipo = 'saldo_inicial'
         group by produto_id, deposito_id
      ) m on m.produto_id = s.produto_id and m.deposito_id = s.deposito_id
     where s.empresa_id = ${empresaId} and s.quantidade is distinct from coalesce(m.soma, 0)
  `);
  return r.rows.map((l) => l.produto_id);
}
