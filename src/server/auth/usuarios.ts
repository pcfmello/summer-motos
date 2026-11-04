/**
 * Criação de usuário com senha fora das rotas HTTP do Better Auth, que têm o
 * cadastro público desligado. Usada pelo `/admin` (0.10), pelo
 * `scripts/criar-tenant.ts` e pelo seed (0.11).
 *
 * Grava como o Better Auth grava no cadastro por e-mail: `usuarios` + uma conta
 * `credential` em `contas_acesso` com `account_id = user_id` e a senha com o
 * hash do próprio Better Auth (scrypt). Assim o login do Better Auth funciona
 * sem adaptação.
 *
 * Sem `server-only` e com imports relativos (scripts e worker).
 */
import { hashPassword } from "better-auth/crypto";
import { z } from "zod";

import type { Banco, Transacao } from "../db/conexao";
import { contasAcesso, usuarios } from "../db/schema";

/** Mesmos limites de `emailAndPassword` em `./auth.ts`. */
export const SENHA_MINIMO = 10;
export const SENHA_MAXIMO = 128;

export const esquemaNovoUsuario = z.object({
  nome: z.string().trim().min(1, "Informe o nome.").max(120),
  email: z.string().trim().toLowerCase().pipe(z.email("E-mail inválido.")),
  senha: z
    .string()
    .min(SENHA_MINIMO, `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`)
    .max(SENHA_MAXIMO),
});

/**
 * Dados aceitos de um formulário. **Não tem `adminPlataforma`**: campo extra é
 * descartado pelo Zod, então um formulário não cria admin com um campo a mais.
 */
export type NovoUsuario = z.input<typeof esquemaNovoUsuario>;

/** Usuário comum (dono, balcão, estoque, mecânico). Lança se o e-mail já existir (`usuarios_email_key`). */
export function criarUsuarioComSenha(db: Banco | Transacao, dados: NovoUsuario) {
  return gravarUsuario(db, dados, false);
}

/**
 * Admin da plataforma: só por chamada explícita (script de bootstrap ou o
 * próprio `/admin`, por outro admin). A flag dá acesso só ao `/admin`.
 */
export function criarAdminPlataforma(db: Banco | Transacao, dados: NovoUsuario) {
  return gravarUsuario(db, dados, true);
}

async function gravarUsuario(db: Banco | Transacao, dados: NovoUsuario, adminPlataforma: boolean) {
  const entrada = esquemaNovoUsuario.parse(dados);
  const senhaHash = await hashPassword(entrada.senha);
  const [usuario] = await db
    .insert(usuarios)
    .values({
      name: entrada.nome,
      email: entrada.email,
      // criado pelo admin ou por script: o e-mail foi informado por quem administra
      emailVerified: true,
      adminPlataforma,
    })
    .returning({ id: usuarios.id, email: usuarios.email, nome: usuarios.name });
  if (!usuario) throw new Error("Falha ao criar o usuário");
  await db.insert(contasAcesso).values({
    userId: usuario.id,
    accountId: usuario.id,
    providerId: "credential",
    password: senhaHash,
  });
  return usuario;
}
