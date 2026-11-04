/**
 * Leituras da área `/admin` (fatia 0.10): só dados de plataforma (tenants,
 * empresas, módulos e membros). Nenhuma leitura de dado de negócio das empresas
 * (produtos, clientes, documentos, custos): o admin da plataforma não os vê
 * (seção 3).
 *
 * Cada função chama `exigirAdminPlataforma()` (além da página), porque também é
 * chamada pelas server functions de "carregar mais" da rolagem infinita (D017).
 * Paginação por cursor keyset (`src/lib/cursor.ts`), nunca `OFFSET`.
 */
import "server-only";

import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { unstable_rethrow } from "next/navigation";

import { codificarCursor, decodificarCursor, type CursorKeyset, type ResultadoLeva } from "@/lib/cursor";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import { lerModulos, type Modulos, type Perfil } from "@/server/auth/permissoes";
import { db } from "@/server/db";
import { empresas, membros, tenants, usuarios } from "@/server/db/schema";
import type { RegimeTributario, StatusTenant } from "@/server/domain/plataforma";
import { convitePendenteDeDono } from "@/server/servicos/convites";

export const TAMANHO_LEVA_ADMIN = 50;
/** Ordenações (o cursor de uma não vale na outra). */
export const ORDEM_TENANTS = "nome";
export const ORDEM_EMPRESAS = "razao_social";
export const ORDEM_MEMBROS = "nome";

export type Leva<L> = { linhas: L[]; total: number; proximoCursor: string | null };

/** `%termo%` para LIKE, com `\`, `%` e `_` do termo escapados. */
function padraoLike(busca: string): string {
  return `%${busca.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

const semAcento = (valor: SQL | unknown) => sql`public.f_unaccent(lower(${valor}))`;

// Nas subconsultas correlacionadas, a coluna de fora vai qualificada à mão
// ("tenants"."id"): dentro de `select({ campo: sql... })` o Drizzle escreve só
// "id", que o Postgres resolveria para o id da tabela da subconsulta.

function recortar<L>(linhas: L[], ordem: string, chave: (l: L) => { v: string; id: string }) {
  const temMais = linhas.length > TAMANHO_LEVA_ADMIN;
  const pagina = temMais ? linhas.slice(0, TAMANHO_LEVA_ADMIN) : linhas;
  const ultima = pagina.at(-1);
  return {
    pagina,
    proximoCursor: temMais && ultima ? codificarCursor({ o: ordem, ...chave(ultima) }) : null,
  };
}

/** Valor textual do cursor (o cursor das listas do admin sempre guarda texto). */
function valorTexto(cursor: CursorKeyset): string {
  return typeof cursor.v === "string" ? cursor.v : String(cursor.v ?? "");
}

/**
 * Corpo das server functions de "carregar mais" das páginas do admin (D017):
 * confere o admin, valida o cursor (único dado vindo do cliente; os filtros vêm
 * da closure da página) e devolve erro amigável em vez de lançar.
 */
export async function proximaLeva<L>(
  cursorTexto: unknown,
  ordem: string,
  buscar: (cursor: CursorKeyset) => Promise<Leva<L>>,
): Promise<ResultadoLeva<L>> {
  await exigirAdminPlataforma();
  const cursor = decodificarCursor(cursorTexto, ordem);
  if (!cursor.ok) return { ok: false, mensagem: cursor.mensagem };
  try {
    const leva = await buscar(cursor.cursor);
    return { ok: true, linhas: leva.linhas, proximoCursor: leva.proximoCursor };
  } catch (erro) {
    unstable_rethrow(erro); // redirect() do exigirAdminPlataforma passa adiante
    console.error(`[admin] carregar mais (${ordem}) falhou`);
    return { ok: false, mensagem: "Não foi possível carregar mais itens. Tente de novo." };
  }
}

// ---------------------------------------------------------------------------
// Tenants
// ---------------------------------------------------------------------------

export type LinhaTenant = {
  id: string;
  nome: string;
  status: StatusTenant;
  empresas: number;
  criadoEm: string;
};

/**
 * Tenants por nome. A busca procura no nome do tenant e na razão social, no
 * nome fantasia e no CNPJ das empresas dele (sem acento e sem caixa).
 */
export async function listarTenants(filtros: { busca: string; cursor: CursorKeyset | null }): Promise<Leva<LinhaTenant>> {
  await exigirAdminPlataforma();
  const condicoes: SQL[] = [];
  if (filtros.busca) {
    const termo = padraoLike(filtros.busca);
    const cnpj = padraoLike(filtros.busca.replace(/[\s.\-/]/g, "").toUpperCase());
    condicoes.push(sql`(
      ${semAcento(tenants.nome)} like ${semAcento(termo)}
      or exists (
        select 1 from empresas e
         where e.tenant_id = "tenants"."id"
           and (public.f_unaccent(lower(e.razao_social)) like public.f_unaccent(lower(${termo}))
             or public.f_unaccent(lower(coalesce(e.nome_fantasia, ''))) like public.f_unaccent(lower(${termo}))
             or e.cnpj like ${cnpj})
      )
    )`);
  }
  const filtro = condicoes.length ? and(...condicoes) : undefined;
  const depoisDoCursor = filtros.cursor
    ? sql`(${tenants.nome}, ${tenants.id}) > (${valorTexto(filtros.cursor)}, ${filtros.cursor.id}::uuid)`
    : undefined;

  const [linhas, [contagem]] = await Promise.all([
    db
      .select({
        id: tenants.id,
        nome: tenants.nome,
        status: tenants.status,
        empresas: sql<number>`(select count(*)::int from empresas e where e.tenant_id = "tenants"."id")`,
        criadoEm: tenants.createdAt,
      })
      .from(tenants)
      .where(and(filtro, depoisDoCursor))
      .orderBy(asc(tenants.nome), asc(tenants.id))
      .limit(TAMANHO_LEVA_ADMIN + 1),
    filtros.cursor
      ? Promise.resolve([{ total: 0 }])
      : db.select({ total: sql<number>`count(*)::int` }).from(tenants).where(filtro),
  ]);

  const { pagina, proximoCursor } = recortar(linhas, ORDEM_TENANTS, (l) => ({ v: l.nome, id: l.id }));
  return {
    linhas: pagina.map((l) => ({ ...l, criadoEm: l.criadoEm.toISOString() })),
    total: contagem?.total ?? 0,
    proximoCursor,
  };
}

export type TenantDetalhe = { id: string; nome: string; status: StatusTenant; criadoEm: string };

export async function obterTenant(tenantId: string): Promise<TenantDetalhe | null> {
  await exigirAdminPlataforma();
  const [tenant] = await db
    .select({ id: tenants.id, nome: tenants.nome, status: tenants.status, criadoEm: tenants.createdAt })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  return tenant ? { ...tenant, criadoEm: tenant.criadoEm.toISOString() } : null;
}

// ---------------------------------------------------------------------------
// Empresas do tenant
// ---------------------------------------------------------------------------

export type LinhaEmpresa = {
  id: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  regimeTributario: RegimeTributario;
  uf: string | null;
  ativo: boolean;
  modulosLigados: number;
  membros: number;
};

export async function listarEmpresasDoTenant(filtros: {
  tenantId: string;
  cursor: CursorKeyset | null;
}): Promise<Leva<LinhaEmpresa>> {
  await exigirAdminPlataforma();
  const doTenant = eq(empresas.tenantId, filtros.tenantId);
  const depoisDoCursor = filtros.cursor
    ? sql`(${empresas.razaoSocial}, ${empresas.id}) > (${valorTexto(filtros.cursor)}, ${filtros.cursor.id}::uuid)`
    : undefined;

  const [linhas, [contagem]] = await Promise.all([
    db
      .select({
        id: empresas.id,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        cnpj: empresas.cnpj,
        regimeTributario: empresas.regimeTributario,
        uf: empresas.uf,
        ativo: empresas.ativo,
        modulos: empresas.modulos,
        membros: sql<number>`(select count(*)::int from membros m where m.empresa_id = "empresas"."id" and m.ativo)`,
      })
      .from(empresas)
      .where(and(doTenant, depoisDoCursor))
      .orderBy(asc(empresas.razaoSocial), asc(empresas.id))
      .limit(TAMANHO_LEVA_ADMIN + 1),
    filtros.cursor
      ? Promise.resolve([{ total: 0 }])
      : db.select({ total: sql<number>`count(*)::int` }).from(empresas).where(doTenant),
  ]);

  const { pagina, proximoCursor } = recortar(linhas, ORDEM_EMPRESAS, (l) => ({ v: l.razaoSocial, id: l.id }));
  return {
    linhas: pagina.map(({ modulos, ...l }) => ({
      ...l,
      modulosLigados: Object.values(lerModulos(modulos)).filter(Boolean).length,
    })),
    total: contagem?.total ?? 0,
    proximoCursor,
  };
}

export type EmpresaDetalhe = {
  id: string;
  tenantId: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  regimeTributario: RegimeTributario;
  uf: string | null;
  codigoIbgeMunicipio: string | null;
  ativo: boolean;
  modulos: Modulos;
  criadoEm: string;
};

/** A empresa, só se for do tenant informado (a URL traz os dois ids). */
export async function obterEmpresaDoTenant(tenantId: string, empresaId: string): Promise<EmpresaDetalhe | null> {
  await exigirAdminPlataforma();
  const [empresa] = await db
    .select({
      id: empresas.id,
      tenantId: empresas.tenantId,
      razaoSocial: empresas.razaoSocial,
      nomeFantasia: empresas.nomeFantasia,
      cnpj: empresas.cnpj,
      regimeTributario: empresas.regimeTributario,
      uf: empresas.uf,
      codigoIbgeMunicipio: empresas.codigoIbgeMunicipio,
      ativo: empresas.ativo,
      modulos: empresas.modulos,
      criadoEm: empresas.createdAt,
    })
    .from(empresas)
    .where(and(eq(empresas.id, empresaId), eq(empresas.tenantId, tenantId)));
  return empresa
    ? { ...empresa, modulos: lerModulos(empresa.modulos), criadoEm: empresa.criadoEm.toISOString() }
    : null;
}

// ---------------------------------------------------------------------------
// Membros da empresa
// ---------------------------------------------------------------------------

export type LinhaMembro = {
  id: string;
  nome: string;
  email: string;
  perfil: Perfil;
  ativo: boolean;
  desde: string;
};

export async function listarMembrosDaEmpresa(filtros: {
  empresaId: string;
  cursor: CursorKeyset | null;
}): Promise<Leva<LinhaMembro>> {
  await exigirAdminPlataforma();
  const daEmpresa = eq(membros.empresaId, filtros.empresaId);
  const depoisDoCursor = filtros.cursor
    ? sql`(${usuarios.name}, ${membros.id}) > (${valorTexto(filtros.cursor)}, ${filtros.cursor.id}::uuid)`
    : undefined;

  const [linhas, [contagem]] = await Promise.all([
    db
      .select({
        id: membros.id,
        nome: usuarios.name,
        email: usuarios.email,
        perfil: membros.perfil,
        ativo: membros.ativo,
        desde: membros.createdAt,
      })
      .from(membros)
      .innerJoin(usuarios, eq(usuarios.id, membros.usuarioId))
      .where(and(daEmpresa, depoisDoCursor))
      .orderBy(asc(usuarios.name), asc(membros.id))
      .limit(TAMANHO_LEVA_ADMIN + 1),
    filtros.cursor
      ? Promise.resolve([{ total: 0 }])
      : db.select({ total: sql<number>`count(*)::int` }).from(membros).where(daEmpresa),
  ]);

  const { pagina, proximoCursor } = recortar(linhas, ORDEM_MEMBROS, (l) => ({ v: l.nome, id: l.id }));
  return {
    linhas: pagina.map((l) => ({ ...l, desde: l.desde.toISOString() })),
    total: contagem?.total ?? 0,
    proximoCursor,
  };
}

// ---------------------------------------------------------------------------
// Situação do dono (convite por link, D033)
// ---------------------------------------------------------------------------

export type SituacaoDono = {
  /** Qualquer membro, ativo ou não: o admin só convida enquanto a empresa não tem ninguém. */
  temMembros: boolean;
  /** Convite de dono pendente (não aceito, não revogado, não vencido). */
  convitePendente: { email: string; expiraEm: string } | null;
};

/** Decide o que a tela da empresa mostra: convidar, convite pendente ou "já tem dono". */
export async function obterSituacaoDono(empresaId: string): Promise<SituacaoDono> {
  await exigirAdminPlataforma();
  const [[dono], convite] = await Promise.all([
    db
      .select({ id: membros.id })
      .from(membros)
      .where(eq(membros.empresaId, empresaId))
      .limit(1),
    convitePendenteDeDono(db, empresaId),
  ]);
  return {
    temMembros: dono !== undefined,
    convitePendente: convite ? { email: convite.email, expiraEm: convite.expiraEm.toISOString() } : null,
  };
}
