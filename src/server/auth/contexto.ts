/**
 * `getContext()`: o contexto de toda action, query e página do sistema.
 *
 * - Lê a sessão pelo Better Auth (cookie assinado + linha em `sessoes`, sem
 *   `cookieCache`), depois confere no banco membro ativo, empresa ativa e tenant
 *   `ativo`, e lê o perfil de `membros` (`./contexto-nucleo.ts`).
 * - Cache só por requisição (`React.cache`): duas chamadas na mesma renderização
 *   ou action fazem uma leitura; a requisição seguinte lê de novo. Por isso não
 *   se usa `'use cache: private'`, que guardaria o perfil no navegador por minutos.
 * - `tenantId` e `empresaId` nunca vêm do cliente.
 */
import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/server/db";

import { auth } from "./auth";
import { ROTA_LOGIN } from "./configuracao";
import {
  resolverContexto,
  type Contexto,
  type EmpresaDoUsuario,
  type ResultadoContexto,
  type SessaoLida,
  type UsuarioSessao,
} from "./contexto-nucleo";

export type { Contexto, EmpresaDoUsuario, SessaoLida, UsuarioSessao } from "./contexto-nucleo";

/** Rota de quem tem sessão, mas nenhuma empresa válida (e não é admin). */
export const ROTA_SEM_ACESSO = "/sem-acesso";
export const ROTA_ADMIN = "/admin";

/** Sessão autenticada (sem conferir empresa). `null` sem cookie, cookie inválido ou sessão expirada. */
export const obterSessao = cache(async (): Promise<SessaoLida | null> => {
  const resultado = await auth.api.getSession({ headers: await headers() });
  if (!resultado) return null;
  const { session, user } = resultado;
  return {
    sessaoId: session.id,
    empresaAtivaId: session.empresaAtivaId ?? null,
    usuario: {
      id: user.id,
      nome: user.name,
      email: user.email,
      adminPlataforma: user.adminPlataforma === true,
    },
  };
});

const resolverDaRequisicao = cache(async (): Promise<ResultadoContexto> => {
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, motivo: "sem_sessao" };
  return resolverContexto(db, sessao);
});

/**
 * Contexto da empresa ativa, ou `null` se não há sessão ou o usuário não tem
 * nenhuma empresa válida. Para actions, que devolvem resultado tipado.
 */
export async function getContext(): Promise<Contexto | null> {
  const resultado = await resolverDaRequisicao();
  return resultado.ok ? resultado.contexto : null;
}

/** Empresas em que o usuário é membro ativo (para o seletor). Vazio sem contexto. */
export async function listarEmpresasDaSessao(): Promise<EmpresaDoUsuario[]> {
  const resultado = await resolverDaRequisicao();
  return resultado.ok ? resultado.empresas : [];
}

/**
 * Para páginas e layouts: devolve o contexto ou redireciona. Sem sessão → login;
 * admin da plataforma sem empresa → `/admin`; demais sem empresa → `/sem-acesso`.
 * Não chame dentro de `withTransaction` (o `redirect` lança exceção de controle).
 */
export async function exigirContexto(): Promise<Contexto> {
  const resultado = await resolverDaRequisicao();
  if (resultado.ok) return resultado.contexto;
  if (resultado.motivo === "sem_sessao") redirect(ROTA_LOGIN);
  const sessao = await obterSessao();
  redirect(sessao?.usuario.adminPlataforma ? ROTA_ADMIN : ROTA_SEM_ACESSO);
}

/**
 * Para a área `/admin`: exige sessão de um usuário com `admin_plataforma`.
 * A flag é lida do banco nesta requisição (a sessão não usa cache em cookie).
 * Sem sessão → login; com sessão, mas sem a flag → início.
 */
export async function exigirAdminPlataforma(): Promise<UsuarioSessao> {
  const sessao = await obterSessao();
  if (!sessao) redirect(ROTA_LOGIN);
  if (!sessao.usuario.adminPlataforma) redirect("/");
  return sessao.usuario;
}
