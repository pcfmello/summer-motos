/**
 * Leitura das variáveis de ambiente da autenticação (sem `server-only`, para os
 * testes). As constantes de rota, usadas também no navegador, ficam em
 * `@/lib/rotas-auth`.
 *
 * Nada aqui é `NEXT_PUBLIC_`: o segredo nunca vai ao navegador.
 */

import { isIP } from "node:net";

export { PARAM_DESTINO, PREFIXO_COOKIE, ROTA_LOGIN, destinoSeguro } from "@/lib/rotas-auth";

const TAMANHO_MINIMO_SEGREDO = 32;

function duranteBuild(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/** Produção de verdade: `NODE_ENV=production` fora do `next build`. */
function emProducao(): boolean {
  return process.env.NODE_ENV === "production" && !duranteBuild();
}

/** Lista separada por vírgula, sem itens vazios. */
export function lerLista(valor: string | undefined): string[] {
  return (valor ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Segredo de assinatura dos cookies. Falha ao subir se faltar ou for curto,
 * exceto no `next build`, que avalia os módulos sem o ambiente de execução.
 */
export function lerSegredo(): string | undefined {
  const segredo = process.env.BETTER_AUTH_SECRET;
  if (duranteBuild()) return segredo;
  if (!segredo || segredo.length < TAMANHO_MINIMO_SEGREDO) {
    throw new Error(
      `BETTER_AUTH_SECRET ausente ou com menos de ${TAMANHO_MINIMO_SEGREDO} caracteres (gere com: openssl rand -base64 32)`,
    );
  }
  return segredo;
}

/** URL pública do app. Em produção, só HTTPS (os cookies de sessão são `Secure`). */
export function lerUrlBase(): string | undefined {
  const url = process.env.BETTER_AUTH_URL;
  if (duranteBuild()) return url;
  if (!url) throw new Error("BETTER_AUTH_URL não está definida (ver .env.example)");
  if (emProducao() && !url.startsWith("https://")) {
    throw new Error("BETTER_AUTH_URL precisa ser https:// em produção");
  }
  return url;
}

/** `advanced.useSecureCookies`: cookies `Secure` (e prefixo `__Secure-`) em produção. */
export function usarCookiesSeguros(): boolean {
  return process.env.NODE_ENV === "production";
}

function ipOuCidr(valor: string): boolean {
  const [ip, prefixo, ...resto] = valor.split("/");
  if (resto.length || !ip) return false;
  const versao = isIP(ip);
  if (!versao) return false;
  if (prefixo === undefined) return true;
  const n = Number.parseInt(prefixo, 10);
  return /^\d{1,3}$/.test(prefixo) && n >= 0 && n <= (versao === 4 ? 32 : 128);
}

/**
 * Proxies reversos confiáveis (IP ou CIDR) à frente do app: com eles, o limite
 * de tentativas lê o IP real do cliente no `x-forwarded-for` (o primeiro, da
 * direita para a esquerda, que não é proxy). Em produção é obrigatória: sem
 * ela, o Better Auth só aceita `x-forwarded-for` de valor único e, se não
 * achar o IP, o limite por IP deixa de valer (ver `./limites.ts`).
 */
export function lerProxiesConfiaveis(): string[] {
  if (duranteBuild()) return [];
  const lista = lerLista(process.env.BETTER_AUTH_TRUSTED_PROXIES);
  const invalidos = lista.filter((item) => !ipOuCidr(item));
  if (invalidos.length) {
    throw new Error(`BETTER_AUTH_TRUSTED_PROXIES tem item que não é IP nem CIDR: ${invalidos.join(", ")}`);
  }
  if (emProducao() && lista.length === 0) {
    throw new Error(
      "BETTER_AUTH_TRUSTED_PROXIES vazia em produção: informe a rede do proxy (ex.: a sub-rede da rede Docker do Coolify)",
    );
  }
  return lista;
}
