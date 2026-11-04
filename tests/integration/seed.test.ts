/**
 * Seed de demonstração (seção 8): idempotência, saldos pelo caminho oficial e
 * recusa fora de local/homologação. Postgres real (`summer_test`).
 */
import { spawnSync } from "node:child_process";

import { verifyPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { contasAcesso, empresas, membros, sequencias, tabelasPreco, usuarios } from "../../src/server/db/schema";
import { executarSeed, saldosDivergentes, type ResumoSeed } from "../../scripts/seed/executar";
import { EMPRESAS_DEMO, PRODUTOS } from "../../scripts/seed/dados";
import { limparTabelas, urlBancoTeste } from "./_banco";
import { abrirBanco } from "./_cenario";

const { pool, db, withTransaction } = abrirBanco();

const CONFIG = {
  senhas: {
    SEED_SENHA_ADMIN: "admin-teste-seed",
    SEED_SENHA_DONO: "dono-teste-seed",
    SEED_SENHA_BALCAO: "balcao-teste-seed",
    SEED_SENHA_ESTOQUE: "estoque-teste-seed",
    SEED_SENHA_MECANICO: "mecanico-teste-seed",
  },
  pinDono: "135790",
};

/** Linhas de todas as tabelas do schema public (inclui auditoria e outbox). */
async function contarTudo(): Promise<Record<string, number>> {
  const tabelas = await pool.query<{ tablename: string }>(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const contagens: Record<string, number> = {};
  for (const { tablename } of tabelas.rows) {
    const r = await pool.query<{ n: number }>(`select count(*)::int as n from public."${tablename}"`);
    contagens[tablename] = r.rows[0].n;
  }
  return contagens;
}

let primeira: ResumoSeed;
let segunda: ResumoSeed;
let depoisDaPrimeira: Record<string, number>;
let depoisDaSegunda: Record<string, number>;
let saldosDaPrimeira: unknown[];

beforeAll(async () => {
  await limparTabelas(pool);
  primeira = await executarSeed({ withTransaction }, CONFIG);
  depoisDaPrimeira = await contarTudo();
  saldosDaPrimeira = (await pool.query("select * from estoque_saldos order by id")).rows;
  segunda = await executarSeed({ withTransaction }, CONFIG);
  depoisDaSegunda = await contarTudo();
}, 180_000);

afterAll(async () => {
  await pool.end();
});

async function empresaId(cnpj: string) {
  const [e] = await db.select({ id: empresas.id }).from(empresas).where(eq(empresas.cnpj, cnpj));
  return e.id;
}

describe("seed de demonstração", () => {
  it("a primeira execução cria tudo; a segunda não cria nada", () => {
    expect(primeira.tenant.criado).toBe(true);
    expect(primeira.usuariosCriados).toBe(5);
    expect(primeira.empresas.map((e) => e.criada)).toEqual([true, true]);
    expect(segunda.tenant.criado).toBe(false);
    expect(segunda.usuariosCriados).toBe(0);
    expect(segunda.empresas.map((e) => e.criada)).toEqual([false, false]);
    expect(segunda.empresas.map((e) => e.saldosLancados)).toEqual([0, 0]);
  });

  it("rodar duas vezes deixa as contagens de todas as tabelas idênticas", () => {
    expect(depoisDaSegunda).toEqual(depoisDaPrimeira);
    expect(segunda.empresas.map((e) => e.contagens)).toEqual(primeira.empresas.map((e) => e.contagens));
    expect(depoisDaPrimeira.produtos).toBe(2 * PRODUTOS.length);
    expect(depoisDaPrimeira.tenants).toBe(1);
    expect(depoisDaPrimeira.empresas).toBe(2);
  });

  it("a segunda execução não muda os saldos", async () => {
    const agora = (await pool.query("select * from estoque_saldos order by id")).rows;
    expect(agora).toEqual(saldosDaPrimeira);
  });

  it("os saldos batem com a soma dos movimentos saldo_inicial, e só existem movimentos saldo_inicial", async () => {
    for (const e of EMPRESAS_DEMO) {
      expect(await saldosDivergentes(db, await empresaId(e.cnpj))).toEqual([]);
    }
    const tipos = await pool.query("select distinct tipo, motivo from movimentacoes_estoque");
    expect(tipos.rows).toEqual([{ tipo: "saldo_inicial", motivo: "Seed de demonstração" }]);
    // a outbox recebeu um evento por saldo lançado
    expect(depoisDaPrimeira.outbox).toBe(depoisDaPrimeira.movimentacoes_estoque);
  });

  it("existem produtos abaixo do mínimo nas duas empresas", () => {
    for (const e of primeira.empresas) expect(e.contagens.abaixo_do_minimo).toBeGreaterThanOrEqual(3);
  });

  it("reaproveita a tabela Balcão da criação da empresa e cria as outras três", async () => {
    for (const e of EMPRESAS_DEMO) {
      const tabelas = await db
        .select({ nome: tabelasPreco.nome, padrao: tabelasPreco.padrao })
        .from(tabelasPreco)
        .where(eq(tabelasPreco.empresaId, await empresaId(e.cnpj)));
      expect(tabelas.map((t) => t.nome).sort()).toEqual(["Balcão", "E-commerce", "Mecânico parceiro", "Mercado Livre"]);
      expect(tabelas.filter((t) => t.padrao).map((t) => t.nome)).toEqual(["Balcão"]);
    }
  });

  it("empresas com todos os módulos ligados, arredondamento ,90 e contador de produto depois do maior código", async () => {
    for (const e of EMPRESAS_DEMO) {
      const id = await empresaId(e.cnpj);
      const [empresa] = await db.select().from(empresas).where(eq(empresas.id, id));
      expect(Object.values(empresa.modulos).every(Boolean)).toBe(true);
      expect(empresa.config).toMatchObject({
        arredondamento_preco: { modo: "terminacao", centavos: "0.90", direcao: "cima" },
        limite_desconto_percentual: { balcao: "5.0000" },
      });
      const [seq] = await db
        .select({ ultimo: sequencias.ultimoValor })
        .from(sequencias)
        .where(and(eq(sequencias.empresaId, id), eq(sequencias.chave, "produto")));
      expect(seq.ultimo).toBe(1009);
    }
  });

  it("usuários com a senha do ambiente, PIN do dono definido e mecânico só na empresa do Simples", async () => {
    const [dono] = await db
      .select({ id: usuarios.id, hash: contasAcesso.password })
      .from(usuarios)
      .innerJoin(contasAcesso, eq(contasAcesso.userId, usuarios.id))
      .where(eq(usuarios.email, "dono@demo.summer.local"));
    expect(await verifyPassword({ hash: dono.hash as string, password: CONFIG.senhas.SEED_SENHA_DONO })).toBe(true);
    const pins = await db
      .select({ pin: membros.pinHash })
      .from(membros)
      .where(and(eq(membros.usuarioId, dono.id), eq(membros.perfil, "dono")));
    expect(pins).toHaveLength(2);
    for (const p of pins) expect(p.pin).toBeTruthy();

    const mecanico = await pool.query(
      `select e.regime_tributario from membros m join usuarios u on u.id = m.usuario_id
         join empresas e on e.id = m.empresa_id where u.email = 'mecanico@demo.summer.local'`,
    );
    expect(mecanico.rows).toEqual([{ regime_tributario: "simples_nacional" }]);
    const [admin] = await db
      .select({ admin: usuarios.adminPlataforma })
      .from(usuarios)
      .where(eq(usuarios.email, "admin@demo.summer.local"));
    expect(admin.admin).toBe(true);
    const membrosDoAdmin = await db.execute(
      sql`select 1 from membros m join usuarios u on u.id = m.usuario_id where u.email = 'admin@demo.summer.local'`,
    );
    expect(membrosDoAdmin.rows).toHaveLength(0);
  });
});

describe("recusa fora de local/homologação (CLI)", () => {
  function rodarCli(env: Record<string, string>, args: string[] = []) {
    return spawnSync(process.execPath, ["--import", "tsx", "scripts/seed/index.ts", ...args], {
      encoding: "utf8",
      timeout: 60_000,
      // aponta para o banco de teste: mesmo que a trava falhasse, nada iria para outro banco
      env: { ...process.env, ...CONFIG.senhas, SEED_PIN_DONO: CONFIG.pinDono, DATABASE_URL: urlBancoTeste(), ...env },
    });
  }

  // [ambiente, argumentos]: o --forcar-homologacao não libera produção nem o "local" com NODE_ENV=production
  it.each([
    [{ SUMMER_AMBIENTE: "producao", NODE_ENV: "development" }, []],
    [{ SUMMER_AMBIENTE: "producao", NODE_ENV: "production" }, ["--forcar-homologacao"]],
    [{ SUMMER_AMBIENTE: "", NODE_ENV: "development" }, []],
    [{ SUMMER_AMBIENTE: "local", NODE_ENV: "production" }, ["--forcar-homologacao"]],
    [{ SUMMER_AMBIENTE: "homologacao", NODE_ENV: "production" }, []],
  ])("recusa com %j %j, sem tocar no banco", async (env, args) => {
    const antes = await contarTudo();
    const r = rodarCli(env, args);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/Seed recusado/);
    expect(await contarTudo()).toEqual(antes);
  }, 60_000);

  it("--ajuda mostra a regra de ambiente", () => {
    const r = rodarCli({ SUMMER_AMBIENTE: "producao" }, ["--ajuda"]);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/SUMMER_AMBIENTE=local ou SUMMER_AMBIENTE=homologacao/);
    expect(r.stdout).toMatch(/--forcar-homologacao/);
  }, 60_000);
});
