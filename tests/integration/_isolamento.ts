/**
 * Apoio do harness de isolamento (fatia 0.12, regra 4.1).
 *
 * `fotografarEmpresa` lê, numa consulta só, todas as linhas de todas as tabelas
 * com `empresa_id` de uma empresa (mais a linha da empresa e a do tenant). O
 * harness tira uma foto da empresa "alvo" antes e depois de rodar uma operação
 * com o contexto de outra empresa: qualquer escrita no alvo (inclusive um
 * `updated_at` mexido) aparece como diferença.
 *
 * A lista de tabelas vem do catálogo, então uma tabela nova entra na foto sem
 * mudar este arquivo.
 */
type Consultavel = { query: (sql: string, valores?: unknown[]) => Promise<{ rows: unknown[] }> };

/** Tabelas do schema public com a coluna `empresa_id`, em ordem alfabética. */
export async function tabelasComEmpresa(conexao: Consultavel): Promise<string[]> {
  const r = await conexao.query(`
    select c.relname
      from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and exists (select 1 from pg_attribute a
                    where a.attrelid = c.oid and a.attname = 'empresa_id' and not a.attisdropped)
     order by 1`);
  return (r.rows as { relname: string }[]).map((l) => l.relname);
}

const aspas = (nome: string) => `"${nome.replace(/"/g, '""')}"`;

let consultaFoto: string | null = null;

/** Foto de tudo o que é da empresa: `{ tabela: linhas[] }`, linhas em ordem de id. */
export async function fotografarEmpresa(
  conexao: Consultavel,
  empresaId: string,
): Promise<Record<string, unknown>> {
  if (!consultaFoto) {
    const tabelas = await tabelasComEmpresa(conexao);
    const partes = tabelas.map(
      (t) =>
        `'${t}', (select coalesce(jsonb_agg(to_jsonb(x) order by x.id), '[]'::jsonb) from ${aspas(t)} x where x.empresa_id = $1)`,
    );
    partes.push(`'_empresa', (select to_jsonb(e) from empresas e where e.id = $1)`);
    partes.push(
      `'_tenant', (select to_jsonb(t) from tenants t join empresas e on e.tenant_id = t.id where e.id = $1)`,
    );
    // jsonb_build_object aceita no máximo 100 argumentos: junta em blocos
    const blocos: string[] = [];
    for (let i = 0; i < partes.length; i += 40) blocos.push(`jsonb_build_object(${partes.slice(i, i + 40).join(", ")})`);
    consultaFoto = `select ${blocos.join(" || ")} as foto`;
  }
  const r = await conexao.query(consultaFoto, [empresaId]);
  return (r.rows[0] as { foto: Record<string, unknown> }).foto;
}

/** Tabelas em que as duas fotos diferem (para a mensagem do teste dizer onde houve escrita). */
export function tabelasAlteradas(antes: Record<string, unknown>, depois: Record<string, unknown>): string[] {
  const nomes = new Set([...Object.keys(antes), ...Object.keys(depois)]);
  return [...nomes].filter((n) => JSON.stringify(antes[n]) !== JSON.stringify(depois[n])).sort();
}
