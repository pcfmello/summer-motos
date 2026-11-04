/**
 * Acesso a uma OS pelo perfil (seção 3; D018-P9).
 *
 * - A OS precisa ser da empresa ativa e o módulo `os` estar ligado.
 * - Dono e balcão (`os.ver_todas`) acessam qualquer OS da empresa.
 * - O mecânico (`os.ver_proprias`) só acessa a OS de que é o responsável **ou**
 *   em que executou algum serviço não removido. "Ele" é o cadastro ativo em
 *   `mecanicos` ligado ao usuário (`mecanicos.usuario_id`) nesta empresa.
 * - Não encontrada e não permitida dão o mesmo erro (`registro`), para não
 *   revelar que a OS existe.
 *
 * Sem `server-only` e com imports relativos (worker e testes). Toda action e
 * query que recebe um `osId` do cliente passa por aqui antes de usá-lo.
 */
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import type { Transacao } from "../db/conexao";
import { ordensServico } from "../db/schema";
import { ErroAcessoNegado, exigirModulo, pode, type ContextoAcesso } from "./permissoes";

export type ContextoOS = ContextoAcesso & { empresaId: string; usuario: { id: string } };

const esquemaId = z.uuid();

/**
 * Devolve a OS (id, status e responsável) se o contexto puder acessá-la; senão
 * lança `ErroAcessoNegado`. Com `travar`, a linha da OS fica com `FOR UPDATE`
 * até o fim da transação (mudança de status, lançamento de itens).
 */
export async function exigirAcessoOS(
  tx: Transacao,
  ctx: ContextoOS,
  osId: string,
  opcoes: { travar?: boolean } = {},
) {
  exigirModulo(ctx, "os");
  const veTodas = pode(ctx.perfil, "os.ver_todas");
  if (!veTodas && !pode(ctx.perfil, "os.ver_proprias")) throw new ErroAcessoNegado("perfil", "os.ver_proprias");
  if (!esquemaId.safeParse(osId).success) throw new ErroAcessoNegado("registro", "ordens_servico");

  const doMecanico = sql`exists (
    select 1 from mecanicos m
     where m.empresa_id = ${ctx.empresaId}
       and m.usuario_id = ${ctx.usuario.id}
       and m.ativo
       and (
         m.id = ${ordensServico.mecanicoResponsavelId}
         or exists (
           select 1 from os_itens i
            where i.empresa_id = ${ctx.empresaId}
              and i.ordem_servico_id = ${ordensServico.id}
              and i.mecanico_id = m.id
              and i.tipo = 'servico'
              and i.removido_em is null
         )
       )
  )`;

  const consulta = tx
    .select({
      id: ordensServico.id,
      numero: ordensServico.numero,
      status: ordensServico.status,
      mecanicoResponsavelId: ordensServico.mecanicoResponsavelId,
    })
    .from(ordensServico)
    .where(
      and(
        eq(ordensServico.empresaId, ctx.empresaId),
        eq(ordensServico.id, osId),
        veTodas ? undefined : doMecanico,
      ),
    );
  const [os] = opcoes.travar ? await consulta.for("update") : await consulta;
  if (!os) throw new ErroAcessoNegado("registro", "ordens_servico");
  return os;
}
