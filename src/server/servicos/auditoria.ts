/**
 * Registro de auditoria (regra 4.11, modelo 10.2). A tabela é append-only (D008).
 *
 * Grava sempre na transação de quem chama, junto com a mudança auditada: se a
 * mudança for desfeita, o registro também é.
 *
 * Os JSON `antes`/`depois` passam por `limparParaAuditoria`, que **remove** em
 * qualquer nível os campos sensíveis (`pin`, `pin_hash`, `*_cifrado`, `hash`,
 * senhas, tokens, segredos, chaves de API e privadas, `Authorization`,
 * certificado e CSC), em `snake_case` ou `camelCase`, e os binários (`bytea`).
 * Opcionalmente, `campos` restringe o registro a uma lista de colunas permitidas.
 */
import { Decimal as DecimalBase } from "decimal.js";

import type { Transacao } from "../db/conexao";
import { auditoria } from "../db/schema";

/**
 * Catálogo de ações (modelo 10.2). Sem CHECK no banco: uma ação nova entra aqui.
 * A reabertura de OS não existe (D018-P3).
 */
export const ACOES_AUDITORIA = [
  "preco_alterado",
  "custo_alterado",
  "ajuste_estoque",
  "venda_cancelada",
  "desconto_acima_limite",
  "codigo_alterado",
  "comissao_alterada",
  "acerto_comissao",
  "canal_config_alterada",
  // plataforma e acesso (área /admin e membros)
  "tenant_criado",
  "tenant_suspenso",
  "tenant_reativado",
  "empresa_criada",
  "modulos_alterados",
  "membro_criado",
  "convite_criado",
  "convite_aceito",
  "convite_revogado",
  "membro_alterado",
  "pin_definido",
  "pin_bloqueado",
] as const;
export type AcaoAuditoria = (typeof ACOES_AUDITORIA)[number];

/** Quem fez. `usuario: null` = o sistema (worker, scripts). */
export type ContextoAuditoria = {
  empresaId: string;
  usuario: { id: string } | null;
};

export type EntradaAuditoria = {
  /** Nome da tabela (`produtos`, `vendas`…). */
  entidade: string;
  entidadeId: string;
  acao: AcaoAuditoria;
  antes?: Record<string, unknown> | null;
  depois?: Record<string, unknown> | null;
  /** Usuário do dono que digitou o PIN (membro desta empresa, FK no banco). */
  autorizadoPor?: string | null;
  ip?: string | null;
  /** Lista de colunas permitidas. Sem ela, grava tudo menos os campos sensíveis. */
  campos?: readonly string[];
};

/** Nomes de campo que nunca entram na auditoria (comparados sem `_`/`-` e em minúsculas). */
const SENSIVEIS_EXATOS = new Set(["pin", "pinhash", "hash", "password", "senha", "token", "secret", "segredo"]);
/**
 * Trechos que tornam um nome de campo sensível: `focus_token_cifrado`,
 * `senhaCertificado`, `api_chave_hash`, `apiKey`, `chave_privada`,
 * `Authorization`, `certificado_a1`, `csc_token`…
 */
const SENSIVEIS_TRECHOS = [
  "cifrad",
  "hash",
  "senha",
  "password",
  "token",
  "secret",
  "segredo",
  "apikey",
  "apichave",
  "privat",
  "privad",
  "authorization",
  "certificado",
  "csc",
];
/** Exceções: metadados públicos que contêm um trecho sensível no nome. */
const NAO_SENSIVEIS = new Set(["certificadovalidade", "certificadoenviadoem", "cscid"]);

export function campoSensivel(nome: string): boolean {
  const normalizado = nome.toLowerCase().replace(/[_\-\s]/g, "");
  if (NAO_SENSIVEIS.has(normalizado)) return false;
  return SENSIVEIS_EXATOS.has(normalizado) || SENSIVEIS_TRECHOS.some((t) => normalizado.includes(t));
}

const PROFUNDIDADE_MAXIMA = 8;

function limparValor(valor: unknown, profundidade: number): unknown {
  if (valor === null || valor === undefined) return null;
  if (profundidade > PROFUNDIDADE_MAXIMA) return "[profundidade máxima]";
  if (typeof valor === "bigint") return valor.toString();
  if (typeof valor === "number" || typeof valor === "string" || typeof valor === "boolean") return valor;
  if (valor instanceof Date) return valor.toISOString();
  if (DecimalBase.isDecimal(valor)) return (valor as DecimalBase).toString();
  // bytea (segredos cifrados) e binários em geral nunca vão para a auditoria
  if (Buffer.isBuffer(valor) || valor instanceof Uint8Array || valor instanceof ArrayBuffer) return undefined;
  if (Array.isArray(valor)) return valor.map((item) => limparValor(item, profundidade + 1) ?? null);
  if (typeof valor === "object") {
    const resultado: Record<string, unknown> = {};
    for (const [chave, item] of Object.entries(valor as Record<string, unknown>)) {
      if (campoSensivel(chave)) continue;
      const limpo = limparValor(item, profundidade + 1);
      if (limpo !== undefined) resultado[chave] = limpo;
    }
    return resultado;
  }
  return undefined; // funções, símbolos
}

/** Copia o objeto sem campos sensíveis (e só com `campos`, se informado). */
export function limparParaAuditoria(
  dados: Record<string, unknown> | null | undefined,
  campos?: readonly string[],
): Record<string, unknown> | null {
  if (!dados) return null;
  const permitidos = campos ? new Set(campos) : null;
  const origem = permitidos
    ? Object.fromEntries(Object.entries(dados).filter(([chave]) => permitidos.has(chave)))
    : dados;
  return limparValor(origem, 0) as Record<string, unknown>;
}

export async function registrarAuditoria(
  tx: Transacao,
  ctx: ContextoAuditoria,
  entrada: EntradaAuditoria,
): Promise<{ id: string }> {
  const [linha] = await tx
    .insert(auditoria)
    .values({
      empresaId: ctx.empresaId,
      usuarioId: ctx.usuario?.id ?? null,
      autorizadoPor: entrada.autorizadoPor ?? null,
      entidade: entrada.entidade,
      entidadeId: entrada.entidadeId,
      acao: entrada.acao,
      antes: limparParaAuditoria(entrada.antes, entrada.campos),
      depois: limparParaAuditoria(entrada.depois, entrada.campos),
      ip: entrada.ip ?? null,
    })
    .returning({ id: auditoria.id });
  if (!linha) throw new Error("Falha ao gravar a auditoria");
  return linha;
}
