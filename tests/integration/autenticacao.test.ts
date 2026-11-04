/**
 * Autenticação e contexto (fatia 0.6): `getContext()`, `exigirContexto()`,
 * `exigirAdminPlataforma()` e a action `trocarEmpresa`, com o Better Auth real
 * lendo a sessão do banco `summer_test`.
 *
 * O login HTTP não é exercitado aqui: a sessão é criada direto em `sessoes` e o
 * cookie é assinado com o segredo (`_sessao.ts`). Só `headers()` do Next, o
 * `server-only` e o `revalidatePath` são simulados.
 */
import { and, eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const estado = vi.hoisted(() => {
  // o `db` do app (src/server/db) lê DATABASE_URL ao carregar: aponta para o banco de teste
  try {
    process.loadEnvFile(".env"); // local; no CI as variáveis vêm do workflow
  } catch {}
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  return { cookie: "" };
});

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: async () => new Headers(estado.cookie ? { cookie: estado.cookie } : {}),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { trocarEmpresa } from "../../src/server/actions/sessao";
import { exigirAdminPlataforma, exigirContexto, getContext, listarEmpresasDaSessao } from "../../src/server/auth/contexto";
import { pool as poolApp } from "../../src/server/db";
import { empresas, membros, sessoes, tenants, usuarios } from "../../src/server/db/schema";
import { limparTabelas } from "./_banco";
import { abrirBanco, criarEmpresa, criarMembro, criarTenant, criarUsuario } from "./_cenario";
import { assinarToken, criarSessao } from "./_sessao";

const { pool, db } = abrirBanco();

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

beforeEach(async () => {
  estado.cookie = "";
  await limparTabelas(pool);
});

/** Executa e devolve o destino do `redirect()` do Next (ou lança se não redirecionou). */
async function destinoDoRedirect(promessa: Promise<unknown>): Promise<string> {
  try {
    await promessa;
  } catch (erro) {
    const digest = (erro as { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw erro;
  }
  throw new Error("esperava um redirect");
}

async function empresaAtivaDaSessao(sessaoId: string) {
  const [linha] = await db.select({ id: sessoes.empresaAtivaId }).from(sessoes).where(eq(sessoes.id, sessaoId));
  return linha?.id ?? null;
}

/** Tenant X (empresas A e B) e tenant Y (empresa Y1). O usuário é balcão em A e dono em B. */
async function cenario() {
  const x = await criarTenant(db, "Tenant X");
  const y = await criarTenant(db, "Tenant Y");
  const a = await criarEmpresa(db, x.id, "A Moto Peças");
  const b = await criarEmpresa(db, x.id, "B Moto Peças");
  const y1 = await criarEmpresa(db, y.id, "Y Moto Peças");
  const usuario = await criarUsuario(db, "maria@teste.local");
  await criarMembro(db, a.empresa.id, usuario.id, "balcao");
  await criarMembro(db, b.empresa.id, usuario.id, "dono");
  const { sessao, cookie } = await criarSessao(db, usuario.id, { empresaAtivaId: a.empresa.id });
  estado.cookie = cookie;
  return { x, y, a, b, y1, usuario, sessao };
}

describe("getContext()", () => {
  it("devolve usuário, tenant, empresa ativa e o perfil lido de membros", async () => {
    const { x, a, usuario } = await cenario();
    const ctx = await getContext();
    expect(ctx).toMatchObject({
      usuario: { id: usuario.id, email: "maria@teste.local" },
      tenantId: x.id,
      empresaId: a.empresa.id,
      perfil: "balcao",
    });
    expect(ctx?.modulos.balcao).toBe(false); // padrão: módulos desligados
  });

  it("sem cookie, com cookie adulterado ou com sessão vencida: sem contexto", async () => {
    const { usuario } = await cenario();
    estado.cookie = "";
    expect(await getContext()).toBeNull();

    estado.cookie = `summer.session_token=${assinarToken("token-inexistente")}`;
    expect(await getContext()).toBeNull();

    estado.cookie = `summer.session_token=${assinarToken("qualquer", "segredo-errado-com-mais-de-32-caracteres!!")}`;
    expect(await getContext()).toBeNull();

    const vencida = await criarSessao(db, usuario.id, { expiraEm: new Date(Date.now() - 1000) });
    estado.cookie = vencida.cookie;
    expect(await getContext()).toBeNull();
  });

  it("troca de perfil vale na hora", async () => {
    const { a, usuario } = await cenario();
    expect((await getContext())?.perfil).toBe("balcao");
    await db
      .update(membros)
      .set({ perfil: "estoque" })
      .where(and(eq(membros.empresaId, a.empresa.id), eq(membros.usuarioId, usuario.id)));
    expect((await getContext())?.perfil).toBe("estoque");
  });

  it("membro desativado perde o acesso imediatamente (cai para a outra empresa dele)", async () => {
    const { a, b, usuario, sessao } = await cenario();
    expect((await getContext())?.empresaId).toBe(a.empresa.id);

    await db
      .update(membros)
      .set({ ativo: false })
      .where(and(eq(membros.empresaId, a.empresa.id), eq(membros.usuarioId, usuario.id)));

    const ctx = await getContext();
    expect(ctx?.empresaId).toBe(b.empresa.id);
    expect(ctx?.perfil).toBe("dono");
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(b.empresa.id);
    expect((await listarEmpresasDaSessao()).map((e) => e.empresaId)).toEqual([b.empresa.id]);

    // sem nenhum membro ativo, não há contexto
    await db.update(membros).set({ ativo: false }).where(eq(membros.usuarioId, usuario.id));
    expect(await getContext()).toBeNull();
    expect(await destinoDoRedirect(exigirContexto())).toBe("/sem-acesso");
  });

  it("empresa desativada bloqueia", async () => {
    const { a, b } = await cenario();
    await db.update(empresas).set({ ativo: false }).where(eq(empresas.id, a.empresa.id));
    expect((await getContext())?.empresaId).toBe(b.empresa.id);
    await db.update(empresas).set({ ativo: false }).where(eq(empresas.id, b.empresa.id));
    expect(await getContext()).toBeNull();
  });

  it("tenant suspenso bloqueia todas as empresas dele", async () => {
    const { x } = await cenario();
    await db.update(tenants).set({ status: "suspenso" }).where(eq(tenants.id, x.id));
    expect(await getContext()).toBeNull();
  });

  it("sessão sem empresa ativa: escolhe a primeira válida e grava na sessão", async () => {
    const { a, usuario } = await cenario();
    const nova = await criarSessao(db, usuario.id);
    estado.cookie = nova.cookie;
    const ctx = await getContext();
    // ordem por nome exibido: "A Moto Peças" antes de "B Moto Peças"
    expect(ctx?.empresaId).toBe(a.empresa.id);
    expect(await empresaAtivaDaSessao(nova.sessao.id)).toBe(a.empresa.id);
  });

  it("lista as empresas de tenants diferentes em que o usuário é membro ativo", async () => {
    const { a, b, y1, usuario } = await cenario();
    await criarMembro(db, y1.empresa.id, usuario.id, "estoque");
    const lista = await listarEmpresasDaSessao();
    expect(lista.map((e) => e.empresaId).sort()).toEqual([a.empresa.id, b.empresa.id, y1.empresa.id].sort());
  });

  it("sem sessão, exigirContexto manda para o login", async () => {
    expect(await destinoDoRedirect(exigirContexto())).toBe("/login");
  });
});

describe("admin da plataforma", () => {
  it("sem membro não obtém contexto de empresa; vai para /admin", async () => {
    const admin = await criarUsuario(db, "admin@teste.local");
    await db.update(usuarios).set({ adminPlataforma: true }).where(eq(usuarios.id, admin.id));
    const t = await criarTenant(db, "Qualquer");
    await criarEmpresa(db, t.id, "Empresa alheia");
    estado.cookie = (await criarSessao(db, admin.id)).cookie;

    expect(await getContext()).toBeNull();
    expect(await listarEmpresasDaSessao()).toEqual([]);
    expect(await destinoDoRedirect(exigirContexto())).toBe("/admin");
    expect(await exigirAdminPlataforma()).toMatchObject({ id: admin.id, adminPlataforma: true });
  });

  it("a flag é lida a cada requisição; usuário comum não entra no /admin", async () => {
    const { usuario } = await cenario();
    expect(await destinoDoRedirect(exigirAdminPlataforma())).toBe("/");
    await db.update(usuarios).set({ adminPlataforma: true }).where(eq(usuarios.id, usuario.id));
    expect((await exigirAdminPlataforma()).id).toBe(usuario.id);
  });

  it("sem sessão, /admin manda para o login", async () => {
    expect(await destinoDoRedirect(exigirAdminPlataforma())).toBe("/login");
  });
});

describe("trocarEmpresa", () => {
  it("troca para uma empresa em que é membro ativo e vale na hora", async () => {
    const { b, sessao } = await cenario();
    expect(await destinoDoRedirect(trocarEmpresa(b.empresa.id))).toBe("/");
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(b.empresa.id);
    expect(await getContext()).toMatchObject({ empresaId: b.empresa.id, perfil: "dono" });
  });

  it("recusa empresa do mesmo tenant da qual não é membro (A × B)", async () => {
    const { x, a, sessao } = await cenario();
    const c = await criarEmpresa(db, x.id, "C Moto Peças");
    const resultado = await trocarEmpresa(c.empresa.id);
    expect(resultado).toMatchObject({ ok: false });
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
  });

  it("recusa empresa de outro tenant (X × Y)", async () => {
    const { a, y1, sessao } = await cenario();
    expect(await trocarEmpresa(y1.empresa.id)).toMatchObject({ ok: false });
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
  });

  it("recusa membro desativado, empresa desativada e tenant suspenso", async () => {
    const { y, a, b, y1, usuario, sessao } = await cenario();
    await criarMembro(db, y1.empresa.id, usuario.id, "dono");

    await db
      .update(membros)
      .set({ ativo: false })
      .where(and(eq(membros.empresaId, b.empresa.id), eq(membros.usuarioId, usuario.id)));
    expect(await trocarEmpresa(b.empresa.id)).toMatchObject({ ok: false });

    await db.update(tenants).set({ status: "suspenso" }).where(eq(tenants.id, y.id));
    expect(await trocarEmpresa(y1.empresa.id)).toMatchObject({ ok: false });

    await db.update(tenants).set({ status: "ativo" }).where(eq(tenants.id, y.id));
    await db.update(empresas).set({ ativo: false }).where(eq(empresas.id, y1.empresa.id));
    expect(await trocarEmpresa(y1.empresa.id)).toMatchObject({ ok: false });

    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
  });

  it("recusa id malformado e exige sessão", async () => {
    await cenario();
    expect(await trocarEmpresa("nao-e-uuid")).toMatchObject({ ok: false });
    estado.cookie = "";
    expect(await destinoDoRedirect(trocarEmpresa(crypto.randomUUID()))).toBe("/login");
  });

  it("não altera a sessão de outro usuário", async () => {
    const { b } = await cenario();
    const outro = await criarUsuario(db, "joao@teste.local");
    await criarMembro(db, b.empresa.id, outro.id, "balcao");
    const sessaoOutro = await criarSessao(db, outro.id, { empresaAtivaId: b.empresa.id });
    await destinoDoRedirect(trocarEmpresa(b.empresa.id));
    expect(await empresaAtivaDaSessao(sessaoOutro.sessao.id)).toBe(b.empresa.id);
    const [contagem] = await db.select({ id: sessoes.id }).from(sessoes).where(eq(sessoes.userId, outro.id));
    expect(contagem).toBeDefined();
  });
});
