/**
 * Cliente do Better Auth no navegador. Só faz login: chama
 * `POST /api/auth/sign-in/email`, que passa pelo limite de tentativas do
 * Better Auth (as chamadas `auth.api.*` no servidor não passam). O logout é a
 * server action `sair`.
 */
import { createAuthClient } from "better-auth/client";

export const authCliente = createAuthClient();
