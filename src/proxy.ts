/**
 * Proxy (o antigo middleware do Next 16): só o redirecionamento rápido de quem
 * chega **sem cookie de sessão** para o login. Não consulta o banco.
 *
 * A checagem de verdade fica no servidor, a cada requisição:
 * - `(app)`: `exigirContexto()` no layout, e `getContext()` em cada action/query;
 * - `/admin`: `exigirAdminPlataforma()`;
 * - `/login`: a própria página manda para o início quem já tem sessão válida
 *   (aqui não, porque um cookie vencido faria o login e o início se mandarem
 *   um para o outro).
 */
import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

import { PARAM_DESTINO, PREFIXO_COOKIE, ROTA_LOGIN } from "@/lib/rotas-auth";

/** Rotas abertas, sem cookie de sessão. */
const ROTAS_PUBLICAS = [ROTA_LOGIN];
/**
 * Prefixos abertos: o convite por link (D033) é aberto por quem ainda não tem
 * conta. A página confere o token no banco e tem limite de tentativas por IP.
 */
const PREFIXOS_PUBLICOS = ["/convite/"];

export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (ROTAS_PUBLICAS.includes(pathname) || PREFIXOS_PUBLICOS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  if (!getSessionCookie(request, { cookiePrefix: PREFIXO_COOKIE })) {
    const destino = new URL(ROTA_LOGIN, request.url);
    if (pathname !== "/") destino.searchParams.set(PARAM_DESTINO, `${pathname}${search}`);
    return NextResponse.redirect(destino);
  }
  return NextResponse.next();
}

export const config = {
  // Fora: API (auth, health, webhooks, v1 e PDF têm a própria autenticação),
  // arquivos do Next, ícones e a pasta pública da marca.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|brand/|.*\\.(?:svg|png|jpg|jpeg|webp|ico|txt|xml)$).*)"],
};
