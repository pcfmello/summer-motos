"use server";

/**
 * Actions da página pública `/convite/[token]` (D033).
 *
 * - O token vem do cliente (é a própria credencial do convite) e só é usado
 *   pelo hash, dentro do serviço; nunca vai para log nem auditoria.
 * - Limite de tentativas por IP (`consumirLimiteConvite`) antes de tudo.
 * - Recusas usam a mesma mensagem genérica (`MENSAGEM_CONVITE_INVALIDO`).
 * - Depois do commit: login da conta nova (Better Auth, cookie pelo
 *   `nextCookies`) ou troca da empresa ativa para a empresa do convite.
 *   O destino volta no resultado; a tela navega.
 */
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { errosDoZod, type ResultadoAcao } from "@/components/formulario/resultado-acao";
import { auth } from "@/server/auth/auth";
import { ROTA_LOGIN } from "@/server/auth/configuracao";
import { obterSessao } from "@/server/auth/contexto";
import { trocarEmpresaAtiva } from "@/server/auth/contexto-nucleo";
import { MENSAGEM_LIMITE_CONVITE, consumirLimiteConvite, origemDaRequisicao } from "@/server/auth/limite-convite";
import { codigoErroPg } from "@/server/db/conexao";
import { db, withTransaction } from "@/server/db";
import { esquemaAceiteNovaConta } from "@/server/domain/plataforma";
import {
  MENSAGEM_CONVITE_INVALIDO,
  aceitarConviteContaExistente,
  aceitarConviteNovaConta,
} from "@/server/servicos/convites";
import { ErroPlataforma } from "@/server/servicos/empresas";

const ERRO_INESPERADO = "Não foi possível concluir agora. Tente de novo em instantes.";

function falha(erro: unknown, acao: string): { ok: false; mensagem: string } {
  if (erro instanceof ErroPlataforma) return { ok: false, mensagem: erro.message };
  console.error(`[convite] ${acao} falhou (${codigoErroPg(erro) ?? (erro instanceof Error ? erro.name : "erro")})`);
  return { ok: false, mensagem: ERRO_INESPERADO };
}

export type ResultadoAceiteConvite = { destino: string };

/** Quem não tem conta: define nome e senha, a conta nasce vinculada e a pessoa já entra. */
export async function aceitarConviteNovaContaAcao(
  token: unknown,
  dados: unknown,
): Promise<ResultadoAcao<ResultadoAceiteConvite>> {
  const entrada = esquemaAceiteNovaConta.safeParse(dados);
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error) };
  if (typeof token !== "string") return { ok: false, mensagem: MENSAGEM_CONVITE_INVALIDO };
  if (!(await consumirLimiteConvite())) return { ok: false, mensagem: MENSAGEM_LIMITE_CONVITE };

  const origem = await origemDaRequisicao();
  let aceito;
  try {
    aceito = await withTransaction((tx) =>
      aceitarConviteNovaConta(tx, { token, nome: entrada.data.nome, senha: entrada.data.senha, origem }),
    );
  } catch (erro) {
    return falha(erro, "aceite com conta nova");
  }

  const destino = aceito.tipo === "admin_plataforma" ? "/admin" : "/";
  try {
    await auth.api.signInEmail({
      body: { email: aceito.email, password: entrada.data.senha },
      headers: await headers(),
    });
  } catch {
    // a conta já existe e está vinculada; só o login automático falhou
    return {
      ok: true,
      dados: { destino: `${ROTA_LOGIN}?de=${encodeURIComponent(destino)}` },
      mensagem: "Conta criada. Entre com o seu e-mail e a senha que você acabou de definir.",
    };
  }
  revalidatePath("/", "layout");
  return { ok: true, dados: { destino }, mensagem: "Conta criada. Bem-vindo ao SUMMER!" };
}

/** Quem já entrou com o e-mail do convite: vira membro e passa a usar a empresa do convite. */
export async function aceitarConviteAcao(token: unknown): Promise<ResultadoAcao<ResultadoAceiteConvite>> {
  if (typeof token !== "string") return { ok: false, mensagem: MENSAGEM_CONVITE_INVALIDO };
  if (!(await consumirLimiteConvite())) return { ok: false, mensagem: MENSAGEM_LIMITE_CONVITE };
  const sessao = await obterSessao();
  if (!sessao) return { ok: false, mensagem: "Entre com a sua conta para aceitar o convite." };

  const origem = await origemDaRequisicao();
  let aceito;
  try {
    aceito = await withTransaction((tx) =>
      aceitarConviteContaExistente(tx, { token, usuarioId: sessao.usuario.id, origem }),
    );
  } catch (erro) {
    return falha(erro, "aceite com conta existente");
  }

  if (aceito.empresaId) {
    await trocarEmpresaAtiva(db, {
      sessaoId: sessao.sessaoId,
      usuarioId: sessao.usuario.id,
      empresaId: aceito.empresaId,
    });
  }
  revalidatePath("/", "layout");
  return { ok: true, dados: { destino: "/" }, mensagem: "Convite aceito." };
}
