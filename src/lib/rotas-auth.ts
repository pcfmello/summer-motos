/**
 * Constantes e regras de rota da autenticação, usadas no servidor, no `proxy.ts`
 * e no formulário de login (navegador). Sem segredo e sem variável de ambiente.
 */

/** Prefixo dos cookies do Better Auth (`summer.session_token`; `__Secure-` em HTTPS). */
export const PREFIXO_COOKIE = "summer";

/** Rota da tela de login e o parâmetro que guarda para onde voltar. */
export const ROTA_LOGIN = "/login";
export const PARAM_DESTINO = "de";

/**
 * Destino depois do login: só caminhos internos (`/produtos?x=1`). Recusa URL
 * absoluta, `//host`, barra invertida e caracteres de controle (o navegador
 * remove tab e quebra de linha, e `/\t/host` viraria `//host`), a própria tela
 * de login e a API. Confere a origem depois de interpretar a URL.
 */
export function destinoSeguro(valor: string | null | undefined): string {
  if (!valor || /[\u0000-\u001F\u007F\\]/.test(valor)) return "/";
  if (!valor.startsWith("/") || valor.startsWith("//")) return "/";
  try {
    const base = "http://interno.invalid";
    const url = new URL(valor, base);
    if (url.origin !== base) return "/";
    if (url.pathname === ROTA_LOGIN || url.pathname.startsWith("/api/")) return "/";
    const destino = url.pathname + url.search + url.hash;
    // A normalização de "." e ".." (inclusive %2e) pode recriar "//host".
    if (!destino.startsWith("/") || destino.startsWith("//") || destino.includes("\\")) return "/";
    return destino;
  } catch {
    return "/";
  }
}
