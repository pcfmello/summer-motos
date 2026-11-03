/**
 * Catálogo do Postgres como guarda de regressão do isolamento (D003, modelo 1.5):
 * uma tabela ou FK nova que esquecer a empresa quebra este teste.
 */
import { afterAll, describe, expect, it } from "vitest";
import { abrirBanco } from "./_cenario";

const { pool } = abrirBanco();

afterAll(async () => {
  await pool.end();
});

/** Tabelas do schema public que têm a coluna empresa_id. */
const TABELAS_COM_EMPRESA = `
  select c.oid, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r'
     and exists (select 1 from pg_attribute a
                  where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)`;

const coluna = (rel: string, num: string) =>
  `(select attname from pg_attribute where attrelid = ${rel} and attnum = ${num})`;

describe("restrições de isolamento no catálogo", () => {
  it("toda tabela com empresa_id tem unique (empresa_id, id)", async () => {
    const r = await pool.query<{ relname: string }>(`
      with t as (${TABELAS_COM_EMPRESA})
      select t.relname from t
       where not exists (
         select 1 from pg_constraint u
          where u.conrelid = t.oid and u.contype = 'u'
            and array_length(u.conkey, 1) = 2
            and ${coluna("t.oid", "u.conkey[1]")} = 'empresa_id'
            and ${coluna("t.oid", "u.conkey[2]")} = 'id')
       order by 1`);
    expect(r.rows).toEqual([]);

    const total = await pool.query(`with t as (${TABELAS_COM_EMPRESA}) select count(*)::int as n from t`);
    // 59 tabelas menos as 8 globais (plataforma, Better Auth e referência de motos)
    expect(total.rows[0].n).toBe(51);
  });

  it("toda FK entre duas tabelas com empresa_id começa por empresa_id nos dois lados", async () => {
    const r = await pool.query<{ conname: string }>(`
      with t as (${TABELAS_COM_EMPRESA})
      select con.conname from pg_constraint con
       where con.contype = 'f'
         and con.conrelid in (select oid from t)
         and con.confrelid in (select oid from t)
         and (${coluna("con.conrelid", "con.conkey[1]")} <> 'empresa_id'
              or ${coluna("con.confrelid", "con.confkey[1]")} <> 'empresa_id')
       order by 1`);
    expect(r.rows).toEqual([]);
  });

  it("só as FKs técnicas do Better Auth usam ON DELETE CASCADE; as demais são RESTRICT", async () => {
    const r = await pool.query<{ conname: string; acao: string }>(`
      select conname, confdeltype::text as acao from pg_constraint
       where contype = 'f' and connamespace = 'public'::regnamespace and confdeltype <> 'r'
       order by 1`);
    expect(r.rows).toEqual([
      { conname: "contas_acesso_user_id_fk", acao: "c" },
      { conname: "sessoes_empresa_ativa_id_fk", acao: "c" },
      { conname: "sessoes_user_id_fk", acao: "c" },
    ]);
  });
});
