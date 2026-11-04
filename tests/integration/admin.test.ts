/**
 * Área `/admin` e nascimento de tenants e empresas (fatia 0.10):
 * - `servicos/empresas.ts` com Postgres real (tudo o que a empresa precisa para
 *   nascer, módulos, auditoria, CNPJ repetido, convite do dono);
 * - actions do `/admin` com o Better Auth real lendo a sessão do banco (só
 *   `headers()`, `server-only` e `revalidatePath` simulados, como em
 *   `autenticacao.test.ts`): recusam quem não é admin, inclusive um dono.
 */
import { and, asc, eq, isNull } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => {
  try {
    process.loadEnvFile(".env"); // local; no CI as variáveis vêm do workflow
  } catch {}
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  return { cookie: "" };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(estado.cookie ? { cookie: estado.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import {
  alterarModuloAcao,
  convidarDonoAcao,
  criarEmpresaAcao,
  criarTenantAcao,
  definirStatusTenantAcao,
  revogarConviteDonoAcao,
} from "../../src/server/actions/admin";
import { getContext } from "../../src/server/auth/contexto";
import { criarAdminPlataforma, criarUsuarioComSenha } from "../../src/server/auth/usuarios";
import { pool as poolApp } from "../../src/server/db";
import {
  auditoria,
  clientes,
  convites,
  depositos,
  empresas,
  membros,
  sequencias,
  tabelasPreco,
  tenants,
  usuarios,
} from "../../src/server/db/schema";
import { calcularDigitosCnpj } from "../../src/server/domain/documentos";
import {
  listarEmpresasDoTenant,
  listarMembrosDaEmpresa,
  listarTenants,
  obterEmpresaDoTenant,
  obterSituacaoDono,
  obterTenant,
  proximaLeva,
  TAMANHO_LEVA_ADMIN,
} from "../../src/server/queries/admin";
import { aceitarConviteNovaConta } from "../../src/server/servicos/convites";
import {
  ErroPlataforma,
  adicionarMembro,
  alterarModulo,
  criarEmpresa,
  criarTenant,
  definirStatusTenant,
} from "../../src/server/servicos/empresas";
import { limparTabelas } from "./_banco";
import { abrirBanco } from "./_cenario";
import { criarSessao } from "./_sessao";

const { pool, db, withTransaction } = abrirBanco();

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

beforeEach(async () => {
  estado.cookie = "";
  await limparTabelas(pool);
});

let base = 0;
/** CNPJ com dígito verificador válido (numérico ou alfanumérico). */
function cnpjValido(prefixo = "1"): string {
  base += 1;
  const corpo = `${prefixo}${String(base).padStart(12 - prefixo.length, "0")}`.toUpperCase();
  return corpo + calcularDigitosCnpj(corpo);
}

const dadosEmpresa = (tenantId: string, extra: Record<string, unknown> = {}) => ({
  tenantId,
  razaoSocial: "Moto Peças Teste Ltda",
  nomeFantasia: "Moto Peças Teste",
  cnpj: cnpjValido(),
  regimeTributario: "simples_nacional" as const,
  uf: "SP",
  codigoIbgeMunicipio: "3550308",
  usuario: null,
  ...extra,
});

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  return promessa.then(
    () => {
      throw new Error("esperava um erro");
    },
    (erro: unknown) => erro,
  );
}

/** Executa e devolve o destino do `redirect()` do Next (ou lança se não redirecionou). */
async function destinoDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    const digest = (erro as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw erro;
  }
  throw new Error("esperava um redirect");
}

/** Token do link `/convite/<token>`. */
function tokenDoLink(link: string): string {
  return new URL(link).pathname.split("/").at(-1)!;
}

async function entrarComoAdmin(email = "admin@plataforma.local") {
  const admin = await criarAdminPlataforma(db, { nome: "Admin", email, senha: "senha-admin-123" });
  estado.cookie = (await criarSessao(db, admin.id)).cookie;
  return admin;
}

// ---------------------------------------------------------------------------
// Serviços
// ---------------------------------------------------------------------------

describe("criarEmpresa", () => {
  it("nasce com Loja (padrão, vendável), Garantia (não vendável), Consumidor final, tabela Balcão e as 7 sequências", async () => {
    const { tenant, criada } = await withTransaction(async (tx) => {
      const tenant = await criarTenant(tx, { nome: "Grupo Teste" });
      const criada = await criarEmpresa(tx, dadosEmpresa(tenant.id));
      return { tenant, criada };
    });
    const empresaId = criada.empresa.id;

    const deps = await db
      .select({ id: depositos.id, nome: depositos.nome, padrao: depositos.padrao, vendavel: depositos.vendavel })
      .from(depositos)
      .where(eq(depositos.empresaId, empresaId))
      .orderBy(asc(depositos.nome));
    expect(deps).toEqual([
      { id: criada.depositoGarantiaId, nome: "Garantia", padrao: false, vendavel: false },
      { id: criada.depositoLojaId, nome: "Loja", padrao: true, vendavel: true },
    ]);

    const cli = await db.select().from(clientes).where(eq(clientes.empresaId, empresaId));
    expect(cli).toHaveLength(1);
    expect(cli[0]).toMatchObject({ id: criada.consumidorFinalId, nome: "Consumidor final", consumidorFinalPadrao: true, tipoPessoa: "pf" });

    const tabelas = await db.select().from(tabelasPreco).where(eq(tabelasPreco.empresaId, empresaId));
    expect(tabelas).toHaveLength(1);
    expect(tabelas[0]).toMatchObject({
      id: criada.tabelaPrecoPadraoId,
      nome: "Balcão",
      base: "preco_base",
      percentual: "0.0000",
      padrao: true,
      ativo: true,
    });

    const seqs = await db
      .select({ chave: sequencias.chave, ultimoValor: sequencias.ultimoValor })
      .from(sequencias)
      .where(eq(sequencias.empresaId, empresaId))
      .orderBy(asc(sequencias.chave));
    expect(seqs).toEqual(
      ["acerto", "devolucao", "ean", "orcamento", "os", "produto", "venda"].map((chave) => ({ chave, ultimoValor: 0 })),
    );

    const [empresa] = await db.select().from(empresas).where(eq(empresas.id, empresaId));
    expect(empresa).toMatchObject({ tenantId: tenant.id, uf: "SP", codigoIbgeMunicipio: "3550308", ativo: true });
    // padrões da seção 11 do modelo
    expect(empresa!.config).toEqual({
      permite_estoque_negativo: false,
      arredondamento_preco: { modo: "nenhum" },
      limite_desconto_percentual: { dono: "100.0000", balcao: "0.0000", estoque: "0.0000", mecanico: "0.0000" },
      validade_orcamento_dias: 7,
    });
    expect(empresa!.configFiscal).toEqual({
      ambiente: "homologacao",
      nfe: { serie: 1 },
      nfce: { serie: 1 },
      series_emissor_externo: [],
    });
  });

  it("módulos nascem todos desligados; ligados só quando pedido explicitamente", async () => {
    const [desligada, comBalcao] = await withTransaction(async (tx) => {
      const tenant = await criarTenant(tx, { nome: "Grupo Módulos" });
      return [
        await criarEmpresa(tx, dadosEmpresa(tenant.id)),
        await criarEmpresa(tx, dadosEmpresa(tenant.id, { modulos: { balcao: true, os: true } })),
      ];
    });
    expect(desligada!.empresa.modulos).toEqual({
      balcao: false,
      os: false,
      fiscal: false,
      mercado_livre: false,
      ecommerce: false,
      estoque: false,
    });
    expect(comBalcao!.empresa.modulos).toMatchObject({ balcao: true, os: true, fiscal: false, estoque: false });
    const [gravada] = await db.select({ modulos: empresas.modulos }).from(empresas).where(eq(empresas.id, comBalcao!.empresa.id));
    expect(gravada!.modulos).toEqual(comBalcao!.empresa.modulos);
  });

  it("grava tenant_criado (só na primeira empresa) e empresa_criada, com o autor", async () => {
    const autor = await criarUsuarioComSenha(db, { nome: "Autor", email: "autor@x.local", senha: "senha-forte-123" });
    const [a, b] = await withTransaction(async (tx) => {
      const tenant = await criarTenant(tx, { nome: "Grupo Auditado" });
      return [
        await criarEmpresa(tx, dadosEmpresa(tenant.id, { usuario: { id: autor.id } })),
        await criarEmpresa(tx, dadosEmpresa(tenant.id, { usuario: { id: autor.id } })),
      ];
    });
    const daA = await db.select().from(auditoria).where(eq(auditoria.empresaId, a!.empresa.id)).orderBy(asc(auditoria.acao));
    expect(daA.map((r) => [r.acao, r.entidade, r.usuarioId])).toEqual([
      ["empresa_criada", "empresas", autor.id],
      ["tenant_criado", "tenants", autor.id],
    ]);
    expect(daA[0]!.depois).toMatchObject({ cnpj: a!.empresa.cnpj, regime_tributario: "simples_nacional", modulos: { balcao: false } });
    const daB = await db.select({ acao: auditoria.acao }).from(auditoria).where(eq(auditoria.empresaId, b!.empresa.id));
    expect(daB).toEqual([{ acao: "empresa_criada" }]);
  });

  it("CNPJ repetido é recusado com mensagem amigável (também entre tenants) e nada fica gravado", async () => {
    const cnpj = cnpjValido("A");
    await withTransaction(async (tx) => {
      const t = await criarTenant(tx, { nome: "Primeiro" });
      await criarEmpresa(tx, dadosEmpresa(t.id, { cnpj }));
    });

    const erro = await erroDe(
      withTransaction(async (tx) => {
        const outro = await criarTenant(tx, { nome: "Segundo" });
        await criarEmpresa(tx, dadosEmpresa(outro.id, { cnpj: cnpj.toLowerCase() }));
      }),
    );
    expect(erro).toBeInstanceOf(ErroPlataforma);
    expect(erro).toMatchObject({ codigo: "cnpj_duplicado", campo: "cnpj" });
    expect((erro as Error).message).toMatch(/Já existe uma empresa com este CNPJ/);
    // a transação inteira foi desfeita: o tenant "Segundo" não ficou
    expect(await db.select({ nome: tenants.nome }).from(tenants)).toEqual([{ nome: "Primeiro" }]);
  });

  it("recusa CNPJ com dígito verificador inválido mesmo chamado direto (script, seed)", async () => {
    const erro = await erroDe(
      withTransaction(async (tx) => {
        const t = await criarTenant(tx, { nome: "Inválido" });
        await criarEmpresa(tx, dadosEmpresa(t.id, { cnpj: "11222333000182" }));
      }),
    );
    expect((erro as Error).name).toBe("ZodError");
  });
});

describe("criarTenant e definirStatusTenant", () => {
  it("recusa nome repetido sem diferenciar acento, caixa e espaços", async () => {
    await withTransaction((tx) => criarTenant(tx, { nome: "Moto Peças São João" }));
    const erro = await erroDe(withTransaction((tx) => criarTenant(tx, { nome: "  moto pecas sao joao " })));
    expect(erro).toMatchObject({ codigo: "tenant_duplicado", campo: "nome" });
  });

  it("suspender e reativar audita em cada empresa; repetir o status não muda nada", async () => {
    const { tenant, a, b } = await withTransaction(async (tx) => {
      const tenant = await criarTenant(tx, { nome: "Grupo Status" });
      return { tenant, a: await criarEmpresa(tx, dadosEmpresa(tenant.id)), b: await criarEmpresa(tx, dadosEmpresa(tenant.id)) };
    });
    expect(await withTransaction((tx) => definirStatusTenant(tx, { tenantId: tenant.id, status: "suspenso", usuario: null }))).toEqual({ alterado: true });
    expect(await withTransaction((tx) => definirStatusTenant(tx, { tenantId: tenant.id, status: "suspenso", usuario: null }))).toEqual({ alterado: false });
    await withTransaction((tx) => definirStatusTenant(tx, { tenantId: tenant.id, status: "ativo", usuario: null }));

    for (const e of [a, b]) {
      const acoes = await db
        .select({ acao: auditoria.acao })
        .from(auditoria)
        .where(and(eq(auditoria.empresaId, e.empresa.id), eq(auditoria.entidade, "tenants")))
        .orderBy(asc(auditoria.createdAt), asc(auditoria.acao));
      expect(acoes.map((x) => x.acao).filter((x) => x !== "tenant_criado")).toEqual(["tenant_suspenso", "tenant_reativado"]);
    }
  });
});

describe("alterarModulo", () => {
  it("liga e desliga com auditoria antes/depois", async () => {
    const criada = await withTransaction(async (tx) => criarEmpresa(tx, dadosEmpresa((await criarTenant(tx, { nome: "Mod" })).id)));
    const depois = await withTransaction((tx) =>
      alterarModulo(tx, { empresaId: criada.empresa.id, modulo: "balcao", ligado: true, usuario: null }),
    );
    expect(depois.balcao).toBe(true);
    const [registro] = await db
      .select()
      .from(auditoria)
      .where(and(eq(auditoria.empresaId, criada.empresa.id), eq(auditoria.acao, "modulos_alterados")));
    expect(registro!.antes).toMatchObject({ balcao: false });
    expect(registro!.depois).toMatchObject({ balcao: true });
  });

  it("fiscal só liga com código IBGE do município", async () => {
    const criada = await withTransaction(async (tx) =>
      criarEmpresa(tx, dadosEmpresa((await criarTenant(tx, { nome: "Sem IBGE" })).id, { uf: null, codigoIbgeMunicipio: null })),
    );
    const erro = await erroDe(
      withTransaction((tx) => alterarModulo(tx, { empresaId: criada.empresa.id, modulo: "fiscal", ligado: true, usuario: null })),
    );
    expect(erro).toMatchObject({ codigo: "fiscal_sem_ibge" });
  });
});

describe("adicionarMembro (usado pelo seed e pelo aceite do convite)", () => {
  async function empresaNova(nome: string) {
    return withTransaction(async (tx) => criarEmpresa(tx, dadosEmpresa((await criarTenant(tx, { nome })).id)));
  }

  it("membro ativo repetido é recusado; desativado é reativado com o PIN zerado", async () => {
    const criada = await empresaNova("Repetido");
    const caio = await criarUsuarioComSenha(db, { nome: "Caio", email: "caio@loja.com", senha: "senha-forte-123" });
    const primeiro = await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: caio.id, perfil: "dono", usuario: null }),
    );
    const erro = await erroDe(
      withTransaction((tx) => adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: caio.id, perfil: "dono", usuario: null })),
    );
    expect(erro).toMatchObject({ codigo: "ja_membro", campo: "email" });

    await db
      .update(membros)
      .set({ ativo: false, pinHash: "hash-antigo", pinFalhas: 3, pinBloqueadoAte: new Date(), pinBloqueios: 2 })
      .where(eq(membros.id, primeiro.membroId));
    const resultado = await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: caio.id, perfil: "dono", usuario: null }),
    );
    expect(resultado).toEqual({ membroId: primeiro.membroId, situacao: "reativado" });
    const [membro] = await db.select().from(membros).where(eq(membros.id, primeiro.membroId));
    expect(membro).toMatchObject({ ativo: true, perfil: "dono", pinHash: null, pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 });
  });

  it("admin da plataforma não vira membro, com mensagem que não revela o tipo da conta", async () => {
    const criada = await empresaNova("Sem Admin");
    const admin = await criarAdminPlataforma(db, { nome: "Admin", email: "adm@plataforma.local", senha: "senha-admin-123" });
    const erro = await erroDe(
      withTransaction((tx) => adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: admin.id, perfil: "dono", usuario: null })),
    );
    expect(erro).toMatchObject({ codigo: "admin_nao_pode_ser_membro" });
    expect((erro as Error).message).not.toMatch(/admin/i);
    expect(await db.select().from(membros)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Actions e queries do /admin
// ---------------------------------------------------------------------------

const EMPRESA_FORM = {
  razaoSocial: "Loja do Admin Ltda",
  nomeFantasia: "Loja do Admin",
  cnpj: "11.222.333/0001-81",
  regimeTributario: "lucro_real",
  uf: "sp",
  codigoIbgeMunicipio: "3550308",
};

describe("actions do /admin: só o admin da plataforma", () => {
  async function tenantComDono() {
    const criada = await withTransaction(async (tx) =>
      criarEmpresa(tx, dadosEmpresa((await criarTenant(tx, { nome: "Loja Real" })).id)),
    );
    const dono = await criarUsuarioComSenha(db, { nome: "Dono", email: "dono@loja.com", senha: "senha-dono-123" });
    await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: dono.id, perfil: "dono", usuario: null }),
    );
    return { criada, dono };
  }

  it("um dono (sem a flag) é mandado para o início e nada muda; sem sessão, para o login", async () => {
    const { criada, dono } = await tenantComDono();
    estado.cookie = (await criarSessao(db, dono.id)).cookie;
    const tenantId = criada.empresa.tenantId;
    const empresaId = criada.empresa.id;

    const chamadas = [
      () => criarTenantAcao({ nome: "Tenant do Intruso" }),
      () => definirStatusTenantAcao(tenantId, "suspenso"),
      () => criarEmpresaAcao(tenantId, EMPRESA_FORM),
      () => alterarModuloAcao(empresaId, { modulo: "balcao", ligado: true }),
      () => convidarDonoAcao(empresaId, { email: "intruso@x.com" }),
      () => revogarConviteDonoAcao(empresaId),
      () => listarTenants({ busca: "", cursor: null }),
      () => obterTenant(tenantId),
      () => listarEmpresasDoTenant({ tenantId, cursor: null }),
      () => obterEmpresaDoTenant(tenantId, empresaId),
      () => listarMembrosDaEmpresa({ empresaId, cursor: null }),
      () => obterSituacaoDono(empresaId),
      () => proximaLeva("qualquer", "nome", () => listarTenants({ busca: "", cursor: null })),
    ];
    for (const chamar of chamadas) expect(await destinoDoRedirect(chamar())).toBe("/");

    estado.cookie = "";
    for (const chamar of chamadas) expect(await destinoDoRedirect(chamar())).toBe("/login");

    expect(await db.select({ nome: tenants.nome, status: tenants.status }).from(tenants)).toEqual([
      { nome: "Loja Real", status: "ativo" },
    ]);
    expect(await db.select({ id: empresas.id }).from(empresas)).toHaveLength(1);
    const [empresa] = await db.select({ modulos: empresas.modulos }).from(empresas);
    expect(empresa!.modulos).toMatchObject({ balcao: false });
    expect(await db.select().from(usuarios).where(eq(usuarios.email, "intruso@x.com"))).toEqual([]);
    expect(await db.select().from(convites)).toEqual([]);
  });

  it("fluxo do admin: cria tenant e empresa, liga módulo e convida o dono, sem ganhar contexto de empresa", async () => {
    const admin = await entrarComoAdmin();

    const tenant = await criarTenantAcao({ nome: "Grupo do Admin" });
    expect(tenant.ok).toBe(true);
    if (!tenant.ok) return;
    const empresa = await criarEmpresaAcao(tenant.dados.id, { ...EMPRESA_FORM, empresaId: "ignorado", modulos: { balcao: true } });
    expect(empresa.ok).toBe(true);
    if (!empresa.ok) return;

    const [gravada] = await db.select().from(empresas).where(eq(empresas.id, empresa.dados.id));
    expect(gravada).toMatchObject({ cnpj: "11222333000181", uf: "SP", regimeTributario: "lucro_real" });
    expect(gravada!.modulos).toMatchObject({ balcao: false }); // o formulário não liga módulo

    const modulo = await alterarModuloAcao(empresa.dados.id, { modulo: "balcao", ligado: true });
    expect(modulo).toMatchObject({ ok: true, dados: { modulos: { balcao: true } } });

    const convite = await convidarDonoAcao(empresa.dados.id, { email: "Dona@Nova.com" });
    expect(convite.ok).toBe(true);
    if (!convite.ok) return;
    expect(Object.keys(convite.dados)).toEqual(["link"]);
    const token = tokenDoLink(convite.dados.link);
    expect(await obterSituacaoDono(empresa.dados.id)).toMatchObject({
      temMembros: false,
      convitePendente: { email: "dona@nova.com" },
    });
    // a dona abre o link e cria a conta
    await withTransaction((tx) => aceitarConviteNovaConta(tx, { token, nome: "Dona Nova", senha: "senha-da-dona-1" }));
    expect(await obterSituacaoDono(empresa.dados.id)).toEqual({ temMembros: true, convitePendente: null });

    // as listas do admin mostram só dados de plataforma
    const lista = await listarEmpresasDoTenant({ tenantId: tenant.dados.id, cursor: null });
    expect(lista.linhas).toEqual([
      expect.objectContaining({ id: empresa.dados.id, cnpj: "11222333000181", modulosLigados: 1, membros: 1 }),
    ]);
    const membrosLista = await listarMembrosDaEmpresa({ empresaId: empresa.dados.id, cursor: null });
    expect(membrosLista.linhas.map((m) => [m.nome, m.email, m.perfil, m.ativo])).toEqual([
      ["Dona Nova", "dona@nova.com", "dono", true],
    ]);

    // a auditoria registra o admin como autor do que ele fez (o aceite é da dona)
    const autores = await db
      .select({ usuarioId: auditoria.usuarioId, acao: auditoria.acao })
      .from(auditoria)
      .where(eq(auditoria.empresaId, empresa.dados.id));
    const doAdmin = autores.filter((a) => !["membro_criado", "convite_aceito"].includes(a.acao));
    expect(doAdmin.map((a) => a.acao).sort()).toEqual(["convite_criado", "empresa_criada", "modulos_alterados", "tenant_criado"]);
    expect(new Set(doAdmin.map((a) => a.usuarioId))).toEqual(new Set([admin.id]));

    // o admin continua sem contexto de empresa (não é membro)
    expect(await getContext()).toBeNull();
    expect(await db.select().from(membros).where(eq(membros.usuarioId, admin.id))).toEqual([]);

    // suspender o tenant tira o acesso da dona na hora
    expect(await definirStatusTenantAcao(tenant.dados.id, "suspenso")).toMatchObject({ ok: true });
    const [dona] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, "dona@nova.com"));
    estado.cookie = (await criarSessao(db, dona!.id)).cookie;
    expect(await getContext()).toBeNull();
  });

  it("CNPJ repetido volta como erro no campo; nome de tenant repetido também", async () => {
    await entrarComoAdmin();
    const tenant = await criarTenantAcao({ nome: "Grupo X" });
    if (!tenant.ok) throw new Error("tenant");
    expect(await criarEmpresaAcao(tenant.dados.id, EMPRESA_FORM)).toMatchObject({ ok: true });

    const repetida = await criarEmpresaAcao(tenant.dados.id, { ...EMPRESA_FORM, cnpj: "11222333000181" });
    expect(repetida.ok).toBe(false);
    if (!repetida.ok) expect(repetida.erros?.cnpj?.[0]).toMatch(/Já existe uma empresa com este CNPJ/);

    const invalida = await criarEmpresaAcao(tenant.dados.id, { ...EMPRESA_FORM, cnpj: "11222333000182" });
    if (!invalida.ok) expect(invalida.erros?.cnpj?.[0]).toMatch(/dígito verificador/);

    const nome = await criarTenantAcao({ nome: "grupo x" });
    expect(nome.ok).toBe(false);
    if (!nome.ok) expect(nome.erros?.nome?.[0]).toMatch(/Já existe um cliente/);

    expect(await criarEmpresaAcao("nao-e-uuid", EMPRESA_FORM)).toMatchObject({ ok: false });
    expect(await criarEmpresaAcao("5f0c7a3e-8c1b-4a5e-9a7d-2b9c1d3e4f50", { ...EMPRESA_FORM, cnpj: cnpjValido("B") })).toMatchObject({
      ok: false,
      mensagem: "Cliente (tenant) não encontrado.",
    });
  });

  it("convite: mesma resposta para e-mail novo e existente; o admin não convida um segundo dono", async () => {
    await entrarComoAdmin();
    // usuária que já é dona em outro tenant
    const outra = await withTransaction(async (tx) =>
      criarEmpresa(tx, dadosEmpresa((await criarTenant(tx, { nome: "Tenant Alheio" })).id)),
    );
    const clara = await criarUsuarioComSenha(db, { nome: "Clara Segredo", email: "clara@loja.com", senha: "senha-forte-123" });
    await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: outra.empresa.id, usuarioId: clara.id, perfil: "dono", usuario: null }),
    );

    const tenant = await criarTenantAcao({ nome: "Tenant Novo" });
    if (!tenant.ok) throw new Error("tenant");
    const a = await criarEmpresaAcao(tenant.dados.id, EMPRESA_FORM);
    const b = await criarEmpresaAcao(tenant.dados.id, { ...EMPRESA_FORM, cnpj: cnpjValido("C") });
    if (!a.ok || !b.ok) throw new Error("empresas");

    const existente = await convidarDonoAcao(a.dados.id, { email: "Clara@Loja.com" });
    const novo = await convidarDonoAcao(b.dados.id, { email: "davi@loja.com" });
    expect(existente.ok && novo.ok).toBe(true);
    if (!existente.ok || !novo.ok) return;
    // mesmas chaves, mesma forma e mesma mensagem (só o e-mail digitado muda)
    expect(Object.keys(existente).sort()).toEqual(Object.keys(novo).sort());
    expect(Object.keys(existente.dados)).toEqual(["link"]);
    expect(Object.keys(novo.dados)).toEqual(["link"]);
    expect(existente.mensagem).toBe("Convite criado para clara@loja.com.");
    expect(novo.mensagem).toBe("Convite criado para davi@loja.com.");
    expect(existente.dados.link).toMatch(/^http.+\/convite\/[A-Za-z0-9_-]{43}$/);
    const texto = JSON.stringify(existente);
    for (const segredo of ["Clara Segredo", "Tenant Alheio", outra.empresa.id, clara.id]) expect(texto).not.toContain(segredo);
    // criar o convite não cria usuário nem membro
    expect(await db.select().from(membros).where(eq(membros.empresaId, a.dados.id))).toEqual([]);
    expect(await db.select().from(usuarios).where(eq(usuarios.email, "davi@loja.com"))).toEqual([]);

    // outro e-mail com convite pendente: recusado; o mesmo e-mail gera um link novo e revoga o anterior
    const outroEmail = await convidarDonoAcao(a.dados.id, { email: "intrometido@loja.com" });
    expect(outroEmail).toMatchObject({ ok: false, mensagem: expect.stringMatching(/convite de dono pendente/) });
    const deNovo = await convidarDonoAcao(a.dados.id, { email: "clara@loja.com" });
    if (!deNovo.ok) throw new Error("reconvite");
    expect(deNovo.dados.link).not.toBe(existente.dados.link);
    const pendentes = await db
      .select()
      .from(convites)
      .where(and(eq(convites.empresaId, a.dados.id), isNull(convites.revogadoEm)));
    expect(pendentes).toHaveLength(1);

    // revogar libera outro e-mail
    expect(await revogarConviteDonoAcao(a.dados.id)).toMatchObject({ ok: true });
    expect(await obterSituacaoDono(a.dados.id)).toEqual({ temMembros: false, convitePendente: null });

    // com dono ativo, o admin não convida mais ninguém
    await withTransaction((tx) => aceitarConviteNovaConta(tx, { token: tokenDoLink(novo.dados.link), nome: "Davi", senha: "senha-do-davi-1" }));
    const segundo = await convidarDonoAcao(b.dados.id, { email: "socio@loja.com" });
    expect(segundo).toMatchObject({ ok: false, mensagem: expect.stringMatching(/já tem dono.*dono da loja/) });
  });

  it("depois que o dono aceitou, revogar e convidar de novo (mesmo e-mail) dá empresa_com_dono", async () => {
    await entrarComoAdmin();
    const tenant = await criarTenantAcao({ nome: "Tenant Aceito" });
    if (!tenant.ok) throw new Error("tenant");
    const empresa = await criarEmpresaAcao(tenant.dados.id, EMPRESA_FORM);
    if (!empresa.ok) throw new Error("empresa");
    const convite = await convidarDonoAcao(empresa.dados.id, { email: "dona@loja.com" });
    if (!convite.ok) throw new Error("convite");
    await withTransaction((tx) =>
      aceitarConviteNovaConta(tx, { token: tokenDoLink(convite.dados.link), nome: "Dona", senha: "senha-da-dona-1" }),
    );

    expect(await revogarConviteDonoAcao(empresa.dados.id)).toMatchObject({ ok: true, mensagem: "Não havia convite pendente." });
    const deNovo = await convidarDonoAcao(empresa.dados.id, { email: "dona@loja.com" });
    expect(deNovo).toMatchObject({ ok: false, mensagem: expect.stringMatching(/dono da loja/) });
    expect(await db.select().from(convites).where(eq(convites.empresaId, empresa.dados.id))).toHaveLength(1);
  });

  it("lista de tenants: busca sem acento por nome, empresa ou CNPJ e rolagem por cursor sem repetir", async () => {
    await entrarComoAdmin();
    await withTransaction(async (tx) => {
      for (let i = 0; i < TAMANHO_LEVA_ADMIN + 5; i++) {
        await criarTenant(tx, { nome: `Tenant ${String(i).padStart(3, "0")}` });
      }
      const especial = await criarTenant(tx, { nome: "Moto Peças Ação" });
      await criarEmpresa(tx, dadosEmpresa(especial.id, { razaoSocial: "Razão Única Ltda", cnpj: "11222333000181" }));
    });

    const primeira = await listarTenants({ busca: "", cursor: null });
    expect(primeira.total).toBe(TAMANHO_LEVA_ADMIN + 6);
    expect(primeira.linhas).toHaveLength(TAMANHO_LEVA_ADMIN);
    expect(primeira.proximoCursor).not.toBeNull();

    const { decodificarCursor } = await import("../../src/lib/cursor");
    const cursor = decodificarCursor(primeira.proximoCursor, "nome");
    if (!cursor.ok) throw new Error("cursor");
    const segunda = await listarTenants({ busca: "", cursor: cursor.cursor });
    expect(segunda.linhas).toHaveLength(6);
    expect(segunda.proximoCursor).toBeNull();
    const ids = new Set([...primeira.linhas, ...segunda.linhas].map((l) => l.id));
    expect(ids.size).toBe(TAMANHO_LEVA_ADMIN + 6);

    for (const busca of ["pecas acao", "razao unica", "11.222.333/0001"]) {
      const resultado = await listarTenants({ busca, cursor: null });
      expect(resultado.linhas.map((l) => [l.nome, l.empresas])).toEqual([["Moto Peças Ação", 1]]);
    }
    // curinga do LIKE digitado pelo usuário é literal
    expect((await listarTenants({ busca: "%", cursor: null })).total).toBe(0);
  });
});
