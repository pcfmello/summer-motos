/**
 * Numeração sequencial por empresa (regra 4.11, D009, modelo 1.8 e 10.1).
 *
 * `server/servicos/*` é a camada de operações de banco reaproveitadas por
 * actions, worker e scripts: recebem o `tx` de quem chama (nunca abrem
 * transação própria) e o contexto, sem `server-only` e sem `'use server'`.
 * Não são chamáveis pelo navegador.
 *
 * Imports só relativos (sem `@/`), para o worker poder empacotá-los (D020).
 */
import { sql } from "drizzle-orm";

import type { Transacao } from "../db/conexao";
import { CHAVES_SEQUENCIA } from "../db/schema";

export type ChaveSequencia = (typeof CHAVES_SEQUENCIA)[number];

/** O EAN interno é `200` + 9 dígitos + DV (regra 4.7): o sequencial cabe em 9 dígitos. */
export const MAXIMO_SEQUENCIAL_EAN = 999_999_999;

/**
 * Próximo número da sequência `chave` na empresa do contexto.
 *
 * Roda **dentro da transação do documento** (`withTransaction`): o UPDATE trava
 * a linha da sequência até o commit, então transações simultâneas da mesma
 * empresa saem em fila e cada uma recebe um número diferente. Se a transação do
 * documento for desfeita, o incremento também é, e não sobra buraco.
 *
 * A linha nasce com a empresa; se faltar, é criada aqui sem corrida
 * (`INSERT ... ON CONFLICT DO NOTHING` antes do UPDATE: quem perde a corrida do
 * INSERT espera o commit do outro e segue para o UPDATE).
 *
 * Para `produto`, quem gera o código ainda precisa pular os códigos que já
 * existem (digitados à mão ou importados do TeraSoft), regra 4.7.
 */
export async function proximoNumero(
  tx: Transacao,
  ctx: { empresaId: string },
  chave: ChaveSequencia,
): Promise<number> {
  if (!CHAVES_SEQUENCIA.includes(chave)) throw new Error(`Chave de sequência desconhecida: ${String(chave)}`);

  await tx.execute(sql`
    insert into sequencias (empresa_id, chave)
    values (${ctx.empresaId}, ${chave})
    on conflict (empresa_id, chave) do nothing
  `);
  const resultado = await tx.execute<{ ultimo_valor: string | number }>(sql`
    update sequencias
       set ultimo_valor = ultimo_valor + 1
     where empresa_id = ${ctx.empresaId} and chave = ${chave}
    returning ultimo_valor
  `);
  const linha = resultado.rows[0];
  if (!linha) throw new Error(`Sequência "${chave}" não encontrada para a empresa`);

  // bigint chega como string pelo pg; a numeração cabe com folga num inteiro seguro
  const numero = Number(linha.ultimo_valor);
  if (!Number.isSafeInteger(numero) || numero < 1) throw new Error(`Valor inválido na sequência "${chave}"`);
  if (chave === "ean" && numero > MAXIMO_SEQUENCIAL_EAN) {
    throw new Error("A sequência de EAN interno chegou ao limite de 9 dígitos");
  }
  return numero;
}
