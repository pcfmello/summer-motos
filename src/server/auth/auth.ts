/**
 * Configuração do Better Auth (e-mail e senha). Conferido com o better-auth
 * 1.7.16 instalado (D002, modelo 1.9).
 *
 * - Tabelas em português, mapeadas no adapter do Drizzle pela chave do modelo
 *   (`user` → `usuarios`…). As propriedades do schema Drizzle têm o nome do
 *   Better Auth (`emailVerified`), então não há `fields` a mapear.
 * - `admin_plataforma` e `empresa_ativa_id` são `additionalFields` com
 *   `input: false`: nenhuma rota pública os aceita do cliente. A empresa ativa
 *   só muda pela action `trocarEmpresa`, que confere `membros`.
 * - Cadastro público desligado: usuários nascem pelo `/admin` ou por script
 *   (`criarUsuarioComSenha`).
 * - `cookieCache` desligado: cada leitura da sessão vai ao banco, então revogar
 *   a sessão ou desativar o membro vale na próxima requisição.
 * - Limites de tentativas, **em memória no processo do app** (modelo 1.9;
 *   `./limites.ts`): por IP + rota (rate limit do Better Auth, com armazenamento
 *   próprio que não cria balde compartilhado quando o IP é indeterminado) e por
 *   e-mail no login (10 falhas em 15 minutos, hooks abaixo). Com mais de uma
 *   réplica do app, cada uma conta à parte; aí os limites passam para o banco
 *   numa migração aditiva.
 * - Em produção: `BETTER_AUTH_URL` https, cookies `Secure` e
 *   `BETTER_AUTH_TRUSTED_PROXIES` obrigatória (falha ao subir sem elas).
 */
import "server-only";

import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware, isAPIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { db } from "@/server/db";
import { contasAcesso, sessoes, usuarios, verificacoes } from "@/server/db/schema";

import {
  PREFIXO_COOKIE,
  lerLista,
  lerProxiesConfiaveis,
  lerSegredo,
  lerUrlBase,
  usarCookiesSeguros,
} from "./configuracao";
import { criarArmazenamentoLimite, criarLimitePorEmail } from "./limites";

const MINUTO = 60;
const DIA = 24 * 60 * MINUTO;

/**
 * Rotas do Better Auth que o SUMMER não usa. Desligadas para reduzir superfície:
 * cadastro público, edição de usuário e de sessão pelo cliente, exclusão de conta
 * e login social (o OAuth do Mercado Livre fica em `canais_venda`, não aqui).
 */
const ROTAS_DESLIGADAS = [
  "/sign-up/email",
  "/update-user",
  "/update-session",
  "/change-email",
  "/delete-user",
  "/delete-user/callback",
  "/sign-in/social",
  "/link-social",
  "/unlink-account",
  "/list-accounts",
  "/account-info",
  "/get-access-token",
  "/refresh-token",
];

const armazenamentoLimite = criarArmazenamentoLimite();
const limitePorEmail = criarLimitePorEmail();

const ROTA_LOGIN_EMAIL = "/sign-in/email";
/** Igual à resposta do limite por IP do Better Auth: não revela que o limite é por conta. */
const MENSAGEM_LIMITE = "Too many requests. Please try again later.";

/** Antes do login: e-mail com falhas demais recebe 429, mesmo com a senha certa. */
const antesDoLogin = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== ROTA_LOGIN_EMAIL) return;
  const espera = limitePorEmail.bloqueado((ctx.body as { email?: unknown } | undefined)?.email);
  if (espera !== null) {
    throw new APIError("TOO_MANY_REQUESTS", { message: MENSAGEM_LIMITE }, { "X-Retry-After": String(espera) });
  }
});

/** Depois do login: credencial errada (401) conta uma falha do e-mail; acerto zera. */
const depoisDoLogin = createAuthMiddleware(async (ctx) => {
  if (ctx.path !== ROTA_LOGIN_EMAIL) return;
  const email = (ctx.body as { email?: unknown } | undefined)?.email;
  const retorno = ctx.context.returned;
  if (isAPIError(retorno)) {
    if (retorno.statusCode === 401) limitePorEmail.registrarFalha(email);
  } else if (retorno !== undefined) {
    limitePorEmail.limpar(email);
  }
});

export const auth = betterAuth({
  appName: "SUMMER",
  baseURL: lerUrlBase(),
  secret: lerSegredo(),
  /** A origem do `baseURL` já é confiável; aqui entram as demais (lista em variável). */
  trustedOrigins: lerLista(process.env.BETTER_AUTH_TRUSTED_ORIGINS),
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user: usuarios, session: sessoes, account: contasAcesso, verification: verificacoes },
  }),
  user: {
    additionalFields: {
      adminPlataforma: { type: "boolean", required: false, defaultValue: false, input: false },
    },
    // usuários nunca são apagados (modelo 2.4); troca de e-mail só pelo admin
    deleteUser: { enabled: false },
    changeEmail: { enabled: false },
  },
  session: {
    expiresIn: 7 * DIA,
    updateAge: DIA,
    cookieCache: { enabled: false },
    additionalFields: {
      empresaAtivaId: { type: "string", required: false, input: false },
    },
  },
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    // convites usam link de uso único próprio (tabela convites, D033); a redefinição por e-mail fica para quando houver envio de e-mail
  },
  account: { accountLinking: { enabled: false } },
  rateLimit: {
    enabled: true,
    customStorage: armazenamentoLimite,
    window: MINUTO,
    max: 100,
    customRules: {
      "/sign-in/email": { window: MINUTO, max: 10 }, // a loja inteira costuma sair pelo mesmo IP
      "/request-password-reset": { window: 15 * MINUTO, max: 3 },
      "/reset-password": { window: 15 * MINUTO, max: 5 },
      "/change-password": { window: 15 * MINUTO, max: 5 },
    },
  },
  hooks: { before: antesDoLogin, after: depoisDoLogin },
  disabledPaths: ROTAS_DESLIGADAS,
  telemetry: { enabled: false },
  advanced: {
    cookiePrefix: PREFIXO_COOKIE,
    useSecureCookies: usarCookiesSeguros(),
    database: { generateId: "uuid" },
    ipAddress: {
      // Atrás do proxy do Coolify (Traefik). Com a lista de proxies confiáveis, o
      // IP do cliente é o primeiro da direita que não é proxy; sem ela, só um
      // `x-forwarded-for` de valor único é aceito.
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: lerProxiesConfiaveis(),
    },
  },
  // nextCookies grava os cookies quando a API é chamada de uma server action (sair); fica por último
  plugins: [nextCookies()],
});

export type SessaoBetterAuth = typeof auth.$Infer.Session;
