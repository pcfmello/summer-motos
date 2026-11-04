/**
 * Cliente do Better Auth no navegador: login e troca de senha ("Minha conta"). Chama
 * `POST /api/auth/sign-in/email` e `/change-password`, que passam pelo limite de tentativas do
 * Better Auth (as chamadas `auth.api.*` no servidor não passam). O logout é a
 * server action `sair`.
 */
import { createAuthClient } from "better-auth/client";

export const authCliente = createAuthClient();
