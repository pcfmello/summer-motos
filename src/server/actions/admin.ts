"use server";

/**
 * Actions da área `/admin` (fatia 0.10): tenants, empresas, módulos e convite
 * do dono. Só o admin da plataforma: cada action chama `exigirAdminPlataforma()`
 * (que lê a flag do banco nesta requisição e redireciona quem não é admin).
 *
 * Ordem fixa: Zod → `exigirAdminPlataforma()` → `withTransaction` (serviços de
 * `server/servicos/empresas.ts`, que gravam a auditoria) → `revalidatePath`.
 *
 * **Alvo, não contexto:** o admin não tem empresa ativa (D027). O tenant ou a
 * empresa em que ele age vem como argumento separado (nunca dentro do esquema
 * do formulário), validado como uuid e conferido no banco. Nenhum dado de
 * negócio das empresas é lido ou devolvido.
 */
import { revalidatePath } from "next/cache";

import { errosDoZod, type ResultadoAcao } from "@/components/formulario/resultado-acao";
import { lerUrlBase } from "@/server/auth/configuracao";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import type { Modulos } from "@/server/auth/permissoes";
import { codigoErroPg } from "@/server/db/conexao";
import { withTransaction } from "@/server/db";
import {
  esquemaAlterarModulo,
  esquemaConviteDono,
  esquemaIdAlvo,
  esquemaNovaEmpresa,
  esquemaNovoTenant,
  esquemaStatusTenant,
} from "@/server/domain/plataforma";
import { convidarDono, linkDoConvite, revogarConvitesDeDono } from "@/server/servicos/convites";
import {
  ErroPlataforma,
  alterarModulo,
  criarEmpresa,
  criarTenant,
  definirStatusTenant,
} from "@/server/servicos/empresas";

const ERRO_INESPERADO =
  "Não foi possível concluir agora. Tente de novo; se continuar, avise o responsável pelo sistema.";
const ALVO_INVALIDO = "Registro não encontrado. Recarregue a página.";

/** Erro de negócio vira mensagem (no campo, se houver); o resto vira mensagem genérica. */
function falha(erro: unknown, acao: string): { ok: false; mensagem?: string; erros?: Record<string, string[]> } {
  if (erro instanceof ErroPlataforma) {
    return erro.campo ? { ok: false, erros: { [erro.campo]: [erro.message] } } : { ok: false, mensagem: erro.message };
  }
  // só o SQLSTATE: a mensagem do Drizzle traz os parâmetros da query (hash de senha, e-mail)
  console.error(`[admin] ${acao} falhou (${codigoErroPg(erro) ?? (erro instanceof Error ? erro.name : "erro")})`);
  return { ok: false, mensagem: ERRO_INESPERADO };
}

function revalidarAdmin() {
  revalidatePath("/admin", "layout");
}

export async function criarTenantAcao(dados: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const entrada = esquemaNovoTenant.safeParse(dados);
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error) };
  await exigirAdminPlataforma();

  try {
    const tenant = await withTransaction((tx) => criarTenant(tx, entrada.data));
    revalidarAdmin();
    return { ok: true, dados: { id: tenant.id }, mensagem: `Cliente "${tenant.nome}" criado.` };
  } catch (erro) {
    return falha(erro, "criar tenant");
  }
}

export async function definirStatusTenantAcao(tenantId: unknown, status: unknown): Promise<ResultadoAcao> {
  const alvo = esquemaIdAlvo.safeParse(tenantId);
  const novo = esquemaStatusTenant.safeParse(status);
  if (!alvo.success || !novo.success) return { ok: false, mensagem: ALVO_INVALIDO };
  const admin = await exigirAdminPlataforma();

  try {
    const { alterado } = await withTransaction((tx) =>
      definirStatusTenant(tx, { tenantId: alvo.data, status: novo.data, usuario: { id: admin.id } }),
    );
    revalidarAdmin();
    const texto = novo.data === "suspenso" ? "Cliente suspenso: ninguém dele entra no sistema." : "Cliente reativado.";
    return { ok: true, dados: undefined, mensagem: alterado ? texto : "Nada mudou: o status já era esse." };
  } catch (erro) {
    return falha(erro, "alterar status do tenant");
  }
}

export async function criarEmpresaAcao(tenantId: unknown, dados: unknown): Promise<ResultadoAcao<{ id: string }>> {
  const alvo = esquemaIdAlvo.safeParse(tenantId);
  if (!alvo.success) return { ok: false, mensagem: ALVO_INVALIDO };
  const entrada = esquemaNovaEmpresa.safeParse(dados);
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error) };
  const admin = await exigirAdminPlataforma();

  try {
    // módulos: todos desligados na criação (regra 4.1); o admin liga depois, um a um
    const criada = await withTransaction((tx) =>
      criarEmpresa(tx, { ...entrada.data, tenantId: alvo.data, usuario: { id: admin.id } }),
    );
    revalidarAdmin();
    return { ok: true, dados: { id: criada.empresa.id }, mensagem: "Empresa criada." };
  } catch (erro) {
    return falha(erro, "criar empresa");
  }
}

export async function alterarModuloAcao(
  empresaId: unknown,
  dados: unknown,
): Promise<ResultadoAcao<{ modulos: Modulos }>> {
  const alvo = esquemaIdAlvo.safeParse(empresaId);
  if (!alvo.success) return { ok: false, mensagem: ALVO_INVALIDO };
  const entrada = esquemaAlterarModulo.safeParse(dados);
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error), mensagem: "Módulo inválido." };
  const admin = await exigirAdminPlataforma();

  try {
    const modulos = await withTransaction((tx) =>
      alterarModulo(tx, { empresaId: alvo.data, ...entrada.data, usuario: { id: admin.id } }),
    );
    revalidarAdmin();
    return { ok: true, dados: { modulos } };
  } catch (erro) {
    return falha(erro, "alterar módulo");
  }
}

export type ResultadoConviteDono = {
  /** Link de uso único, válido por 7 dias. Mostrado uma vez; o banco guarda só o hash do token. */
  link: string;
};

/**
 * Convida o primeiro dono da empresa por link de uso único (D033). A resposta
 * é a mesma para e-mail novo e existente: nenhuma consulta a usuários é feita
 * aqui; quem abre o link cria a conta ou entra com a que já tem.
 */
export async function convidarDonoAcao(
  empresaId: unknown,
  dados: unknown,
): Promise<ResultadoAcao<ResultadoConviteDono>> {
  const alvo = esquemaIdAlvo.safeParse(empresaId);
  if (!alvo.success) return { ok: false, mensagem: ALVO_INVALIDO };
  const entrada = esquemaConviteDono.safeParse(dados);
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error) };
  const admin = await exigirAdminPlataforma();

  try {
    const { token } = await withTransaction((tx) =>
      convidarDono(tx, { empresaId: alvo.data, email: entrada.data.email, usuario: { id: admin.id } }),
    );
    revalidarAdmin();
    return {
      ok: true,
      dados: { link: linkDoConvite(lerUrlBase()!, token) },
      mensagem: `Convite criado para ${entrada.data.email}.`,
    };
  } catch (erro) {
    return falha(erro, "convidar dono");
  }
}

/** Revoga o convite de dono pendente da empresa (ex.: e-mail digitado errado). */
export async function revogarConviteDonoAcao(empresaId: unknown): Promise<ResultadoAcao> {
  const alvo = esquemaIdAlvo.safeParse(empresaId);
  if (!alvo.success) return { ok: false, mensagem: ALVO_INVALIDO };
  const admin = await exigirAdminPlataforma();

  try {
    const revogados = await withTransaction((tx) =>
      revogarConvitesDeDono(tx, { empresaId: alvo.data, usuario: { id: admin.id } }),
    );
    revalidarAdmin();
    return {
      ok: true,
      dados: undefined,
      mensagem: revogados > 0 ? "Convite revogado: o link deixou de valer." : "Não havia convite pendente.",
    };
  } catch (erro) {
    return falha(erro, "revogar convite");
  }
}
