/**
 * Limites de tentativas da autenticação, em memória no processo do app (modelo
 * 1.9). Com mais de uma réplica, cada uma conta à parte; aí os dois limites
 * passam para o banco numa migração aditiva.
 *
 * 1. **Por IP + rota** (`criarArmazenamentoLimite`): é o `customStorage` do
 *    rate limit do Better Auth. Igual ao armazenamento em memória dele, com uma
 *    diferença: quando o Better Auth não consegue determinar o IP do cliente,
 *    ele usa a chave `no-trusted-ip|<rota>`, um balde **compartilhado por todos**
 *    (um atacante bloquearia o login da loja inteira). Esse balde não é contado:
 *    nesse caso vale só o limite por e-mail. Em produção, `BETTER_AUTH_TRUSTED_PROXIES`
 *    é obrigatória, então o IP só fica indeterminado por erro de configuração.
 * 2. **Por e-mail** (`criarLimitePorEmail`): falhas de login por conta, contra
 *    tentativa e erro distribuída em vários IPs. Resposta igual à do limite por
 *    IP (429 genérico), sem revelar se a conta existe.
 */

export type Relogio = () => number;

/**
 * Prefixo que o Better Auth 1.7.16 usa quando não acha o IP
 * (`api/rate-limiter`: `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`).
 * Um teste confere o valor; se a versão mudar, ele avisa.
 */
export const CHAVE_IP_INDETERMINADO = "no-trusted-ip";

type Balde = { contagem: number; expiraEm: number };

/** Acima disso, a próxima operação varre os baldes vencidos (memória limitada). */
const LIMITE_VARREDURA = 10_000;

function varrer(baldes: Map<string, Balde>, agora: number) {
  if (baldes.size < LIMITE_VARREDURA) return;
  for (const [chave, balde] of baldes) if (balde.expiraEm <= agora) baldes.delete(chave);
}

let avisouIpIndeterminado = false;

/** `rateLimit.customStorage` do Better Auth (interface `consume` atômica). */
export function criarArmazenamentoLimite(relogio: Relogio = Date.now) {
  const baldes = new Map<string, Balde>();
  return {
    async consume(chave: string, regra: { window: number; max: number }) {
      if (chave.startsWith(`${CHAVE_IP_INDETERMINADO}|`)) {
        if (!avisouIpIndeterminado) {
          console.warn("[auth] IP do cliente indeterminado: limite por IP ignorado (confira BETTER_AUTH_TRUSTED_PROXIES)");
          avisouIpIndeterminado = true;
        }
        return { allowed: true, retryAfter: null };
      }
      const agora = relogio();
      varrer(baldes, agora);
      const balde = baldes.get(chave);
      if (!balde || balde.expiraEm <= agora) {
        baldes.set(chave, { contagem: 1, expiraEm: agora + regra.window * 1000 });
        return { allowed: true, retryAfter: null };
      }
      if (balde.contagem >= regra.max) {
        return { allowed: false, retryAfter: Math.ceil((balde.expiraEm - agora) / 1000) };
      }
      balde.contagem += 1;
      return { allowed: true, retryAfter: null };
    },
  };
}

export const LOGIN_MAXIMO_FALHAS_EMAIL = 10;
export const LOGIN_JANELA_FALHAS_EMAIL_MS = 15 * 60 * 1000;

export function normalizarEmail(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const email = valor.trim().toLowerCase();
  return email || null;
}

/**
 * Falhas de login por e-mail normalizado: `maxFalhas` em `janelaMs` (contados
 * a partir da primeira falha) bloqueiam até a janela vencer. Um acerto limpa.
 */
export function criarLimitePorEmail(
  opcoes: { maxFalhas?: number; janelaMs?: number; relogio?: Relogio } = {},
) {
  const maxFalhas = opcoes.maxFalhas ?? LOGIN_MAXIMO_FALHAS_EMAIL;
  const janelaMs = opcoes.janelaMs ?? LOGIN_JANELA_FALHAS_EMAIL_MS;
  const relogio = opcoes.relogio ?? Date.now;
  const baldes = new Map<string, Balde>();

  return {
    /** Segundos até liberar, ou `null` se o e-mail pode tentar. */
    bloqueado(email: unknown): number | null {
      const chave = normalizarEmail(email);
      if (!chave) return null;
      const agora = relogio();
      const balde = baldes.get(chave);
      if (!balde || balde.expiraEm <= agora || balde.contagem < maxFalhas) return null;
      return Math.ceil((balde.expiraEm - agora) / 1000);
    },
    registrarFalha(email: unknown): void {
      const chave = normalizarEmail(email);
      if (!chave) return;
      const agora = relogio();
      varrer(baldes, agora);
      const balde = baldes.get(chave);
      if (!balde || balde.expiraEm <= agora) baldes.set(chave, { contagem: 1, expiraEm: agora + janelaMs });
      else balde.contagem += 1;
    },
    limpar(email: unknown): void {
      const chave = normalizarEmail(email);
      if (chave) baldes.delete(chave);
    },
  };
}
