/**
 * Recurso de migrações (fatia 0.3, D010): aplica do zero num schema limpo do
 * summer_test, reaplica sem efeito, confere o lock e o que as migrações custom criam.
 */
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PASTA_MIGRACOES_PADRAO,
  aplicarMigracoes,
  lerMigracoesArquivo,
  lerStatus,
} from "../../src/server/db/migracoes";
import { recriarSchema, urlBancoTeste } from "./_banco";

const url = urlBancoTeste();
const arquivos = lerMigracoesArquivo(PASTA_MIGRACOES_PADRAO);
let cliente: Client;

async function valor<T>(sql: string, params: unknown[] = []): Promise<T> {
  const r = await cliente.query(sql, params);
  return Object.values(r.rows[0] as Record<string, unknown>)[0] as T;
}

describe("migrações", () => {
  beforeAll(async () => {
    await recriarSchema(url);
    cliente = new Client({ connectionString: url });
    await cliente.connect();
  });

  afterAll(async () => {
    await cliente.end();
  });

  it("aplica todas do zero num schema limpo", async () => {
    expect(await valor<boolean>("select to_regclass('drizzle.__drizzle_migrations') is null")).toBe(
      true,
    );

    const { aplicadas, status } = await aplicarMigracoes({ connectionString: url });

    expect(aplicadas).toEqual(arquivos.map((a) => a.tag));
    expect(status.pendentes).toEqual([]);
    expect(await valor<string>("select count(*) from drizzle.__drizzle_migrations")).toBe(
      String(arquivos.length),
    );
  });

  it("rodar de novo não aplica nada", async () => {
    const { aplicadas, status } = await aplicarMigracoes({ connectionString: url });
    expect(aplicadas).toEqual([]);
    expect(status.aplicadas).toHaveLength(arquivos.length);

    const s = await lerStatus(url, PASTA_MIGRACOES_PADRAO);
    expect(s.pendentes).toEqual([]);
    expect(s.ignoradas).toEqual([]);
    expect(s.alteradas).toEqual([]);
    expect(s.desconhecidas).toEqual([]);
  });

  it("cria as extensões de busca", async () => {
    const r = await cliente.query<{ extname: string }>(
      "select extname from pg_extension where extname in ('pg_trgm', 'unaccent') order by extname",
    );
    expect(r.rows.map((l) => l.extname)).toEqual(["pg_trgm", "unaccent"]);
  });

  it("cria as funções, com f_unaccent IMMUTABLE", async () => {
    expect(
      await valor<string>(
        "select provolatile from pg_proc where oid = 'public.f_unaccent(text)'::regprocedure",
      ),
    ).toBe("i");
    const funcoes = await cliente.query<{ proname: string }>(
      `select proname from pg_proc p join pg_language l on l.oid = p.prolang
        where p.pronamespace = 'public'::regnamespace and l.lanname = 'plpgsql' order by proname`,
    );
    expect(funcoes.rows.map((f) => f.proname)).toEqual([
      "bloquear_alteracao",
      "bloquear_saida_status_final",
      "comissao_ajustes_bloquear_alteracao",
      "movimentacoes_estoque_validar_estorno",
      "os_itens_proteger_comissao",
      "proteger_comissao_vendedor",
      "set_updated_at",
      "validar_empresa_grupo",
    ]);
    expect(await valor<string>("select public.f_unaccent('Óleo de câmbio')")).toBe("Oleo de cambio");
  });

  it("cria as 60 tabelas do modelo (59 + convites, D033) e os gatilhos", async () => {
    expect(
      await valor<string>("select count(*) from pg_tables where schemaname = 'public'"),
    ).toBe("60");

    const gatilhos = await cliente.query<{ funcao: string; tabelas: string }>(
      `select p.proname as funcao, string_agg(c.relname, ',' order by c.relname) as tabelas
         from pg_trigger t
         join pg_proc p on p.oid = t.tgfoid
         join pg_class c on c.oid = t.tgrelid
        where not t.tgisinternal and p.proname <> 'set_updated_at'
        group by p.proname order by p.proname`,
    );
    expect(gatilhos.rows).toEqual([
      { funcao: "bloquear_alteracao", tabelas: "auditoria,movimentacoes_estoque,os_historico_status" },
      { funcao: "bloquear_saida_status_final", tabelas: "estoque_reservas,ordens_servico,vendas" },
      { funcao: "comissao_ajustes_bloquear_alteracao", tabelas: "comissao_ajustes" },
      { funcao: "movimentacoes_estoque_validar_estorno", tabelas: "movimentacoes_estoque" },
      { funcao: "os_itens_proteger_comissao", tabelas: "os_itens" },
      { funcao: "proteger_comissao_vendedor", tabelas: "ordens_servico,vendas" },
      { funcao: "validar_empresa_grupo", tabelas: "clientes,fornecedores,vendas" },
    ]);
    // updated_at: todas as tabelas menos as 4 append-only
    expect(
      await valor<string>(
        `select count(*) from pg_trigger t join pg_proc p on p.oid = t.tgfoid
          where not t.tgisinternal and p.proname = 'set_updated_at'`,
      ),
    ).toBe("56");
  });

  it("toda tabela tem id, created_at e updated_at", async () => {
    const r = await cliente.query<{ tabela: string }>(
      `select t.tablename as tabela from pg_tables t
        where t.schemaname = 'public'
          and (select count(*) from information_schema.columns c
                where c.table_schema = 'public' and c.table_name = t.tablename
                  and c.column_name in ('id', 'created_at', 'updated_at')) <> 3`,
    );
    expect(r.rows).toEqual([]);
  });

  it("dois processos migrando ao mesmo tempo: o advisory lock serializa", async () => {
    await recriarSchema(url);
    const [a, b] = await Promise.all([
      aplicarMigracoes({ connectionString: url }),
      aplicarMigracoes({ connectionString: url }),
    ]);
    // um aplicou tudo; o outro esperou o lock e não encontrou pendência
    expect([a.aplicadas.length, b.aplicadas.length].sort((x, y) => x - y)).toEqual([
      0,
      arquivos.length,
    ]);
    expect(await valor<string>("select count(*) from drizzle.__drizzle_migrations")).toBe(
      String(arquivos.length),
    );
  });
});
