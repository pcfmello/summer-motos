/**
 * Convite por link de uso único (D033): criação, leitura, aceite com conta nova
 * e com conta existente, uso único sob concorrência, vencido, revogado, outra
 * conta, PIN zerado na reativação e token fora da auditoria.
 *
 * As actions da página `/convite/[token]` rodam com o Better Auth real; só
 * `headers()`/`cookies()`, `server-only` e `revalidatePath` são simulados.
 */
import { verifyPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => {
  try {
    process.loadEnvFile(".env"); // local; no CI as variáveis vêm do workflow
  } catch {}
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  return { cookie: "" };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(estado.cookie ? { cookie: estado.cookie } : {}),
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { aceitarConviteAcao, aceitarConviteNovaContaAcao } from "../../src/server/actions/convites";
import { criarUsuarioComSenha } from "../../src/server/auth/usuarios";
import { pool as poolApp } from "../../src/server/db";
import { auditoria, contasAcesso, convites, membros, sessoes, usuarios } from "../../src/server/db/schema";
import { calcularDigitosCnpj } from "../../src/server/domain/documentos";
import {
  MENSAGEM_CONVITE_INVALIDO,
  aceitarConviteContaExistente,
  aceitarConviteNovaConta,
  convidarDono,
  criarConvite,
  criarConviteAdminPlataforma,
  hashDoToken,
  lerConviteValido,
  linkDoConvite,
} from "../../src/server/servicos/convites";
import { adicionarMembro, criarEmpresa, criarTenant } from "../../src/server/servicos/empresas";
import { limparTabelas } from "./_banco";
import { abrirBanco } from "./_cenario";
import { criarSessao } from "./_sessao";

const { pool, db, withTransaction } = abrirBanco();

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

beforeEach(async () => {
  estado.cookie = "";
  await limparTabelas(pool);
});

let base = 0;
function cnpjValido(): string {
  base += 1;
  const corpo = `9${String(base).padStart(11, "0")}`;
  return corpo + calcularDigitosCnpj(corpo);
}

async function empresaNova(nome = "Loja Convite") {
  return withTransaction(async (tx) => {
    const tenant = await criarTenant(tx, { nome: `${nome} ${base}` });
    return criarEmpresa(tx, {
      tenantId: tenant.id,
      razaoSocial: `${nome} Ltda`,
      nomeFantasia: nome,
      cnpj: cnpjValido(),
      regimeTributario: "simples_nacional",
      usuario: null,
    });
  });
}

async function erroDe(promessa: Promise<unknown>): Promise<unknown> {
  return promessa.then(
    () => {
      throw new Error("esperava um erro");
    },
    (erro: unknown) => erro,
  );
}

const convidar = (empresaId: string, email: string) =>
  withTransaction((tx) => convidarDono(tx, { empresaId, email, usuario: null }));

describe("criação do convite", () => {
  it("guarda só o SHA-256 do token; o token (256 bits) vai no link e nunca na auditoria", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, " Ana@Loja.com ");
    expect(convite.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(linkDoConvite("https://summer.exemplo", convite.token)).toBe(`https://summer.exemplo/convite/${convite.token}`);

    const [linha] = await db.select().from(convites).where(eq(convites.id, convite.conviteId));
    expect(linha).toMatchObject({ tipo: "empresa", email: "ana@loja.com", perfil: "dono", tokenHash: hashDoToken(convite.token) });
    expect(JSON.stringify(linha)).not.toContain(convite.token);
    const dias = (linha!.expiraEm.getTime() - linha!.createdAt.getTime()) / 86_400_000;
    expect(dias).toBeCloseTo(7, 3);

    const registros = await db.select().from(auditoria).where(eq(auditoria.acao, "convite_criado"));
    expect(registros).toHaveLength(1);
    const texto = JSON.stringify(registros);
    expect(texto).not.toContain(convite.token);
    expect(texto).not.toContain(linha!.tokenHash);
  });

  it("não consulta nem cria usuário: e-mail novo e existente geram o mesmo tipo de resultado", async () => {
    const a = await empresaNova("Loja A");
    const b = await empresaNova("Loja B");
    await criarUsuarioComSenha(db, { nome: "Existente", email: "existe@loja.com", senha: "senha-forte-123" });
    const existente = await convidar(a.empresa.id, "existe@loja.com");
    const novo = await convidar(b.empresa.id, "novo@loja.com");
    expect(Object.keys(existente).sort()).toEqual(Object.keys(novo).sort());
    expect(await db.select().from(membros)).toEqual([]);
    expect(await db.select().from(usuarios).where(eq(usuarios.email, "novo@loja.com"))).toEqual([]);
  });

  it("convidar de novo o mesmo e-mail revoga o anterior (o link velho deixa de valer)", async () => {
    const criada = await empresaNova();
    const velho = await convidar(criada.empresa.id, "ana@loja.com");
    const novo = await convidar(criada.empresa.id, "ana@loja.com");
    expect(await lerConviteValido(db, velho.token)).toBeNull();
    expect(await lerConviteValido(db, novo.token)).toMatchObject({ email: "ana@loja.com", contaExiste: false });
    const erro = await erroDe(withTransaction((tx) => aceitarConviteNovaConta(tx, { token: velho.token, nome: "Ana", senha: "senha-forte-123" })));
    expect(erro).toMatchObject({ codigo: "convite_invalido", message: MENSAGEM_CONVITE_INVALIDO });
  });

  it("o admin não convida dono em empresa com membro desativado (primeiro dono de verdade)", async () => {
    const criada = await empresaNova();
    const antigo = await criarUsuarioComSenha(db, { nome: "Antigo", email: "antigo@loja.com", senha: "senha-forte-123" });
    const { membroId } = await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: antigo.id, perfil: "balcao", usuario: null }),
    );
    await db.update(membros).set({ ativo: false }).where(eq(membros.id, membroId));
    const erro = await erroDe(convidar(criada.empresa.id, "novo@loja.com"));
    expect(erro).toMatchObject({ codigo: "empresa_com_dono", message: expect.stringMatching(/dono da loja/) });
    expect(await db.select().from(convites)).toEqual([]);
  });

  it("corrida: convidar outro e-mail enquanto o aceite do primeiro está em andamento é recusado", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, "ana@loja.com");

    let liberar!: () => void;
    const portao = new Promise<void>((resolve) => (liberar = resolve));
    let aceiteNoMeio!: () => void;
    const noMeio = new Promise<void>((resolve) => (aceiteNoMeio = resolve));
    const aceite = withTransaction(async (tx) => {
      const r = await aceitarConviteNovaConta(tx, { token: convite.token, nome: "Ana", senha: "minha-senha-123" });
      aceiteNoMeio();
      await portao; // segura o commit
      return r;
    });
    await noMeio;
    const outro = erroDe(convidar(criada.empresa.id, "intruso@loja.com"));
    setTimeout(liberar, 300);
    const [erro] = await Promise.all([outro, aceite]);

    // antes do commit vê o convite pendente; depois, o membro: recusa nos dois casos
    expect((erro as { codigo: string }).codigo).toMatch(/^(convite_pendente|empresa_com_dono)$/);
    expect(await db.select().from(convites).where(eq(convites.email, "intruso@loja.com"))).toEqual([]);
    expect(await db.select().from(membros).where(eq(membros.empresaId, criada.empresa.id))).toHaveLength(1);
  });

  it("o admin não convida um segundo dono", async () => {
    const criada = await empresaNova();
    const dono = await criarUsuarioComSenha(db, { nome: "Dono", email: "dono@loja.com", senha: "senha-forte-123" });
    await withTransaction((tx) => adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: dono.id, perfil: "dono", usuario: null }));
    const erro = await erroDe(convidar(criada.empresa.id, "socio@loja.com"));
    expect(erro).toMatchObject({ codigo: "empresa_com_dono" });
    expect(await db.select().from(convites)).toEqual([]);
  });
});

describe("aceite", () => {
  it("token de formato inválido é recusado sem consultar o banco", async () => {
    const semBanco = new Proxy({} as Parameters<typeof lerConviteValido>[0], {
      get() {
        throw new Error("não deveria consultar o banco");
      },
    });
    for (const token of ["", "curto", "A".repeat(44), "A".repeat(42) + "=", 123, null]) {
      expect(await lerConviteValido(semBanco, token)).toBeNull();
      await expect(aceitarConviteNovaConta(semBanco as never, { token, nome: "X", senha: "senha-forte-123" })).rejects.toMatchObject({
        codigo: "convite_invalido",
      });
      await expect(aceitarConviteContaExistente(semBanco as never, { token, usuarioId: "x" })).rejects.toMatchObject({
        codigo: "convite_invalido",
      });
    }
  });

  it("conta nova: e-mail não verificado e auditoria com IP truncado e user-agent abreviado", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, "ana@loja.com");
    const ua = `Mozilla/5.0 (X11; Linux x86_64) ${"Gecko ".repeat(40)}`;
    await withTransaction((tx) =>
      aceitarConviteNovaConta(tx, {
        token: convite.token,
        nome: "Ana",
        senha: "minha-senha-123",
        origem: { ip: "203.0.113.57", userAgent: ua },
      }),
    );
    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, "ana@loja.com"));
    expect(usuario!.emailVerified).toBe(false);
    const [registro] = await db.select().from(auditoria).where(eq(auditoria.acao, "convite_aceito"));
    expect(registro!.ip).toBe("203.0.113.0/24");
    expect(registro!.depois).toMatchObject({
      perfil_convite: "dono",
      perfil_efetivo: "dono",
      vinculo_alterado: true,
      user_agent: expect.stringMatching(/^Mozilla\/5\.0 \(X11; Linux x86_64\)/),
    });
    expect(((registro!.depois as { user_agent: string }).user_agent).length).toBeLessThanOrEqual(120);
  });

  it("membro já ativo com outro perfil: o vínculo não muda e a auditoria grava o perfil efetivo", async () => {
    const criada = await empresaNova();
    const bia = await criarUsuarioComSenha(db, { nome: "Bia", email: "bia@loja.com", senha: "senha-forte-123" });
    await withTransaction((tx) => adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: bia.id, perfil: "balcao", usuario: null }));
    const convite = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: criada.empresa.id, email: "bia@loja.com", perfil: "dono", usuario: null }),
    );
    await withTransaction((tx) =>
      aceitarConviteContaExistente(tx, { token: convite.token, usuarioId: bia.id, origem: { ip: "2001:db8:abcd:12::1", userAgent: "UA" } }),
    );
    const [membro] = await db.select().from(membros).where(eq(membros.usuarioId, bia.id));
    expect(membro).toMatchObject({ perfil: "balcao", ativo: true });
    const [registro] = await db.select().from(auditoria).where(eq(auditoria.acao, "convite_aceito"));
    expect(registro!.ip).toBe("2001:db8:abcd::/48");
    expect(registro!.depois).toMatchObject({ perfil_convite: "dono", perfil_efetivo: "balcao", vinculo_alterado: false });
  });

  it("conta nova: cria o usuário com a senha escolhida, o membro dono e marca o convite como aceito", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, "ana@loja.com");
    const aceito = await withTransaction((tx) =>
      aceitarConviteNovaConta(tx, { token: convite.token, nome: "Ana Dona", senha: "minha-senha-123" }),
    );
    expect(aceito).toMatchObject({ email: "ana@loja.com", tipo: "empresa", empresaId: criada.empresa.id });

    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, "ana@loja.com"));
    expect(usuario).toMatchObject({ id: aceito.usuarioId, name: "Ana Dona", adminPlataforma: false });
    const [conta] = await db.select().from(contasAcesso).where(eq(contasAcesso.userId, usuario!.id));
    expect(await verifyPassword({ hash: conta!.password!, password: "minha-senha-123" })).toBe(true);
    const [membro] = await db.select().from(membros).where(eq(membros.usuarioId, usuario!.id));
    expect(membro).toMatchObject({ empresaId: criada.empresa.id, perfil: "dono", ativo: true });
    const [linha] = await db.select().from(convites).where(eq(convites.id, convite.conviteId));
    expect(linha!.aceitoEm).not.toBeNull();
    expect(linha!.aceitoPor).toBe(usuario!.id);

    // uso único
    expect(await lerConviteValido(db, convite.token)).toBeNull();
    const erro = await erroDe(withTransaction((tx) => aceitarConviteNovaConta(tx, { token: convite.token, nome: "X", senha: "outra-senha-123" })));
    expect(erro).toMatchObject({ codigo: "convite_invalido" });

    const acoes = (await db.select({ acao: auditoria.acao }).from(auditoria).where(eq(auditoria.empresaId, criada.empresa.id))).map((a) => a.acao);
    expect(acoes).toEqual(expect.arrayContaining(["convite_criado", "membro_criado", "convite_aceito"]));
    expect(JSON.stringify(await db.select().from(auditoria))).not.toContain(convite.token);
  });

  it("dois aceites em paralelo do mesmo link: só um cria conta e membro", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, "ana@loja.com");
    const resultados = await Promise.allSettled(
      [1, 2].map((n) =>
        withTransaction((tx) => aceitarConviteNovaConta(tx, { token: convite.token, nome: `Ana ${n}`, senha: "minha-senha-123" })),
      ),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const recusa = resultados.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(recusa.reason).toMatchObject({ codigo: "convite_invalido" });
    expect(await db.select().from(usuarios).where(eq(usuarios.email, "ana@loja.com"))).toHaveLength(1);
    expect(await db.select().from(membros).where(eq(membros.empresaId, criada.empresa.id))).toHaveLength(1);
  });

  it("conta existente em paralelo (duas abas): um membro só", async () => {
    const criada = await empresaNova();
    const bia = await criarUsuarioComSenha(db, { nome: "Bia", email: "bia@loja.com", senha: "senha-forte-123" });
    const convite = await convidar(criada.empresa.id, "bia@loja.com");
    const resultados = await Promise.allSettled(
      [1, 2].map(() => withTransaction((tx) => aceitarConviteContaExistente(tx, { token: convite.token, usuarioId: bia.id }))),
    );
    expect(resultados.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(await db.select().from(membros).where(eq(membros.usuarioId, bia.id))).toHaveLength(1);
  });

  it("vencido e revogado: inválidos, com a mesma mensagem", async () => {
    const criada = await empresaNova();
    const vencido = await convidar(criada.empresa.id, "velho@loja.com");
    await db.update(convites).set({ expiraEm: new Date(Date.now() - 1000) }).where(eq(convites.id, vencido.conviteId));
    expect(await lerConviteValido(db, vencido.token)).toBeNull();
    const erroVencido = await erroDe(withTransaction((tx) => aceitarConviteNovaConta(tx, { token: vencido.token, nome: "X", senha: "senha-forte-123" })));
    expect(erroVencido).toMatchObject({ codigo: "convite_invalido", message: MENSAGEM_CONVITE_INVALIDO });

    // o vencido não bloqueia um convite novo de outro e-mail
    const novo = await convidar(criada.empresa.id, "novo@loja.com");
    await db.update(convites).set({ revogadoEm: new Date() }).where(eq(convites.id, novo.conviteId));
    const erroRevogado = await erroDe(withTransaction((tx) => aceitarConviteNovaConta(tx, { token: novo.token, nome: "X", senha: "senha-forte-123" })));
    expect(erroRevogado).toMatchObject({ codigo: "convite_invalido", message: MENSAGEM_CONVITE_INVALIDO });

    expect(await lerConviteValido(db, "malformado")).toBeNull();
    expect(await lerConviteValido(db, "A".repeat(43))).toBeNull();
    expect(await db.select().from(usuarios)).toEqual([]);
  });

  it("logado com outro e-mail: recusado, e o convite continua pendente", async () => {
    const criada = await empresaNova();
    await criarUsuarioComSenha(db, { nome: "Ana", email: "ana@loja.com", senha: "senha-forte-123" });
    const outro = await criarUsuarioComSenha(db, { nome: "Outro", email: "outro@loja.com", senha: "senha-forte-123" });
    const convite = await convidar(criada.empresa.id, "ana@loja.com");
    const erro = await erroDe(withTransaction((tx) => aceitarConviteContaExistente(tx, { token: convite.token, usuarioId: outro.id })));
    expect(erro).toMatchObject({ codigo: "convite_invalido", message: MENSAGEM_CONVITE_INVALIDO });
    expect(await lerConviteValido(db, convite.token)).toMatchObject({ contaExiste: true });
    expect(await db.select().from(membros)).toEqual([]);
  });

  it("e-mail que já tem conta não cria outra pelo formulário de conta nova", async () => {
    const criada = await empresaNova();
    await criarUsuarioComSenha(db, { nome: "Ana", email: "ana@loja.com", senha: "senha-forte-123" });
    const convite = await convidar(criada.empresa.id, "ana@loja.com");
    const erro = await erroDe(withTransaction((tx) => aceitarConviteNovaConta(tx, { token: convite.token, nome: "Ana 2", senha: "outra-senha-123" })));
    expect(erro).toMatchObject({ codigo: "conta_existente" });
    expect(await lerConviteValido(db, convite.token)).not.toBeNull(); // nada foi gravado
  });

  it("membro desativado que aceita volta com o PIN zerado", async () => {
    const criada = await empresaNova();
    const caio = await criarUsuarioComSenha(db, { nome: "Caio", email: "caio@loja.com", senha: "senha-forte-123" });
    const { membroId } = await withTransaction((tx) =>
      adicionarMembro(tx, { empresaId: criada.empresa.id, usuarioId: caio.id, perfil: "dono", usuario: null }),
    );
    await db
      .update(membros)
      .set({ ativo: false, pinHash: "hash-antigo", pinFalhas: 4, pinBloqueadoAte: new Date(Date.now() + 60_000), pinBloqueios: 2 })
      .where(eq(membros.id, membroId));
    // o admin não convida aqui (a empresa já tem membro): é o convite genérico (do dono da loja, no futuro)
    const convite = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: criada.empresa.id, email: "caio@loja.com", perfil: "dono", usuario: null }),
    );
    await withTransaction((tx) => aceitarConviteContaExistente(tx, { token: convite.token, usuarioId: caio.id }));
    const [membro] = await db.select().from(membros).where(eq(membros.id, membroId));
    expect(membro).toMatchObject({ ativo: true, perfil: "dono", pinHash: null, pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 });
  });

  it("convite genérico (perfil balcão) e convite de admin da plataforma", async () => {
    const criada = await empresaNova();
    const balcao = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: criada.empresa.id, email: "balcao@loja.com", perfil: "balcao", usuario: null }),
    );
    await withTransaction((tx) => aceitarConviteNovaConta(tx, { token: balcao.token, nome: "Bela", senha: "senha-forte-123" }));
    const [membro] = await db.select({ perfil: membros.perfil }).from(membros).where(eq(membros.empresaId, criada.empresa.id));
    expect(membro!.perfil).toBe("balcao");

    const admin = await withTransaction((tx) => criarConviteAdminPlataforma(tx, { email: "Admin@Plataforma.local", usuario: null }));
    expect(await lerConviteValido(db, admin.token)).toMatchObject({ tipo: "admin_plataforma", empresaId: null, perfil: null });
    const aceito = await withTransaction((tx) => aceitarConviteNovaConta(tx, { token: admin.token, nome: "Admin", senha: "senha-admin-123" }));
    expect(aceito.tipo).toBe("admin_plataforma");
    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, "admin@plataforma.local"));
    expect(usuario!.adminPlataforma).toBe(true);
    expect(await db.select().from(membros).where(eq(membros.usuarioId, usuario!.id))).toEqual([]);

    // e-mail com conta não recebe convite de admin; admin não aceita convite de empresa
    const erro = await erroDe(withTransaction((tx) => criarConviteAdminPlataforma(tx, { email: "balcao@loja.com", usuario: null })));
    expect(erro).toMatchObject({ codigo: "email_em_uso" });
    const paraAdmin = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: criada.empresa.id, email: "admin@plataforma.local", perfil: "dono", usuario: null }),
    );
    const recusa = await erroDe(withTransaction((tx) => aceitarConviteContaExistente(tx, { token: paraAdmin.token, usuarioId: usuario!.id })));
    expect(recusa).toMatchObject({ codigo: "convite_invalido" });
  });
});

describe("actions da página /convite/[token]", () => {
  it("conta nova: cria, entra e manda para o início; o mesmo link de novo é recusado", async () => {
    const criada = await empresaNova();
    const convite = await convidar(criada.empresa.id, "ana@loja.com");

    const invalido = await aceitarConviteNovaContaAcao(convite.token, { nome: "Ana", senha: "curta", confirmacao: "x" });
    expect(invalido).toMatchObject({ ok: false, erros: { senha: [expect.any(String)], confirmacao: [expect.any(String)] } });

    const resultado = await aceitarConviteNovaContaAcao(convite.token, {
      nome: "Ana Dona",
      senha: "minha-senha-123",
      confirmacao: "minha-senha-123",
    });
    expect(resultado).toMatchObject({ ok: true, dados: { destino: "/" } });
    const [usuario] = await db.select().from(usuarios).where(eq(usuarios.email, "ana@loja.com"));
    expect(await db.select().from(sessoes).where(eq(sessoes.userId, usuario!.id))).toHaveLength(1); // entrou, sem verificar o e-mail
    expect(usuario!.emailVerified).toBe(false);
    const [registro] = await db.select().from(auditoria).where(eq(auditoria.acao, "convite_aceito"));
    expect(registro!.ip).toMatch(/\/(24|48)$/); // IP do teste (localhost), truncado

    const deNovo = await aceitarConviteNovaContaAcao(convite.token, {
      nome: "Outra",
      senha: "minha-senha-123",
      confirmacao: "minha-senha-123",
    });
    expect(deNovo).toEqual({ ok: false, mensagem: MENSAGEM_CONVITE_INVALIDO });
  });

  it("conta existente: só aceita logado com o e-mail do convite, e a empresa do convite vira a ativa", async () => {
    const atual = await empresaNova("Loja Atual");
    const convidada = await empresaNova("Loja Convidada");
    const bia = await criarUsuarioComSenha(db, { nome: "Bia", email: "bia@loja.com", senha: "senha-forte-123" });
    const outro = await criarUsuarioComSenha(db, { nome: "Outro", email: "outro@loja.com", senha: "senha-forte-123" });
    await withTransaction((tx) => adicionarMembro(tx, { empresaId: atual.empresa.id, usuarioId: bia.id, perfil: "dono", usuario: null }));
    const convite = await convidar(convidada.empresa.id, "bia@loja.com");

    expect(await aceitarConviteAcao(convite.token)).toMatchObject({ ok: false }); // sem sessão

    estado.cookie = (await criarSessao(db, outro.id)).cookie;
    expect(await aceitarConviteAcao(convite.token)).toEqual({ ok: false, mensagem: MENSAGEM_CONVITE_INVALIDO });

    const { sessao, cookie } = await criarSessao(db, bia.id, { empresaAtivaId: atual.empresa.id });
    estado.cookie = cookie;
    expect(await aceitarConviteAcao(convite.token)).toMatchObject({ ok: true, dados: { destino: "/" } });
    const [ativa] = await db.select({ id: sessoes.empresaAtivaId }).from(sessoes).where(eq(sessoes.id, sessao.id));
    expect(ativa!.id).toBe(convidada.empresa.id);
    expect(
      await db.select().from(membros).where(and(eq(membros.usuarioId, bia.id), eq(membros.empresaId, convidada.empresa.id))),
    ).toHaveLength(1);
    expect(await aceitarConviteAcao(convite.token)).toEqual({ ok: false, mensagem: MENSAGEM_CONVITE_INVALIDO });
  });
});
