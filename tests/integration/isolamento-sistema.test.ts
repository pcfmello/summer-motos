/**
 * Isolamento pelo caminho do sistema (fatia 0.12; regra 4.1; D003, D026, D027,
 * D029, D032, D033). Postgres real (`summer_test`) e o Better Auth real lendo a
 * sessão do banco; só `headers()`, `server-only` e `revalidatePath` são simulados.
 *
 * Auditoria de cobertura: cada garantia de isolamento e o teste que a cobre.
 * "este arquivo" = isolamento-sistema.test.ts.
 *
 * | Garantia                                                                 | Teste (arquivo › nome)                                                                 |
 * | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
 * | getContext confere membro ativo a cada requisição (0.6)                  | autenticacao › "membro desativado perde o acesso imediatamente (cai para a outra…)"     |
 * | getContext confere empresa ativa (0.6)                                   | autenticacao › "empresa desativada bloqueia"                                            |
 * | getContext confere tenant `ativo` (0.6)                                  | autenticacao › "tenant suspenso bloqueia todas as empresas dele"                        |
 * | tenant suspenso não afeta outro tenant; pelo serviço do admin            | este arquivo › "suspender o tenant X pelo serviço do admin…"                            |
 * | perfil lido sempre do banco (0.6)                                        | autenticacao › "troca de perfil vale na hora"                                           |
 * | sem cookieCache: cookie adulterado, vencido ou de outro segredo (0.6)    | autenticacao › "sem cookie, com cookie adulterado ou com sessão vencida: sem contexto"  |
 * | `admin_plataforma`/`empresa_ativa_id` são input:false (0.6)              | auth-http › "campos extras no corpo não viram admin nem empresa ativa";                 |
 * |                                                                          | usuarios › "ignora um campo extra adminPlataforma vindo do formulário"                  |
 * | admin da plataforma não recebe contexto de empresa nem vira membro       | autenticacao › "sem membro não obtém contexto de empresa; vai para /admin";             |
 * |                                                                          | admin › "admin da plataforma não vira membro…"                                          |
 * | actions e queries do /admin recusam um dono, inclusive obterSituacaoDono | admin › "um dono (sem a flag) é mandado para o início e nada muda; sem sessão…"         |
 * | convite não revela se o e-mail existe em outro tenant (0.6, D033)        | admin › "convite: mesma resposta para e-mail novo e existente…";                        |
 * |                                                                          | convites › "não consulta nem cria usuário: e-mail novo e existente…"                    |
 * | convite só vale para o e-mail convidado                                  | convites › "logado com outro e-mail: recusado, e o convite continua pendente"           |
 * | convite de A não dá acesso a B nem a outro tenant                        | este arquivo › describe "convites"                                                      |
 * | trocarEmpresa recusa A×B, X×Y, membro/empresa inativos e tenant suspenso | autenticacao › "recusa empresa do mesmo tenant…", "recusa empresa de outro tenant…",    |
 * |                                                                          | "recusa membro desativado, empresa desativada e tenant suspenso"                        |
 * | trocarEmpresa não mexe na sessão de outro usuário                        | autenticacao › "não altera a sessão de outro usuário"                                   |
 * | listarEmpresasDaSessao só lista membro ativo                             | autenticacao › "membro desativado perde o acesso…", "lista as empresas de tenants…";    |
 * |                                                                          | este arquivo › "lista só as empresas com membro ativo…"                                 |
 * | membro de A (tenant X) e de C (tenant Y): só a empresa ativa             | este arquivo › describe "membro em dois tenants"                                        |
 * | sessão não aceita empresa ativa sem membro (banco)                       | isolamento › "sessão não aceita empresa ativa da qual o usuário não é membro"           |
 * | FK composta barra documento A → cadastro B                               | banco › "venda_itens da empresa A não aponta…", "a venda da empresa A não usa…"         |
 * | FK composta barra documento X → cadastro Y                               | isolamento › "documento de um tenant não aponta para cadastro de outro"                 |
 * | vínculos com usuário (mecânico, vendedor, desconto, auditoria) exigem    | isolamento › describe "vínculos com usuário exigem membro da empresa"                   |
 * | membro da empresa                                                        |                                                                                         |
 * | empresa do grupo (4.15) só no mesmo tenant                               | isolamento › describe "empresa do grupo (regra 4.15) só no mesmo tenant"                |
 * | catálogo: unique (empresa_id, id) em toda tabela; FK começa por empresa  | restricoes › "toda tabela com empresa_id tem unique (empresa_id, id)",                  |
 * |                                                                          | "toda FK entre duas tabelas com empresa_id começa por empresa_id…"                      |
 * | catálogo: índice por empresa_id, NOT NULL, FK para empresas, únicos por  | este arquivo › describe "garantias estruturais no catálogo"                             |
 * | empresa e lista exata das tabelas globais                                |                                                                                         |
 * | proximoNumero: sequências independentes por empresa                      | sequencias-auditoria › "empresas e chaves diferentes têm sequências independentes";     |
 * |                                                                          | este arquivo › harness "proximoNumero"                                                  |
 * | registrarAuditoria: autorizado_por só membro da empresa                  | sequencias-auditoria › "autorizado_por precisa ser membro da mesma empresa (FK)…";      |
 * |                                                                          | este arquivo › harness "registrarAuditoria"                                             |
 * | lancarSaldoInicial recusa produto e depósito de outra empresa (A×B)      | estoque-servico › "produto de outra empresa é recusado…", "recusa depósito não          |
 * |                                                                          | vendável, de outra empresa ou inativo"; este arquivo › harness (A×B e X×Y)              |
 * | validarPinDono recusa PIN de dono de outra empresa (A×B)                 | pin › "recusa o PIN de um dono de outra empresa", "o bloqueio de uma empresa não afeta  |
 * |                                                                          | o dono da outra"; este arquivo › harness (X×Y e o PIN do próprio usuário na outra)      |
 * | exigirAcessoOS: OS de outra empresa não existe (A×B)                     | acesso-os › "OS de outra empresa não existe para a empresa ativa (A × B)…";             |
 * |                                                                          | este arquivo › harness (X×Y)                                                            |
 * | toda função exportada de serviço/action/query está classificada          | este arquivo › "toda função exportada… está no harness ou tem teste dedicado"           |
 * | OAuth do Mercado Livre fora das contas do Better Auth (0.6)              | sem teste: a integração não existe; as credenciais vão em `canais_venda` (schema)       |
 * | listagem, leitura por id, atualização, exclusão lógica, PDF e exportação | ainda não existem telas de negócio: cada uma entra no harness (OPERACOES) ao nascer     |
 *
 * **Harness.** `OPERACOES` lista toda operação que recebe o contexto da empresa
 * ativa. Cada uma roda, para quatro combinações de usuário × empresa alvo
 * (A×B e X×Y; usuário dono também do alvo ou só de A), com o contexto de A
 * obtido por `getContext()`:
 *  - o `controle`, com dados da própria empresa, tem de funcionar;
 *  - a `invasao`, com ids e dados do alvo, tem de ser recusada (ou gravar só em A);
 *  - a foto do alvo (todas as tabelas com `empresa_id`) não pode mudar.
 * Uma operação nova (query, action, PDF, exportação) ganha o teste ao entrar na
 * lista. O teste "toda função exportada…" falha enquanto ela não for registrada
 * aqui ou classificada com o teste que a cobre.
 */
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
  cookies: async () => ({ get: () => undefined, getAll: () => [], has: () => false, set: () => {}, delete: () => {} }),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));

import { trocarEmpresa } from "../../src/server/actions/sessao";
import { exigirAcessoOS } from "../../src/server/auth/acesso-os";
import {
  exigirContexto,
  getContext,
  listarEmpresasDaSessao,
  type Contexto,
} from "../../src/server/auth/contexto";
import { ErroAcessoNegado } from "../../src/server/auth/permissoes";
import { definirPin, validarPinDono } from "../../src/server/auth/pin";
import { pool as poolApp, withTransaction } from "../../src/server/db";
import { auditoria, empresas, membros, sequencias, sessoes, tenants } from "../../src/server/db/schema";
import { ErroEstoque } from "../../src/server/domain/estoque";
import { registrarAuditoria } from "../../src/server/servicos/auditoria";
import {
  aceitarConviteContaExistente,
  aceitarConviteNovaConta,
  criarConvite,
} from "../../src/server/servicos/convites";
import { definirStatusTenant } from "../../src/server/servicos/empresas";
import { lancarSaldoInicial } from "../../src/server/servicos/estoque";
import { proximoNumero } from "../../src/server/servicos/sequencias";
import { erroPg, limparTabelas } from "./_banco";
import {
  abrirBanco,
  criarEmpresa,
  criarMembro,
  criarOs,
  criarTenant,
  criarUsuario,
  type EmpresaTeste,
} from "./_cenario";
import { fotografarEmpresa, tabelasAlteradas, tabelasComEmpresa } from "./_isolamento";
import { criarSessao } from "./_sessao";

const { pool, db } = abrirBanco();

afterAll(async () => {
  await pool.end();
  await poolApp.end();
});

const PIN_INVALIDO = { ok: false, motivo: "pin_invalido" } as const;
const MODULOS_LIGADOS = { balcao: true, os: true, fiscal: false, mercado_livre: false, ecommerce: false, estoque: true };

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

async function entrarComo(usuarioId: string, empresaAtivaId: string | null) {
  const { sessao, cookie } = await criarSessao(db, usuarioId, { empresaAtivaId });
  estado.cookie = cookie;
  return sessao;
}

async function contexto(): Promise<Contexto> {
  const ctx = await getContext();
  if (!ctx) throw new Error("esperava contexto");
  return ctx;
}

async function empresaAtivaDaSessao(sessaoId: string) {
  const [linha] = await db.select({ id: sessoes.empresaAtivaId }).from(sessoes).where(eq(sessoes.id, sessaoId));
  return linha?.id ?? null;
}

const ligarModulos = (e: EmpresaTeste) =>
  db.update(empresas).set({ modulos: MODULOS_LIGADOS }).where(eq(empresas.id, e.empresa.id));

const definirPinDe = (e: EmpresaTeste, usuarioId: string, pin: string) =>
  withTransaction((tx) => definirPin(tx, { empresaId: e.empresa.id, usuario: { id: usuarioId }, perfil: "dono" }, pin));

async function negadoRegistro(promessa: Promise<unknown>) {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  );
  expect(erro).toBeInstanceOf(ErroAcessoNegado);
  expect((erro as ErroAcessoNegado).motivo).toBe("registro");
}

// ===========================================================================
// Harness: toda operação com o contexto da empresa ativa, contra dados de outra
// ===========================================================================

/** Uma empresa do cenário do harness, com o que as operações usam dela. */
type Lado = {
  e: EmpresaTeste;
  osId: string;
  /** Dono só desta empresa (não é membro de A), com o PIN dele aqui. */
  donoExclusivo: { id: string; pin: string };
  /** PINs de todos os donos desta empresa, inclusive o do usuário do caso, se ele for dono aqui. */
  pins: string[];
};

type Caso = {
  /** Contexto de A, lido por `getContext()` da sessão do usuário do caso. */
  ctx: Contexto;
  propria: Lado;
  alvo: Lado;
  /** PIN do usuário do caso na empresa ativa. */
  pinNaAtiva: string;
};

type OperacaoIsolada = {
  /** `pasta/arquivo.funcao`, o mesmo nome que o teste de classificação procura. */
  funcao: string;
  nome: string;
  /** Com dados da própria empresa: precisa funcionar (prova que a recusa não é por outro motivo). */
  controle: (c: Caso) => Promise<void>;
  /** Com o contexto de A e ids/dados do alvo: recusada, ou grava só em A. */
  invasao: (c: Caso) => Promise<void>;
};

const OPERACOES: OperacaoIsolada[] = [
  {
    funcao: "servicos/sequencias.proximoNumero",
    nome: "proximoNumero: incrementa só a sequência da empresa ativa",
    controle: async ({ ctx }) => {
      const numero = await withTransaction((tx) => proximoNumero(tx, ctx, "venda"));
      const [linha] = await db
        .select({ ultimo: sequencias.ultimoValor })
        .from(sequencias)
        .where(and(eq(sequencias.empresaId, ctx.empresaId), eq(sequencias.chave, "venda")));
      expect(linha!.ultimo).toBe(numero);
    },
    // não recebe id nenhum: a invasão possível é gravar fora da empresa do contexto (a foto confere)
    invasao: async ({ ctx }) => {
      await withTransaction((tx) => proximoNumero(tx, ctx, "venda"));
    },
  },
  {
    funcao: "servicos/auditoria.registrarAuditoria",
    nome: "registrarAuditoria: grava na empresa ativa; recusa autorizador que só é dono do alvo",
    controle: async ({ ctx }) => {
      const { id } = await withTransaction((tx) =>
        registrarAuditoria(tx, ctx, {
          entidade: "vendas",
          entidadeId: crypto.randomUUID(),
          acao: "desconto_acima_limite",
          autorizadoPor: ctx.usuario.id,
        }),
      );
      const [linha] = await db.select({ empresaId: auditoria.empresaId }).from(auditoria).where(eq(auditoria.id, id));
      expect(linha!.empresaId).toBe(ctx.empresaId);
    },
    invasao: async ({ ctx, alvo }) => {
      expect(
        await erroPg(
          withTransaction((tx) =>
            registrarAuditoria(tx, ctx, {
              entidade: "vendas",
              entidadeId: alvo.e.produto.id,
              acao: "desconto_acima_limite",
              autorizadoPor: alvo.donoExclusivo.id,
            }),
          ),
        ),
      ).toEqual({ code: "23503", constraint: "auditoria_autorizado_por_fk" });
    },
  },
  {
    funcao: "servicos/estoque.lancarSaldoInicial",
    nome: "lancarSaldoInicial: recusa produto do alvo",
    controle: async ({ ctx, propria }) => {
      const movs = await withTransaction((tx) =>
        lancarSaldoInicial(tx, ctx, [{ produtoId: propria.e.produto.id, quantidade: "1", custoUnitario: "2" }], {
          motivo: "controle",
        }),
      );
      expect(movs).toHaveLength(1);
    },
    invasao: async ({ ctx, alvo }) => {
      const r = withTransaction((tx) =>
        lancarSaldoInicial(tx, ctx, [{ produtoId: alvo.e.produto.id, quantidade: "1", custoUnitario: "2" }], {
          motivo: "invasão",
        }),
      );
      await expect(r).rejects.toBeInstanceOf(ErroEstoque);
      await expect(r).rejects.toMatchObject({ codigo: "produto_invalido", produtos: [alvo.e.produto.id] });
    },
  },
  {
    funcao: "servicos/estoque.lancarSaldoInicial",
    nome: "lancarSaldoInicial: recusa o depósito do alvo",
    controle: async ({ ctx, propria }) => {
      await withTransaction((tx) =>
        lancarSaldoInicial(tx, ctx, [{ produtoId: propria.e.produto2.id, quantidade: "1", custoUnitario: null }], {
          motivo: "controle",
          depositoId: propria.e.loja.id,
        }),
      );
    },
    invasao: async ({ ctx, propria, alvo }) => {
      await expect(
        withTransaction((tx) =>
          lancarSaldoInicial(tx, ctx, [{ produtoId: propria.e.produto2.id, quantidade: "1", custoUnitario: null }], {
            motivo: "invasão",
            depositoId: alvo.e.loja.id,
          }),
        ),
      ).rejects.toMatchObject({ codigo: "deposito_invalido" });
    },
  },
  {
    funcao: "auth/pin.validarPinDono",
    nome: "validarPinDono: nenhum PIN de dono do alvo vale na empresa ativa (nem o do próprio usuário lá)",
    controle: async ({ ctx, pinNaAtiva }) => {
      expect(await validarPinDono(withTransaction, ctx, { pin: pinNaAtiva, agora: new Date() })).toMatchObject({
        ok: true,
        autorizadoPor: { usuarioId: ctx.usuario.id },
      });
    },
    invasao: async ({ ctx, alvo }) => {
      for (const pin of alvo.pins) {
        expect(await validarPinDono(withTransaction, ctx, { pin, agora: new Date() })).toEqual(PIN_INVALIDO);
      }
    },
  },
  {
    funcao: "auth/pin.validarPinDono",
    nome: "validarPinDono: escolher um dono do alvo não o torna autorizador na empresa ativa",
    controle: async ({ ctx, pinNaAtiva }) => {
      expect(
        await validarPinDono(withTransaction, ctx, {
          pin: pinNaAtiva,
          agora: new Date(),
          donoUsuarioId: ctx.usuario.id,
        }),
      ).toMatchObject({ ok: true });
    },
    invasao: async ({ ctx, alvo }) => {
      expect(
        await validarPinDono(withTransaction, ctx, {
          pin: alvo.donoExclusivo.pin,
          agora: new Date(),
          donoUsuarioId: alvo.donoExclusivo.id,
        }),
      ).toEqual(PIN_INVALIDO);
    },
  },
  {
    funcao: "auth/pin.definirPin",
    nome: "definirPin: troca só o PIN do membro da empresa ativa",
    controle: async ({ ctx, pinNaAtiva }) => {
      expect(await withTransaction((tx) => definirPin(tx, ctx, pinNaAtiva))).toEqual({ ok: true });
    },
    // o mesmo PIN de novo (o hash muda): a foto confere que o membro do alvo não foi tocado
    invasao: async ({ ctx, pinNaAtiva }) => {
      expect(await withTransaction((tx) => definirPin(tx, ctx, pinNaAtiva))).toEqual({ ok: true });
    },
  },
  {
    funcao: "auth/acesso-os.exigirAcessoOS",
    nome: "exigirAcessoOS: OS do alvo não existe para a empresa ativa",
    controle: async ({ ctx, propria }) => {
      const os = await withTransaction((tx) => exigirAcessoOS(tx, ctx, propria.osId, { travar: true }));
      expect(os.id).toBe(propria.osId);
    },
    invasao: async ({ ctx, alvo }) => {
      await negadoRegistro(withTransaction((tx) => exigirAcessoOS(tx, ctx, alvo.osId)));
      await negadoRegistro(withTransaction((tx) => exigirAcessoOS(tx, ctx, alvo.osId, { travar: true })));
    },
  },
];

describe("harness: operações com o contexto de A contra dados de outra empresa", () => {
  /**
   * Tenant X: empresas A e B. Tenant Y: empresa C. Todas com OS, saldo, sequência
   * e PINs, para a foto do alvo ter o que comparar.
   * - `socio`: dono de A, B e C (o dono das duas empresas do primeiro cliente, e
   *   também de um tenant alheio): o caso mais forte, em que o banco aceitaria o
   *   usuário no alvo;
   * - `soA`: dono só de A;
   * - `donoB` e `donoC`: donos exclusivos do alvo.
   */
  const c = {} as {
    lados: { A: Lado; B: Lado; C: Lado };
    usuarios: { socio: string; soA: string };
    pinsEmA: Record<string, string>;
  };

  beforeAll(async () => {
    await limparTabelas(pool);
    const x = await criarTenant(db, "Tenant X");
    const y = await criarTenant(db, "Tenant Y");
    const a = await criarEmpresa(db, x.id, "A");
    const b = await criarEmpresa(db, x.id, "B");
    const cc = await criarEmpresa(db, y.id, "C");
    for (const e of [a, b, cc]) await ligarModulos(e);

    const socio = await criarUsuario(db, "socio@teste.local");
    const soA = await criarUsuario(db, "so-a@teste.local");
    const donoB = await criarUsuario(db, "dono-b@teste.local");
    const donoC = await criarUsuario(db, "dono-c@teste.local");
    for (const e of [a, b, cc]) await criarMembro(db, e.empresa.id, socio.id, "dono");
    await criarMembro(db, a.empresa.id, soA.id, "dono");
    await criarMembro(db, b.empresa.id, donoB.id, "dono");
    await criarMembro(db, cc.empresa.id, donoC.id, "dono");

    await definirPinDe(a, socio.id, "111111");
    await definirPinDe(b, socio.id, "222222");
    await definirPinDe(cc, socio.id, "333333");
    await definirPinDe(a, soA.id, "444444");
    await definirPinDe(b, donoB.id, "555555");
    await definirPinDe(cc, donoC.id, "666666");

    // dados no alvo, gravados pelo caminho oficial e com o contexto do próprio alvo
    for (const [e, donoId] of [
      [b, donoB.id],
      [cc, donoC.id],
    ] as const) {
      const ctxAlvo = { empresaId: e.empresa.id, usuario: { id: donoId } };
      await withTransaction(async (tx) => {
        await lancarSaldoInicial(tx, ctxAlvo, [{ produtoId: e.produto.id, quantidade: "3", custoUnitario: "10" }], {
          motivo: "saldo do alvo",
        });
        await proximoNumero(tx, ctxAlvo, "venda");
      });
    }

    const osA = await criarOs(db, a, socio.id);
    const osB = await criarOs(db, b, donoB.id);
    const osC = await criarOs(db, cc, donoC.id);
    c.lados = {
      A: { e: a, osId: osA.id, donoExclusivo: { id: soA.id, pin: "444444" }, pins: ["111111", "444444"] },
      B: { e: b, osId: osB.id, donoExclusivo: { id: donoB.id, pin: "555555" }, pins: ["222222", "555555"] },
      C: { e: cc, osId: osC.id, donoExclusivo: { id: donoC.id, pin: "666666" }, pins: ["333333", "666666"] },
    };
    c.usuarios = { socio: socio.id, soA: soA.id };
    c.pinsEmA = { [socio.id]: "111111", [soA.id]: "444444" };
  });

  beforeEach(async () => {
    // as tentativas erradas contam falhas nos donos de A: zera para o PIN não bloquear
    await db.update(membros).set({ pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 });
  });

  const PARES = [
    { par: "A × B (mesmo tenant), usuário dono também de B", usuario: "socio", alvo: "B" },
    { par: "X × Y (outro tenant), usuário dono também de C", usuario: "socio", alvo: "C" },
    { par: "A × B (mesmo tenant), usuário só de A", usuario: "soA", alvo: "B" },
    { par: "X × Y (outro tenant), usuário só de A", usuario: "soA", alvo: "C" },
  ] as const;

  const casos = OPERACOES.flatMap((op) => PARES.map((p) => ({ ...p, op, titulo: `${op.nome} — ${p.par}` })));

  it.each(casos)("$titulo", async ({ op, usuario, alvo: nomeAlvo }) => {
    const usuarioId = c.usuarios[usuario];
    await entrarComo(usuarioId, c.lados.A.e.empresa.id);
    const ctx = await contexto();
    expect(ctx.empresaId).toBe(c.lados.A.e.empresa.id);
    const caso: Caso = { ctx, propria: c.lados.A, alvo: c.lados[nomeAlvo], pinNaAtiva: c.pinsEmA[usuarioId]! };

    await op.controle(caso);

    const antes = await fotografarEmpresa(pool, caso.alvo.e.empresa.id);
    await op.invasao(caso);
    const depois = await fotografarEmpresa(pool, caso.alvo.e.empresa.id);
    expect(tabelasAlteradas(antes, depois)).toEqual([]);
  });

  it("a foto do alvo enxerga escrita em qualquer tabela da empresa (o harness não é cego)", async () => {
    const alvo = c.lados.B.e.empresa.id;
    const antes = await fotografarEmpresa(pool, alvo);
    await withTransaction((tx) => proximoNumero(tx, { empresaId: alvo }, "os"));
    await db.update(membros).set({ pinFalhas: 1 }).where(eq(membros.empresaId, alvo));
    const depois = await fotografarEmpresa(pool, alvo);
    expect(tabelasAlteradas(antes, depois)).toEqual(["membros", "sequencias"]);
    // uma tabela por chave, mais a empresa e o tenant
    expect(Object.keys(antes)).toHaveLength((await tabelasComEmpresa(pool)).length + 2);
  });

  it("toda função exportada de serviço, action e query está no harness ou tem teste dedicado", async () => {
    /**
     * Funções que não recebem o contexto da empresa ativa, com o motivo e o
     * teste que garante o isolamento delas. Uma função nova que recebe `ctx`
     * entra em `OPERACOES`, não aqui.
     */
    const PLATAFORMA = "só o admin da plataforma (admin.test › 'um dono (sem a flag) é mandado para o início…')";
    const TOKEN = "credencial é o token do convite (convites.test; este arquivo › describe 'convites')";
    const PURA = "função pura, sem banco";
    const FORA_DO_HARNESS: Record<string, string> = {
      "actions/admin.criarTenantAcao": PLATAFORMA,
      "actions/admin.definirStatusTenantAcao": PLATAFORMA,
      "actions/admin.criarEmpresaAcao": PLATAFORMA,
      "actions/admin.alterarModuloAcao": PLATAFORMA,
      "actions/admin.convidarDonoAcao": PLATAFORMA,
      "actions/admin.revogarConviteDonoAcao": PLATAFORMA,
      "actions/convites.aceitarConviteNovaContaAcao": TOKEN,
      "actions/convites.aceitarConviteAcao": TOKEN,
      "actions/sessao.trocarEmpresa": "sessão (autenticacao.test › describe 'trocarEmpresa'; este arquivo)",
      "actions/sessao.sair": "sessão: só apaga a própria sessão",
      "queries/admin.proximaLeva": PLATAFORMA,
      "queries/admin.listarTenants": PLATAFORMA,
      "queries/admin.obterTenant": PLATAFORMA,
      "queries/admin.listarEmpresasDoTenant": PLATAFORMA,
      "queries/admin.obterEmpresaDoTenant": PLATAFORMA,
      "queries/admin.listarMembrosDaEmpresa": PLATAFORMA,
      "queries/admin.obterSituacaoDono": PLATAFORMA,
      "servicos/auditoria.campoSensivel": PURA,
      "servicos/auditoria.limparParaAuditoria": PURA,
      "servicos/convites.gerarTokenConvite": PURA,
      "servicos/convites.hashDoToken": PURA,
      "servicos/convites.linkDoConvite": PURA,
      // hoje só pelo admin; quando o dono da loja convidar membros, a action dele entra no harness
      "servicos/convites.criarConvite": PLATAFORMA,
      "servicos/convites.convidarDono": PLATAFORMA,
      "servicos/convites.convitePendenteDeDono": PLATAFORMA,
      "servicos/convites.revogarConvitesDeDono": PLATAFORMA,
      "servicos/convites.criarConviteAdminPlataforma": PLATAFORMA,
      "servicos/convites.lerConviteValido": TOKEN,
      "servicos/convites.aceitarConviteNovaConta": TOKEN,
      "servicos/convites.aceitarConviteContaExistente": TOKEN,
      "servicos/empresas.modulosIniciais": PURA,
      "servicos/empresas.tenantComNomeExiste": PLATAFORMA,
      "servicos/empresas.cnpjEmUso": PLATAFORMA,
      "servicos/empresas.criarTenant": PLATAFORMA,
      "servicos/empresas.definirStatusTenant": PLATAFORMA,
      "servicos/empresas.criarEmpresa": PLATAFORMA,
      "servicos/empresas.alterarModulo": PLATAFORMA,
      "servicos/empresas.adicionarMembro": PLATAFORMA,
    };

    const raiz = fileURLToPath(new URL("../../src/server/", import.meta.url));
    const arquivos = [
      ...["actions", "queries", "servicos"].flatMap((pasta) =>
        readdirSync(`${raiz}${pasta}`)
          .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
          .map((f) => `${pasta}/${f.replace(/\.ts$/, "")}`),
      ),
      "auth/pin",
      "auth/acesso-os",
    ];

    const noHarness = new Set(OPERACOES.map((op) => op.funcao));
    const encontradas: string[] = [];
    for (const arquivo of arquivos) {
      const modulo = (await import(`${raiz}${arquivo}.ts`)) as Record<string, unknown>;
      for (const [nome, valor] of Object.entries(modulo)) {
        if (typeof valor !== "function") continue;
        if (/^class[\s{]/.test(Function.prototype.toString.call(valor))) continue; // erros (ErroPlataforma…)
        encontradas.push(`${arquivo}.${nome}`);
      }
    }

    const semClassificacao = encontradas.filter((f) => !noHarness.has(f) && !(f in FORA_DO_HARNESS));
    expect(semClassificacao, "registre em OPERACOES (recebe ctx) ou em FORA_DO_HARNESS (com o teste)").toEqual([]);
    // a lista não guarda nome de função que deixou de existir
    const fantasmas = [...noHarness, ...Object.keys(FORA_DO_HARNESS)].filter((f) => !encontradas.includes(f));
    expect(fantasmas).toEqual([]);
  });
});

// ===========================================================================
// Leitura pela sessão
// ===========================================================================

describe("leitura pela sessão", () => {
  beforeEach(async () => {
    estado.cookie = "";
    await limparTabelas(pool);
  });

  it("lista só as empresas com membro ativo: nem a outra do tenant, nem a de membro desativado, nem a de outro tenant", async () => {
    const x = await criarTenant(db, "Tenant X");
    const y = await criarTenant(db, "Tenant Y");
    const a = await criarEmpresa(db, x.id, "Alfa Peças");
    const b = await criarEmpresa(db, x.id, "Beta Peças");
    const d = await criarEmpresa(db, x.id, "Delta Peças");
    const cc = await criarEmpresa(db, y.id, "Gama Peças");
    const ana = await criarUsuario(db, "ana@teste.local");
    const outro = await criarUsuario(db, "outro@teste.local");
    await criarMembro(db, a.empresa.id, ana.id, "balcao");
    await criarMembro(db, d.empresa.id, ana.id, "dono");
    await db.update(membros).set({ ativo: false }).where(and(eq(membros.empresaId, d.empresa.id), eq(membros.usuarioId, ana.id)));
    for (const e of [a, b, d, cc]) await criarMembro(db, e.empresa.id, outro.id, "dono");

    await entrarComo(ana.id, null);
    const ctx = await contexto();
    const lista = await listarEmpresasDaSessao();
    expect(lista.map((e) => e.empresaId)).toEqual([a.empresa.id]);
    expect(ctx).toMatchObject({ empresaId: a.empresa.id, tenantId: x.id, perfil: "balcao" });

    const texto = JSON.stringify({ ctx, lista });
    for (const e of [b, d, cc]) {
      for (const segredo of [e.empresa.id, e.empresa.cnpj, e.empresa.razaoSocial]) expect(texto).not.toContain(segredo);
    }
    expect(texto).not.toContain(y.id);
  });
});

// ===========================================================================
// Convites
// ===========================================================================

describe("convites", () => {
  beforeEach(async () => {
    estado.cookie = "";
    await limparTabelas(pool);
  });

  async function cenario() {
    const x = await criarTenant(db, "Tenant X");
    const y = await criarTenant(db, "Tenant Y");
    const a = await criarEmpresa(db, x.id, "Alfa Peças");
    const b = await criarEmpresa(db, x.id, "Beta Peças");
    const cc = await criarEmpresa(db, y.id, "Gama Peças");
    return { x, y, a, b, cc };
  }

  it("convite de A aceito com conta nova dá acesso só a A: nem a B do mesmo tenant, nem a C de outro tenant", async () => {
    const { x, a, b, cc } = await cenario();
    const convite = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: a.empresa.id, email: "bela@loja.com", perfil: "balcao", usuario: null }),
    );
    const aceito = await withTransaction((tx) =>
      aceitarConviteNovaConta(tx, { token: convite.token, nome: "Bela", senha: "senha-forte-123" }),
    );

    const vinculos = await db.select({ empresaId: membros.empresaId, perfil: membros.perfil }).from(membros).where(eq(membros.usuarioId, aceito.usuarioId));
    expect(vinculos).toEqual([{ empresaId: a.empresa.id, perfil: "balcao" }]);

    // a sessão nasce sem empresa ativa (como no login): o contexto só pode ser A
    const sessao = await entrarComo(aceito.usuarioId, null);
    expect(await contexto()).toMatchObject({ empresaId: a.empresa.id, tenantId: x.id, perfil: "balcao" });
    expect((await listarEmpresasDaSessao()).map((e) => e.empresaId)).toEqual([a.empresa.id]);
    expect(await trocarEmpresa(b.empresa.id)).toMatchObject({ ok: false });
    expect(await trocarEmpresa(cc.empresa.id)).toMatchObject({ ok: false });
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
  });

  it("convite de A aceito por quem é membro desativado de B e dono de C: B continua fechada e C não muda", async () => {
    const { a, b, cc } = await cenario();
    const caio = await criarUsuario(db, "caio@loja.com");
    await criarMembro(db, b.empresa.id, caio.id, "estoque");
    await db.update(membros).set({ ativo: false }).where(and(eq(membros.empresaId, b.empresa.id), eq(membros.usuarioId, caio.id)));
    await criarMembro(db, cc.empresa.id, caio.id, "dono");
    const convite = await withTransaction((tx) =>
      criarConvite(tx, { empresaId: a.empresa.id, email: "caio@loja.com", perfil: "balcao", usuario: null }),
    );

    const fotoB = await fotografarEmpresa(pool, b.empresa.id);
    const fotoC = await fotografarEmpresa(pool, cc.empresa.id);
    await withTransaction((tx) => aceitarConviteContaExistente(tx, { token: convite.token, usuarioId: caio.id }));
    expect(tabelasAlteradas(fotoB, await fotografarEmpresa(pool, b.empresa.id))).toEqual([]);
    expect(tabelasAlteradas(fotoC, await fotografarEmpresa(pool, cc.empresa.id))).toEqual([]);

    const sessao = await entrarComo(caio.id, a.empresa.id);
    expect(await contexto()).toMatchObject({ empresaId: a.empresa.id, perfil: "balcao" });
    expect((await listarEmpresasDaSessao()).map((e) => e.empresaId).sort()).toEqual(
      [a.empresa.id, cc.empresa.id].sort(),
    );
    expect(await trocarEmpresa(b.empresa.id)).toMatchObject({ ok: false });
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
  });
});

// ===========================================================================
// Membro em dois tenants e tenant suspenso
// ===========================================================================

describe("membro em dois tenants", () => {
  beforeEach(async () => {
    estado.cookie = "";
    await limparTabelas(pool);
  });

  it("membro de A (tenant X) e de C (tenant Y): contexto e serviços seguem só a empresa ativa; a troca para C depois de desativado é recusada", async () => {
    const x = await criarTenant(db, "Tenant X");
    const y = await criarTenant(db, "Tenant Y");
    const a = await criarEmpresa(db, x.id, "Alfa Peças");
    const cc = await criarEmpresa(db, y.id, "Gama Peças");
    for (const e of [a, cc]) await ligarModulos(e);
    const m = await criarUsuario(db, "marcos@teste.local");
    await criarMembro(db, a.empresa.id, m.id, "dono");
    await criarMembro(db, cc.empresa.id, m.id, "balcao");
    const osA = await criarOs(db, a, m.id);
    const osC = await criarOs(db, cc, m.id);
    const sessao = await entrarComo(m.id, a.empresa.id);

    // em A: só os dados de A
    let ctx = await contexto();
    expect(ctx).toMatchObject({ empresaId: a.empresa.id, tenantId: x.id, perfil: "dono" });
    expect((await withTransaction((tx) => exigirAcessoOS(tx, ctx, osA.id))).id).toBe(osA.id);
    await negadoRegistro(withTransaction((tx) => exigirAcessoOS(tx, ctx, osC.id)));
    await expect(
      withTransaction((tx) =>
        lancarSaldoInicial(tx, ctx, [{ produtoId: cc.produto.id, quantidade: "1", custoUnitario: "1" }], { motivo: "x" }),
      ),
    ).rejects.toMatchObject({ codigo: "produto_invalido" });

    // troca para C: o perfil passa a ser o de C, e A some
    expect(await destinoDoRedirect(trocarEmpresa(cc.empresa.id))).toBe("/");
    ctx = await contexto();
    expect(ctx).toMatchObject({ empresaId: cc.empresa.id, tenantId: y.id, perfil: "balcao" });
    expect((await withTransaction((tx) => exigirAcessoOS(tx, ctx, osC.id))).id).toBe(osC.id);
    await negadoRegistro(withTransaction((tx) => exigirAcessoOS(tx, ctx, osA.id)));
    expect(await withTransaction((tx) => proximoNumero(tx, ctx, "os"))).toBe(1);
    expect(await db.select().from(sequencias).where(eq(sequencias.empresaId, a.empresa.id))).toEqual([]);

    // desativado em C: cai para A e não consegue voltar
    await db.update(membros).set({ ativo: false }).where(and(eq(membros.empresaId, cc.empresa.id), eq(membros.usuarioId, m.id)));
    expect(await contexto()).toMatchObject({ empresaId: a.empresa.id, perfil: "dono" });
    expect(await trocarEmpresa(cc.empresa.id)).toMatchObject({ ok: false });
    expect(await empresaAtivaDaSessao(sessao.id)).toBe(a.empresa.id);
    expect((await listarEmpresasDaSessao()).map((e) => e.empresaId)).toEqual([a.empresa.id]);
  });

  it("suspender o tenant X pelo serviço do admin bloqueia A e B na hora, sem afetar o tenant Y", async () => {
    const x = await criarTenant(db, "Tenant X");
    const y = await criarTenant(db, "Tenant Y");
    const a = await criarEmpresa(db, x.id, "Alfa Peças");
    const b = await criarEmpresa(db, x.id, "Beta Peças");
    const cc = await criarEmpresa(db, y.id, "Gama Peças");
    const m = await criarUsuario(db, "marcos@teste.local"); // dono de A e de C
    const donoB = await criarUsuario(db, "dono-b@teste.local");
    const donoC = await criarUsuario(db, "dono-c@teste.local");
    await criarMembro(db, a.empresa.id, m.id, "dono");
    await criarMembro(db, cc.empresa.id, m.id, "dono");
    await criarMembro(db, b.empresa.id, donoB.id, "dono");
    await criarMembro(db, cc.empresa.id, donoC.id, "dono");
    const sessaoM = await criarSessao(db, m.id, { empresaAtivaId: a.empresa.id });
    const sessaoB = await criarSessao(db, donoB.id, { empresaAtivaId: b.empresa.id });
    const sessaoC = await criarSessao(db, donoC.id, { empresaAtivaId: cc.empresa.id });
    const fotoC = await fotografarEmpresa(pool, cc.empresa.id);

    await withTransaction((tx) => definirStatusTenant(tx, { tenantId: x.id, status: "suspenso", usuario: null }));

    estado.cookie = sessaoM.cookie;
    expect(await contexto()).toMatchObject({ empresaId: cc.empresa.id, tenantId: y.id });
    expect((await listarEmpresasDaSessao()).map((e) => e.empresaId)).toEqual([cc.empresa.id]);
    expect(await trocarEmpresa(a.empresa.id)).toMatchObject({ ok: false });

    estado.cookie = sessaoB.cookie;
    expect(await getContext()).toBeNull();
    expect(await listarEmpresasDaSessao()).toEqual([]);
    expect(await destinoDoRedirect(exigirContexto())).toBe("/sem-acesso");

    estado.cookie = sessaoC.cookie;
    expect(await contexto()).toMatchObject({ empresaId: cc.empresa.id, tenantId: y.id, perfil: "dono" });

    // a suspensão é auditada só nas empresas do tenant X; Y fica intocado
    const suspensoes = await db.select({ empresaId: auditoria.empresaId }).from(auditoria).where(eq(auditoria.acao, "tenant_suspenso"));
    expect(suspensoes.map((s) => s.empresaId).sort()).toEqual([a.empresa.id, b.empresa.id].sort());
    expect(tabelasAlteradas(fotoC, await fotografarEmpresa(pool, cc.empresa.id))).toEqual([]);
    const [tenantY] = await db.select({ status: tenants.status }).from(tenants).where(eq(tenants.id, y.id));
    expect(tenantY!.status).toBe("ativo");

    // reativado, o acesso volta
    await withTransaction((tx) => definirStatusTenant(tx, { tenantId: x.id, status: "ativo", usuario: null }));
    estado.cookie = sessaoM.cookie;
    expect(await destinoDoRedirect(trocarEmpresa(a.empresa.id))).toBe("/");
    expect(await empresaAtivaDaSessao(sessaoM.sessao.id)).toBe(a.empresa.id);
    estado.cookie = sessaoB.cookie;
    expect(await contexto()).toMatchObject({ empresaId: b.empresa.id });
  });
});

// ===========================================================================
// Garantias estruturais (catálogo), complementares ao restricoes.test.ts
// ===========================================================================

describe("garantias estruturais no catálogo", () => {
  const TABELAS = `
    select c.oid, c.relname from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)`;
  const nomeColuna = (rel: string, num: string) =>
    `(select attname from pg_attribute where attrelid = ${rel} and attnum = ${num})`;

  it("as únicas tabelas sem empresa_id são as globais (plataforma, Better Auth e referência de motos)", async () => {
    const r = await pool.query<{ relname: string }>(`
      select c.relname from pg_class c
       where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
         and c.oid not in (select oid from (${TABELAS}) t)
       order by 1`);
    expect(r.rows.map((l) => l.relname)).toEqual([
      "contas_acesso",
      "empresas",
      "marcas_moto",
      "modelos_moto",
      "sessoes",
      "tenants",
      "usuarios",
      "verificacoes",
    ]);
  });

  it("toda tabela com empresa_id tem um índice btree válido que começa por empresa_id", async () => {
    const r = await pool.query<{ relname: string }>(`
      with t as (${TABELAS})
      select t.relname from t
       where not exists (
         select 1 from pg_index x
           join pg_class i on i.oid = x.indexrelid
           join pg_am am on am.oid = i.relam
          where x.indrelid = t.oid and x.indisvalid and am.amname = 'btree'
            and x.indkey[0] <> 0 and ${nomeColuna("t.oid", "x.indkey[0]")} = 'empresa_id')
       order by 1`);
    expect(r.rows).toEqual([]);
  });

  it("empresa_id é NOT NULL; a única exceção é convites, que exige a empresa em todo convite de empresa", async () => {
    const r = await pool.query<{ relname: string }>(`
      with t as (${TABELAS})
      select t.relname from t join pg_attribute a on a.attrelid = t.oid and a.attname = 'empresa_id'
       where not a.attnotnull order by 1`);
    expect(r.rows.map((l) => l.relname)).toEqual(["convites"]);
    const [check] = (
      await pool.query<{ def: string }>(
        `select pg_get_constraintdef(oid) as def from pg_constraint where conname = 'convites_alvo_check'`,
      )
    ).rows;
    expect(check!.def).toMatch(/tipo = 'empresa'::text\) AND \(empresa_id IS NOT NULL\)/);
    expect(check!.def).toMatch(/tipo = 'admin_plataforma'::text\) AND \(empresa_id IS NULL\)/);
  });

  it("toda coluna empresa_id tem FK para empresas(id)", async () => {
    const r = await pool.query<{ relname: string }>(`
      with t as (${TABELAS})
      select t.relname from t
       where not exists (
         select 1 from pg_constraint f
          where f.conrelid = t.oid and f.contype = 'f' and f.confrelid = 'empresas'::regclass
            and array_length(f.conkey, 1) = 1 and ${nomeColuna("t.oid", "f.conkey[1]")} = 'empresa_id')
       order by 1`);
    expect(r.rows).toEqual([]);
  });

  it("todo índice único de tabela com empresa_id começa por empresa_id, exceto os globais documentados", async () => {
    /**
     * Únicos que não começam por empresa_id. Cada um é de uma destas formas:
     * - chave sobre o uuid de uma linha-mãe da mesma empresa (garantida pela FK
     *   composta): o uuid já é de uma empresa só, então o único vale por empresa;
     * - chave global por natureza, documentada no modelo de dados.
     * Um `unique (codigo)` novo sem empresa_id quebraria a regra 4.1 (unicidade
     * por empresa) e revelaria a outro tenant que o código existe: cai aqui.
     */
    const PERMITIDOS: Record<string, string> = {
      api_chaves_hash_key: "global: a chave de API identifica o canal antes de se saber a empresa (modelo 8)",
      canais_venda_tipo_conta_externa_id_key: "global: a notificação do ML chega antes de se saber a empresa (modelo 8.1)",
      canal_anuncios_canal_externo_variacao_key: "sobre canal_id (linha-mãe da mesma empresa)",
      convites_email_admin_pendente_key: "convite de admin da plataforma, sem empresa (D033)",
      convites_token_hash_key: "global: o token é a credencial do convite (D033)",
      documentos_fiscais_ref_key: "global: a ref do Focus resolve a empresa no webhook (modelo 9)",
      entrada_itens_entrada_id_numero_item_key: "sobre entrada_id (linha-mãe da mesma empresa)",
      estoque_saldos_produto_id_deposito_id_key: "sobre produto_id e deposito_id (da mesma empresa)",
      eventos_fiscais_carta_correcao_sequencia_key: "sobre documento_fiscal_id (linha-mãe da mesma empresa)",
      inventario_itens_inventario_id_produto_id_key: "sobre inventario_id (linha-mãe da mesma empresa)",
      movimentacoes_estoque_estorno_de_id_key: "sobre estorno_de_id (movimento da mesma empresa)",
      pedidos_canal_canal_id_id_externo_key: "sobre canal_id (linha-mãe da mesma empresa)",
      tabela_preco_itens_tabela_preco_id_produto_id_key: "sobre tabela_preco_id (linha-mãe da mesma empresa)",
    };
    const r = await pool.query<{ indice: string }>(`
      with t as (${TABELAS})
      select i.relname as indice from t
        join pg_index x on x.indrelid = t.oid
        join pg_class i on i.oid = x.indexrelid
       where x.indisunique and not x.indisprimary
         and (x.indkey[0] = 0 or ${nomeColuna("t.oid", "x.indkey[0]")} <> 'empresa_id')
       order by 1`);
    expect(r.rows.map((l) => l.indice)).toEqual(Object.keys(PERMITIDOS).sort());
  });
});
