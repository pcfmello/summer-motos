/**
 * Núcleo do contexto da requisição: dado o usuário e a sessão já autenticados
 * pelo Better Auth, decide a empresa ativa e o perfil **lendo o banco**.
 *
 * Sem `server-only` e com o banco injetado, para ser usado também pelos testes
 * de integração, pelo seed e pelo worker. O app usa `getContext()`
 * (`./contexto.ts`), que lê a sessão do cookie e chama estas funções.
 *
 * Regras (exigências da 0.6 em docs/plano.md):
 * - a cada chamada confere membro ativo, empresa ativa e tenant `ativo`;
 * - o perfil vem sempre de `membros`, nunca da sessão ou do cliente;
 * - a flag `admin_plataforma` não dá acesso a empresa nenhuma: só o membro dá.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import type { Banco, Transacao } from "../db/conexao";
import { empresas, membros, sessoes, tenants } from "../db/schema";

import { lerModulos, type Modulos, type Perfil } from "./permissoes";

type Consultor = Banco | Transacao;

export type UsuarioSessao = {
  id: string;
  nome: string;
  email: string;
  /** Só libera a área `/admin`. Não dá acesso aos dados das empresas. */
  adminPlataforma: boolean;
};

/** O que o Better Auth devolveu da sessão (cookie assinado + linha em `sessoes`). */
export type SessaoLida = {
  sessaoId: string;
  usuario: UsuarioSessao;
  /** `sessoes.empresa_ativa_id`. Só um palpite: é validado contra `membros` toda vez. */
  empresaAtivaId: string | null;
};

/** Contexto de toda action e query. `tenantId` e `empresaId` nunca vêm do cliente. */
export type Contexto = {
  usuario: Omit<UsuarioSessao, "adminPlataforma">;
  tenantId: string;
  empresaId: string;
  /** Perfil na empresa ativa, lido de `membros` nesta requisição. */
  perfil: Perfil;
  /** `empresas.modulos` da empresa ativa, com o padrão (desligado) aplicado. */
  modulos: Modulos;
};

export type EmpresaDoUsuario = {
  empresaId: string;
  tenantId: string;
  perfil: Perfil;
  modulos: Modulos;
  razaoSocial: string;
  nomeFantasia: string | null;
  cnpj: string;
  regimeTributario: (typeof empresas.$inferSelect)["regimeTributario"];
  logoChave: string | null;
};

export type ResultadoContexto =
  | { ok: true; contexto: Contexto; empresas: EmpresaDoUsuario[] }
  | { ok: false; motivo: "sem_sessao" | "sem_empresa" };

/** Condição de acesso válido: membro ativo, empresa ativa e tenant ativo. */
const acessoValido = and(eq(membros.ativo, true), eq(empresas.ativo, true), eq(tenants.status, "ativo"));

/**
 * Empresas em que o usuário é membro ativo, de empresa ativa e tenant ativo.
 * Pode haver empresas de tenants diferentes: o usuário vê todas as dele.
 * Ordem estável (nome exibido, depois id), que decide a empresa padrão.
 */
export async function listarEmpresasDoUsuario(db: Consultor, usuarioId: string): Promise<EmpresaDoUsuario[]> {
  const linhas = await db
    .select({
      empresaId: empresas.id,
      tenantId: empresas.tenantId,
      perfil: membros.perfil,
      modulos: empresas.modulos,
      razaoSocial: empresas.razaoSocial,
      nomeFantasia: empresas.nomeFantasia,
      cnpj: empresas.cnpj,
      regimeTributario: empresas.regimeTributario,
      logoChave: empresas.logoChave,
    })
    .from(membros)
    .innerJoin(empresas, eq(empresas.id, membros.empresaId))
    .innerJoin(tenants, eq(tenants.id, empresas.tenantId))
    .where(and(eq(membros.usuarioId, usuarioId), acessoValido))
    .orderBy(asc(sql`coalesce(${empresas.nomeFantasia}, ${empresas.razaoSocial})`), asc(empresas.id));

  return linhas.map((linha) => ({ ...linha, modulos: lerModulos(linha.modulos) }));
}

/**
 * Resolve o contexto da sessão. Se a empresa ativa da sessão não vale mais
 * (membro desativado, empresa desativada, tenant suspenso) ou não existe, escolhe
 * a primeira empresa válida e grava na sessão. Sem nenhuma, falha (`sem_empresa`).
 */
export async function resolverContexto(db: Consultor, sessao: SessaoLida): Promise<ResultadoContexto> {
  const lista = await listarEmpresasDoUsuario(db, sessao.usuario.id);
  const ativa = lista.find((e) => e.empresaId === sessao.empresaAtivaId) ?? lista[0];
  if (!ativa) return { ok: false, motivo: "sem_empresa" };

  if (ativa.empresaId !== sessao.empresaAtivaId) {
    await db
      .update(sessoes)
      .set({ empresaAtivaId: ativa.empresaId })
      .where(and(eq(sessoes.id, sessao.sessaoId), eq(sessoes.userId, sessao.usuario.id)));
  }

  const { id, nome, email } = sessao.usuario;
  return {
    ok: true,
    contexto: {
      usuario: { id, nome, email },
      tenantId: ativa.tenantId,
      empresaId: ativa.empresaId,
      perfil: ativa.perfil,
      modulos: ativa.modulos,
    },
    empresas: lista,
  };
}

/**
 * Troca a empresa ativa da sessão, numa única instrução: só grava se o usuário
 * for membro ativo da empresa, a empresa estiver ativa e o tenant `ativo`.
 * Devolve `false` se recusou (o chamador não diz o motivo ao cliente).
 */
export async function trocarEmpresaAtiva(
  db: Consultor,
  entrada: { sessaoId: string; usuarioId: string; empresaId: string },
): Promise<boolean> {
  const alteradas = await db
    .update(sessoes)
    .set({ empresaAtivaId: entrada.empresaId })
    .where(
      and(
        eq(sessoes.id, entrada.sessaoId),
        eq(sessoes.userId, entrada.usuarioId),
        // SQL explícito com apelidos: no UPDATE o Drizzle não qualifica as colunas
        sql`exists (
          select 1 from membros m
          join empresas e on e.id = m.empresa_id
          join tenants t on t.id = e.tenant_id
          where m.empresa_id = ${entrada.empresaId}
            and m.usuario_id = ${entrada.usuarioId}
            and m.ativo and e.ativo and t.status = 'ativo'
        )`,
      ),
    )
    .returning({ id: sessoes.id });
  return alteradas.length === 1;
}
