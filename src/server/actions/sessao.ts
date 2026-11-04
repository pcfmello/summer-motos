"use server";

/**
 * Actions da sessão: trocar a empresa ativa e sair.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { errosDoZod, type ResultadoAcao } from "@/components/formulario/resultado-acao";
import { auth } from "@/server/auth/auth";
import { ROTA_LOGIN } from "@/server/auth/configuracao";
import { obterSessao } from "@/server/auth/contexto";
import { trocarEmpresaAtiva } from "@/server/auth/contexto-nucleo";
import { db } from "@/server/db";

const esquemaTroca = z.object({ empresaId: z.uuid("Empresa inválida.") });

const MENSAGEM_TROCA_RECUSADA =
  "Não foi possível abrir esta empresa. Atualize a página; se continuar, fale com o dono da loja.";

/**
 * Troca a empresa ativa da sessão.
 *
 * **Exceção única e explícita à regra "empresaId nunca vem do cliente":** aqui
 * o `empresaId` é justamente a escolha do usuário. Ele não é usado para ler nem
 * gravar dado de negócio: só vira `sessoes.empresa_ativa_id` depois de conferido,
 * na mesma instrução do UPDATE, contra `membros` (membro ativo, empresa ativa,
 * tenant `ativo`). A partir daí, `getContext()` revalida tudo a cada requisição.
 * Em caso de recusa, a mensagem não diz se a empresa existe.
 *
 * Sucesso: redireciona para o início, porque a página atual pode ser de um
 * registro da outra empresa.
 */
export async function trocarEmpresa(empresaId: string): Promise<ResultadoAcao> {
  const entrada = esquemaTroca.safeParse({ empresaId });
  if (!entrada.success) return { ok: false, erros: errosDoZod(entrada.error), mensagem: MENSAGEM_TROCA_RECUSADA };

  const sessao = await obterSessao();
  if (!sessao) redirect(ROTA_LOGIN);

  const trocou = await trocarEmpresaAtiva(db, {
    sessaoId: sessao.sessaoId,
    usuarioId: sessao.usuario.id,
    empresaId: entrada.data.empresaId,
  });
  if (!trocou) return { ok: false, mensagem: MENSAGEM_TROCA_RECUSADA };

  revalidatePath("/", "layout");
  redirect("/");
}

/** Encerra a sessão (apaga a linha em `sessoes` e o cookie) e volta ao login. */
export async function sair(): Promise<void> {
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    // sessão já expirada ou cookie inválido: o resultado é o mesmo (sem sessão)
  }
  redirect(ROTA_LOGIN);
}
