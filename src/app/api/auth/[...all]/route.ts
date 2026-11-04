/**
 * Rotas do Better Auth (`/api/auth/*`): login, logout e sessão.
 * O limite de tentativas do login é aplicado aqui (só no roteador HTTP do
 * Better Auth; chamadas `auth.api.*` no servidor não passam por ele).
 */
import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";

export const { GET, POST } = toNextJsHandler(auth);
