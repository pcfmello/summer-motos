/**
 * Convites por link de uso único (D033): substituem a senha provisória.
 *
 * - O token tem 256 bits (`randomBytes(32)`, base64url, 43 caracteres) e só
 *   aparece uma vez, no link `/convite/<token>`. O banco guarda o SHA-256 dele
 *   (`convites.token_hash`); a auditoria nunca recebe nem o token nem o hash.
 * - **Criar o convite não consulta usuários:** a resposta e o trabalho feito
 *   são os mesmos para e-mail novo e existente. A diferença só aparece para
 *   quem abre o link (é o próprio convidado).
 * - Convidar de novo o mesmo e-mail na mesma empresa revoga o pendente anterior.
 * - A aceitação é atômica: `UPDATE ... WHERE aceito_em IS NULL AND revogado_em
 *   IS NULL AND expira_em > now() RETURNING`. Dois cliques (ou duas abas) não
 *   criam dois membros: o segundo UPDATE espera o primeiro e não acha a linha.
 *
 * Sem `server-only` e com imports relativos (script, testes), como os demais
 * serviços (D027). O link é montado por quem chama (`linkDoConvite`), com a URL
 * pública do app (`BETTER_AUTH_URL`).
 */
import { createHash, randomBytes } from "node:crypto";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import type { Perfil } from "../auth/permissoes";
import { abreviarUserAgent, truncarIp } from "../domain/plataforma";
import { criarAdminPlataforma, criarUsuarioComSenha } from "../auth/usuarios";
import type { Banco, Transacao } from "../db/conexao";
import { convites, empresas, membros, usuarios } from "../db/schema";
import { registrarAuditoria } from "./auditoria";
import { ErroPlataforma, PIN_ZERADO, type Autor } from "./empresas";

export const VALIDADE_CONVITE_DIAS = 7;
const ROTA_CONVITE = "/convite";

/** Mensagem única para convite inexistente, vencido, revogado, usado ou de outra conta. */
export const MENSAGEM_CONVITE_INVALIDO =
  "Este convite não é válido, já foi usado ou venceu. Peça um novo convite a quem convidou você.";

const FORMATO_TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function gerarTokenConvite(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashDoToken(token)! };
}

/** SHA-256 em hexadecimal; `null` se o texto nem tem o formato de um token. */
export function hashDoToken(token: unknown): string | null {
  if (typeof token !== "string" || !FORMATO_TOKEN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

/** Link público do convite (`<urlBase>/convite/<token>`). */
export function linkDoConvite(urlBase: string, token: string): string {
  return new URL(`${ROTA_CONVITE}/${token}`, urlBase).toString();
}

const pendente = () =>
  and(isNull(convites.aceitoEm), isNull(convites.revogadoEm), gt(convites.expiraEm, sql`now()`));

function invalido(): never {
  throw new ErroPlataforma("convite_invalido", MENSAGEM_CONVITE_INVALIDO);
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export type ConviteCriado = { conviteId: string; token: string; expiraEm: Date };

/**
 * Convite para ser membro da empresa com o perfil dado (genérico: o dono da
 * loja vai usar numa entrega futura). Trava a empresa, revoga o convite
 * pendente do mesmo e-mail e cria outro. Auditoria `convite_criado`, sem token.
 */
export async function criarConvite(
  tx: Transacao,
  entrada: { empresaId: string; email: string; perfil: Perfil; usuario: Autor },
): Promise<ConviteCriado> {
  const email = entrada.email.trim().toLowerCase();
  const [empresa] = await tx
    .select({ id: empresas.id })
    .from(empresas)
    .where(eq(empresas.id, entrada.empresaId))
    .for("update");
  if (!empresa) throw new ErroPlataforma("empresa_inexistente", "Empresa não encontrada.");

  const revogados = await tx
    .update(convites)
    .set({ revogadoEm: sql`now()` })
    .where(
      and(
        eq(convites.empresaId, empresa.id),
        eq(convites.email, email),
        isNull(convites.aceitoEm),
        isNull(convites.revogadoEm),
      ),
    )
    .returning({ id: convites.id });

  const { token, tokenHash } = gerarTokenConvite();
  const [convite] = await tx
    .insert(convites)
    .values({
      tipo: "empresa",
      empresaId: empresa.id,
      email,
      perfil: entrada.perfil,
      tokenHash,
      criadoPor: entrada.usuario?.id ?? null,
      expiraEm: sql`now() + make_interval(days => ${VALIDADE_CONVITE_DIAS})`,
    })
    .returning({ id: convites.id, expiraEm: convites.expiraEm });
  if (!convite) throw new Error("Falha ao criar o convite");

  await registrarAuditoria(
    tx,
    { empresaId: empresa.id, usuario: entrada.usuario },
    {
      entidade: "convites",
      entidadeId: convite.id,
      acao: "convite_criado",
      depois: {
        email,
        perfil: entrada.perfil,
        expira_em: convite.expiraEm,
        revogou_convites: revogados.map((r) => r.id),
      },
    },
  );
  return { conviteId: convite.id, token, expiraEm: convite.expiraEm };
}

/**
 * O admin da plataforma só convida o **primeiro** dono: recusa se a empresa já
 * tem qualquer membro (ativo ou desativado) ou um convite de dono pendente para
 * outro e-mail. Os próximos
 * donos são convidados pelo dono da loja. Convidar de novo o mesmo e-mail
 * revoga o pendente e gera outro link (link perdido).
 *
 * Não consulta `usuarios`: a resposta é a mesma para e-mail novo e existente.
 */
export async function convidarDono(
  tx: Transacao,
  entrada: { empresaId: string; email: string; usuario: Autor },
): Promise<ConviteCriado> {
  const email = entrada.email.trim().toLowerCase();
  const [empresa] = await tx
    .select({ id: empresas.id })
    .from(empresas)
    .where(eq(empresas.id, entrada.empresaId))
    .for("update");
  if (!empresa) throw new ErroPlataforma("empresa_inexistente", "Empresa não encontrada.");

  // qualquer membro, ativo ou não: o admin só convida quando a empresa ainda não tem ninguém
  const [membro] = await tx
    .select({ id: membros.id })
    .from(membros)
    .where(eq(membros.empresaId, empresa.id))
    .limit(1);
  if (membro) {
    throw new ErroPlataforma(
      "empresa_com_dono",
      "Esta empresa já tem dono ou outros membros. Novos donos e membros são convidados pelo dono da loja.",
    );
  }
  const [outro] = await tx
    .select({ id: convites.id })
    .from(convites)
    .where(
      and(
        eq(convites.empresaId, empresa.id),
        eq(convites.perfil, "dono"),
        sql`${convites.email} <> ${email}`,
        pendente(),
      ),
    )
    .limit(1);
  if (outro) {
    throw new ErroPlataforma(
      "convite_pendente",
      "Já existe um convite de dono pendente para esta empresa. Revogue-o antes de convidar outro e-mail; os próximos donos são convidados pelo dono da loja.",
    );
  }
  return criarConvite(tx, { empresaId: empresa.id, email, perfil: "dono", usuario: entrada.usuario });
}

export type ConvitePendenteDono = { conviteId: string; email: string; expiraEm: Date };

/** Convite de dono pendente (não aceito, não revogado, não vencido) da empresa, se houver. */
export async function convitePendenteDeDono(
  db: Banco | Transacao,
  empresaId: string,
): Promise<ConvitePendenteDono | null> {
  const [convite] = await db
    .select({ conviteId: convites.id, email: convites.email, expiraEm: convites.expiraEm })
    .from(convites)
    .where(and(eq(convites.empresaId, empresaId), eq(convites.perfil, "dono"), pendente()))
    .limit(1);
  return convite ?? null;
}

/** Revoga os convites de dono pendentes da empresa (auditoria `convite_revogado`). */
export async function revogarConvitesDeDono(
  tx: Transacao,
  entrada: { empresaId: string; usuario: Autor },
): Promise<number> {
  const revogados = await tx
    .update(convites)
    .set({ revogadoEm: sql`now()` })
    .where(
      and(
        eq(convites.empresaId, entrada.empresaId),
        eq(convites.perfil, "dono"),
        isNull(convites.aceitoEm),
        isNull(convites.revogadoEm),
      ),
    )
    .returning({ id: convites.id, email: convites.email });
  for (const convite of revogados) {
    await registrarAuditoria(
      tx,
      { empresaId: entrada.empresaId, usuario: entrada.usuario },
      { entidade: "convites", entidadeId: convite.id, acao: "convite_revogado", depois: { email: convite.email } },
    );
  }
  return revogados.length;
}

/**
 * Convite para criar a conta de um admin da plataforma (`criar-tenant
 * --admin-plataforma`). Recusa e-mail que já tem conta: a flag de admin só
 * nasce numa conta nova (`criarAdminPlataforma`, D029). Sem empresa, não há
 * onde auditar: o script registra no log.
 */
export async function criarConviteAdminPlataforma(
  tx: Transacao,
  entrada: { email: string; usuario: Autor },
): Promise<ConviteCriado> {
  const email = entrada.email.trim().toLowerCase();
  const [existente] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (existente) {
    throw new ErroPlataforma("email_em_uso", `Já existe uma conta com o e-mail ${email}.`, "email");
  }
  await tx
    .update(convites)
    .set({ revogadoEm: sql`now()` })
    .where(
      and(
        eq(convites.tipo, "admin_plataforma"),
        eq(convites.email, email),
        isNull(convites.aceitoEm),
        isNull(convites.revogadoEm),
      ),
    );
  const { token, tokenHash } = gerarTokenConvite();
  const [convite] = await tx
    .insert(convites)
    .values({
      tipo: "admin_plataforma",
      email,
      tokenHash,
      criadoPor: entrada.usuario?.id ?? null,
      expiraEm: sql`now() + make_interval(days => ${VALIDADE_CONVITE_DIAS})`,
    })
    .returning({ id: convites.id, expiraEm: convites.expiraEm });
  if (!convite) throw new Error("Falha ao criar o convite");
  return { conviteId: convite.id, token, expiraEm: convite.expiraEm };
}

// ---------------------------------------------------------------------------
// Leitura e aceitação
// ---------------------------------------------------------------------------

export type ConviteValido = {
  id: string;
  tipo: "empresa" | "admin_plataforma";
  email: string;
  perfil: Perfil | null;
  empresaId: string | null;
  /** Nome fantasia (ou razão social) da empresa do convite. */
  empresaNome: string | null;
  expiraEm: Date;
  /** Já existe conta com o e-mail do convite (decide entre criar conta e entrar). */
  contaExiste: boolean;
};

/** Convite pendente do token, ou `null` (inexistente, vencido, revogado, aceito ou token malformado). */
export async function lerConviteValido(db: Banco | Transacao, token: unknown): Promise<ConviteValido | null> {
  const tokenHash = hashDoToken(token);
  if (!tokenHash) return null;
  const [convite] = await db
    .select({
      id: convites.id,
      tipo: convites.tipo,
      email: convites.email,
      perfil: convites.perfil,
      empresaId: convites.empresaId,
      empresaNome: sql<string | null>`coalesce(${empresas.nomeFantasia}, ${empresas.razaoSocial})`,
      expiraEm: convites.expiraEm,
      contaExiste: sql<boolean>`exists (select 1 from usuarios u where u.email = "convites"."email")`,
    })
    .from(convites)
    .leftJoin(empresas, eq(empresas.id, convites.empresaId))
    .where(and(eq(convites.tokenHash, tokenHash), pendente()));
  return convite ?? null;
}

/** Marca o convite como aceito, se ainda estiver pendente. Atômico (uso único). */
async function marcarAceito(tx: Transacao, tokenHash: string, filtroExtra?: ReturnType<typeof and>) {
  const [convite] = await tx
    .update(convites)
    .set({ aceitoEm: sql`now()` })
    .where(and(eq(convites.tokenHash, tokenHash), pendente(), filtroExtra))
    .returning({
      id: convites.id,
      tipo: convites.tipo,
      email: convites.email,
      perfil: convites.perfil,
      empresaId: convites.empresaId,
    });
  return convite ?? null;
}

type ConviteAceito = NonNullable<Awaited<ReturnType<typeof marcarAceito>>>;

/**
 * Vínculo do convite aceito: cria o membro; reativa o desativado com o PIN
 * zerado; membro já ativo continua como está (o convite não rebaixa nem promove).
 */
type Vinculo = { membroId: string; perfilEfetivo: Perfil; vinculoAlterado: boolean };

async function vincularMembroDoConvite(tx: Transacao, convite: ConviteAceito, usuarioId: string): Promise<Vinculo> {
  const empresaId = convite.empresaId!;
  const perfil = convite.perfil!;
  const ctx = { empresaId, usuario: { id: usuarioId } };

  const [novo] = await tx
    .insert(membros)
    .values({ empresaId, usuarioId, perfil })
    .onConflictDoNothing({ target: [membros.empresaId, membros.usuarioId] })
    .returning({ id: membros.id });
  if (novo) {
    await registrarAuditoria(tx, ctx, {
      entidade: "membros",
      entidadeId: novo.id,
      acao: "membro_criado",
      depois: { usuario_id: usuarioId, perfil, ativo: true, convite_id: convite.id },
    });
    return { membroId: novo.id, perfilEfetivo: perfil, vinculoAlterado: true };
  }
  const [existente] = await tx
    .select({ id: membros.id, perfil: membros.perfil, ativo: membros.ativo })
    .from(membros)
    .where(and(eq(membros.empresaId, empresaId), eq(membros.usuarioId, usuarioId)))
    .for("update");
  if (!existente) throw new Error("Membro não encontrado depois do conflito");
  if (!existente.ativo) {
    await tx
      .update(membros)
      .set({ ativo: true, perfil, ...PIN_ZERADO })
      .where(and(eq(membros.id, existente.id), eq(membros.empresaId, empresaId)));
    await registrarAuditoria(tx, ctx, {
      entidade: "membros",
      entidadeId: existente.id,
      acao: "membro_alterado",
      antes: { perfil: existente.perfil, ativo: false },
      depois: { perfil, ativo: true, pin_zerado: true, convite_id: convite.id },
    });
    return { membroId: existente.id, perfilEfetivo: perfil, vinculoAlterado: true };
  }
  return { membroId: existente.id, perfilEfetivo: existente.perfil, vinculoAlterado: false };
}

/** De onde veio o aceite (cabeçalhos da requisição). Vai truncado para a auditoria. */
export type OrigemAceite = { ip: string | null; userAgent: string | null };

async function concluirAceite(tx: Transacao, convite: ConviteAceito, usuarioId: string, origem?: OrigemAceite) {
  await tx.update(convites).set({ aceitoPor: usuarioId }).where(eq(convites.id, convite.id));
  if (convite.tipo !== "empresa") return;
  const vinculo = await vincularMembroDoConvite(tx, convite, usuarioId);
  await registrarAuditoria(
    tx,
    { empresaId: convite.empresaId!, usuario: { id: usuarioId } },
    {
      entidade: "convites",
      entidadeId: convite.id,
      acao: "convite_aceito",
      // rede (/24 ou /48), não o endereço; user-agent abreviado
      ip: truncarIp(origem?.ip),
      depois: {
        email: convite.email,
        perfil_convite: convite.perfil,
        perfil_efetivo: vinculo.perfilEfetivo,
        vinculo_alterado: vinculo.vinculoAlterado,
        user_agent: abreviarUserAgent(origem?.userAgent),
      },
    },
  );
}

export type ResultadoAceite = {
  usuarioId: string;
  email: string;
  tipo: "empresa" | "admin_plataforma";
  empresaId: string | null;
};

/**
 * Aceite por quem ainda não tem conta: cria o usuário (ou o admin da
 * plataforma, no convite desse tipo) com o nome e a senha escolhidos e o
 * vincula, numa transação. Se já existir conta com o e-mail, recusa
 * (`conta_existente`): é preciso entrar e aceitar.
 */
export async function aceitarConviteNovaConta(
  tx: Transacao,
  entrada: { token: unknown; nome: string; senha: string; origem?: OrigemAceite },
): Promise<ResultadoAceite> {
  const tokenHash = hashDoToken(entrada.token);
  if (!tokenHash) invalido();
  const convite = await marcarAceito(tx, tokenHash);
  if (!convite) invalido();

  const [existente] = await tx.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, convite.email));
  if (existente) {
    throw new ErroPlataforma(
      "conta_existente",
      "Este e-mail já tem conta no SUMMER. Entre com ela para aceitar o convite.",
    );
  }
  const dados = { nome: entrada.nome, email: convite.email, senha: entrada.senha };
  const usuario =
    convite.tipo === "admin_plataforma"
      ? await criarAdminPlataforma(tx, dados)
      : await criarUsuarioComSenha(tx, dados);
  // a conta nasce pelo link, não por verificação de e-mail (o login não exige verificação)
  await tx.update(usuarios).set({ emailVerified: false }).where(eq(usuarios.id, usuario.id));
  await concluirAceite(tx, convite, usuario.id, entrada.origem);
  return { usuarioId: usuario.id, email: convite.email, tipo: convite.tipo, empresaId: convite.empresaId };
}

/**
 * Aceite por quem já entrou: só vale se o e-mail da sessão for o do convite e
 * o convite for de empresa. Admin da plataforma não vira membro. Qualquer
 * recusa usa a mesma mensagem genérica.
 */
export async function aceitarConviteContaExistente(
  tx: Transacao,
  entrada: { token: unknown; usuarioId: string; origem?: OrigemAceite },
): Promise<ResultadoAceite> {
  const tokenHash = hashDoToken(entrada.token);
  if (!tokenHash) invalido();
  const [usuario] = await tx
    .select({ id: usuarios.id, email: usuarios.email, admin: usuarios.adminPlataforma })
    .from(usuarios)
    .where(eq(usuarios.id, entrada.usuarioId));
  if (!usuario || usuario.admin) invalido();

  const convite = await marcarAceito(
    tx,
    tokenHash,
    and(eq(convites.tipo, "empresa"), eq(convites.email, usuario.email.trim().toLowerCase())),
  );
  if (!convite) invalido();
  await concluirAceite(tx, convite, usuario.id, entrada.origem);
  return { usuarioId: usuario.id, email: convite.email, tipo: convite.tipo, empresaId: convite.empresaId };
}
