/**
 * PIN de aprovação do dono (seção 3; D19 do modelo; `membros.pin_hash`).
 *
 * - Um PIN por membro dono, guardado com o mesmo hash lento do Better Auth
 *   (scrypt, `better-auth/crypto`), nunca em texto e nunca na auditoria.
 * - Validação contra **os donos da empresa ativa** (ou um dono específico, se a
 *   tela pedir para escolher). Devolve quem autorizou, para a auditoria
 *   (`autorizado_por`).
 * - Bloqueio: 5 erros seguidos bloqueiam o PIN por 15 minutos (`pin_falhas`,
 *   `pin_bloqueado_ate`), contados na transação, com as linhas travadas. No 3º
 *   bloqueio seguido sem acerto (`pin_bloqueios`), só o dono desbloqueia,
 *   redefinindo o PIN. Os bloqueios são auditados.
 *
 * Sem `server-only` e com imports relativos: usado pelas actions (Entrega 3),
 * pelo seed e pelos testes.
 */
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { z } from "zod";

import type { Transacao, WithTransaction } from "../db/conexao";
import { membros, usuarios } from "../db/schema";
import { registrarAuditoria } from "../servicos/auditoria";
import type { Perfil } from "./permissoes";

export const PIN_MAXIMO_FALHAS = 5;
export const PIN_BLOQUEIO_MS = 15 * 60 * 1000;
/** No 3º bloqueio seguido sem um acerto, só o próprio dono desbloqueia (redefinindo o PIN). */
export const PIN_MAXIMO_BLOQUEIOS = 3;

/** 6 a 8 dígitos (escolha conservadora: a seção 3 não fixa o tamanho). */
export const esquemaPin = z.string().regex(/^\d{6,8}$/, "O PIN tem de 6 a 8 números.");

type ContextoPin = { empresaId: string; usuario: { id: string }; perfil: Perfil };

export type ResultadoDefinirPin = { ok: true } | { ok: false; motivo: "sem_permissao" | "pin_invalido" };

/**
 * Define (ou troca) o PIN do próprio usuário, que precisa ser dono ativo da
 * empresa do contexto. Zera falhas, bloqueio e bloqueios seguidos (é também o
 * desbloqueio definitivo). Registra auditoria, sem o PIN.
 */
export async function definirPin(tx: Transacao, ctx: ContextoPin, pin: string): Promise<ResultadoDefinirPin> {
  if (ctx.perfil !== "dono") return { ok: false, motivo: "sem_permissao" };
  const entrada = esquemaPin.safeParse(pin);
  if (!entrada.success) return { ok: false, motivo: "pin_invalido" };

  const pinHash = await hashPassword(entrada.data);
  const [membro] = await tx
    .update(membros)
    .set({ pinHash, pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 })
    .where(
      and(
        eq(membros.empresaId, ctx.empresaId),
        eq(membros.usuarioId, ctx.usuario.id),
        eq(membros.perfil, "dono"),
        eq(membros.ativo, true),
      ),
    )
    .returning({ id: membros.id });
  if (!membro) return { ok: false, motivo: "sem_permissao" };

  await registrarAuditoria(tx, ctx, {
    entidade: "membros",
    entidadeId: membro.id,
    acao: "pin_definido",
    depois: { pin_definido: true },
  });
  return { ok: true };
}

export type ResultadoValidarPin =
  | { ok: true; autorizadoPor: { usuarioId: string; membroId: string; nome: string } }
  /**
   * PIN errado, PIN fora do formato, dono inexistente e empresa sem dono com
   * PIN dão a mesma resposta: a tela não revela qual foi o caso. O detalhe vai
   * só para o log do servidor.
   */
  | { ok: false; motivo: "pin_invalido" }
  /** `bloqueadoAte: null` = bloqueio definitivo, até o dono redefinir o PIN. */
  | { ok: false; motivo: "bloqueado"; bloqueadoAte: Date | null };

export type EntradaValidarPin = {
  pin: string;
  /** Data/hora de referência do bloqueio (o domínio não lê o relógio escondido). */
  agora: Date;
  /** Restringe a um dono específico. Sem ele, vale o PIN de qualquer dono da empresa. */
  donoUsuarioId?: string;
};

/** Contexto de quem está tentando (vai para a auditoria do bloqueio). `usuario: null` = sistema. */
export type ContextoValidarPin = { empresaId: string; usuario?: { id: string } | null };

const INVALIDO = { ok: false, motivo: "pin_invalido" } as const;

function registrarNoLog(motivo: string, ctx: ContextoValidarPin) {
  // sem PIN, hash ou dono tentado: só o suficiente para investigar
  console.warn(`[pin] recusado (${motivo}) empresa=${ctx.empresaId} usuario=${ctx.usuario?.id ?? "sistema"}`);
}

/**
 * Valida o PIN contra os donos ativos (com PIN) da empresa do contexto.
 *
 * Roda na **sua própria transação** (recebe o `withTransaction`), separada da
 * venda: o contador de falhas precisa ser gravado mesmo quando a validação
 * falha e mesmo que a venda seja desfeita depois.
 *
 * - Erro: soma uma falha em **cada** dono candidato livre (a tentativa pode ter
 *   mirado qualquer um deles). Na 5ª, bloqueia por 15 minutos, zera as falhas e
 *   soma um bloqueio seguido (auditado).
 * - No 3º bloqueio seguido sem acerto, o bloqueio é definitivo: o PIN daquele
 *   dono só volta quando ele o redefinir (`definirPin`).
 * - Acerto: zera falhas e bloqueios só do dono que autorizou.
 */
export async function validarPinDono(
  withTransaction: WithTransaction,
  ctx: ContextoValidarPin,
  entrada: EntradaValidarPin,
): Promise<ResultadoValidarPin> {
  if (entrada.donoUsuarioId !== undefined && !z.uuid().safeParse(entrada.donoUsuarioId).success) {
    registrarNoLog("dono_malformado", ctx);
    return INVALIDO;
  }
  const agora = entrada.agora.getTime();

  return withTransaction(async (tx) => {
    const filtros = [
      eq(membros.empresaId, ctx.empresaId),
      eq(membros.perfil, "dono"),
      eq(membros.ativo, true),
      isNotNull(membros.pinHash),
    ];
    if (entrada.donoUsuarioId) filtros.push(eq(membros.usuarioId, entrada.donoUsuarioId));

    // trava as linhas dos donos em ordem fixa (usuario_id), para não haver deadlock
    const donos = await tx
      .select({
        membroId: membros.id,
        usuarioId: membros.usuarioId,
        nome: usuarios.name,
        pinHash: membros.pinHash,
        pinFalhas: membros.pinFalhas,
        pinBloqueadoAte: membros.pinBloqueadoAte,
        pinBloqueios: membros.pinBloqueios,
      })
      .from(membros)
      .innerJoin(usuarios, eq(usuarios.id, membros.usuarioId))
      .where(and(...filtros))
      .orderBy(asc(membros.usuarioId))
      .for("update", { of: membros });

    if (donos.length === 0) {
      registrarNoLog("sem_pin_cadastrado", ctx);
      return INVALIDO;
    }

    const definitivo = (d: (typeof donos)[number]) => d.pinBloqueios >= PIN_MAXIMO_BLOQUEIOS;
    const temporario = (d: (typeof donos)[number]) =>
      !definitivo(d) && d.pinBloqueadoAte !== null && d.pinBloqueadoAte.getTime() > agora;
    const livres = donos.filter((d) => !definitivo(d) && !temporario(d));
    if (livres.length === 0) {
      const temporarios = donos.filter(temporario).map((d) => d.pinBloqueadoAte!.getTime());
      const bloqueadoAte = temporarios.length ? new Date(Math.min(...temporarios)) : null;
      return { ok: false, motivo: "bloqueado", bloqueadoAte } as const;
    }

    let autorizou: (typeof livres)[number] | undefined;
    if (esquemaPin.safeParse(entrada.pin).success) {
      for (const dono of livres) {
        if (await verifyPassword({ hash: dono.pinHash!, password: entrada.pin })) {
          autorizou = dono;
          break;
        }
      }
    }

    if (autorizou) {
      await tx
        .update(membros)
        .set({ pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 })
        .where(and(eq(membros.id, autorizou.membroId), eq(membros.empresaId, ctx.empresaId)));
      return {
        ok: true,
        autorizadoPor: { usuarioId: autorizou.usuarioId, membroId: autorizou.membroId, nome: autorizou.nome },
      } as const;
    }

    for (const dono of livres) {
      const falhas = dono.pinFalhas + 1;
      if (falhas < PIN_MAXIMO_FALHAS) {
        await tx
          .update(membros)
          .set({ pinFalhas: falhas, pinBloqueadoAte: null })
          .where(and(eq(membros.id, dono.membroId), eq(membros.empresaId, ctx.empresaId)));
        continue;
      }
      const bloqueios = dono.pinBloqueios + 1;
      const ate = new Date(agora + PIN_BLOQUEIO_MS);
      await tx
        .update(membros)
        .set({ pinFalhas: 0, pinBloqueadoAte: ate, pinBloqueios: bloqueios })
        .where(and(eq(membros.id, dono.membroId), eq(membros.empresaId, ctx.empresaId)));
      await registrarAuditoria(
        tx,
        { empresaId: ctx.empresaId, usuario: ctx.usuario ?? null },
        {
          entidade: "membros",
          entidadeId: dono.membroId,
          acao: "pin_bloqueado",
          depois: {
            definitivo: bloqueios >= PIN_MAXIMO_BLOQUEIOS,
            bloqueios_seguidos: bloqueios,
            bloqueado_ate: bloqueios >= PIN_MAXIMO_BLOQUEIOS ? null : ate,
          },
        },
      );
    }
    registrarNoLog("pin_incorreto", ctx);
    return INVALIDO;
  });
}
