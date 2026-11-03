-- Migração custom 1 (docs/modelo-dados.md, seções 1.6 e 15): extensões e funções.
-- O drizzle-kit não gera nada disto. Os gatilhos que usam as funções são criados
-- nas migrações custom de cada módulo.

-- Busca sem acento e por trecho (pg_trgm + unaccent). As duas vêm no contrib da
-- imagem oficial do Postgres 17.
CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS unaccent;
--> statement-breakpoint

-- unaccent() é STABLE (depende do dicionário configurado) e não pode ir num índice.
-- O wrapper fixa o dicionário pelo nome qualificado, o que o torna seguro como
-- IMMUTABLE. As queries de busca usam exatamente f_unaccent(lower(coluna)).
CREATE OR REPLACE FUNCTION public.f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;
--> statement-breakpoint

-- updated_at por gatilho (D005): vale para qualquer caminho de escrita.
-- now() é o início da transação, o mesmo relógio do created_at.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- Append-only (D008, 1.6): movimentacoes_estoque, auditoria e os_historico_status.
-- Erro se corrige com estorno, nunca reescrevendo o histórico.
-- Não impede TRUNCATE: o usuário do app não tem esse privilégio (docs/deploy.md).
CREATE OR REPLACE FUNCTION public.bloquear_alteracao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  RAISE EXCEPTION 'a tabela % só aceita inserções (append-only): % não é permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Corrija com um novo registro (estorno), nunca alterando ou apagando o existente.';
END;
$$;
--> statement-breakpoint

-- Status final não volta (D018: a OS fechada não reabre). Uso:
--   BEFORE UPDATE OF <coluna> ... EXECUTE FUNCTION bloquear_saida_status_final('<coluna>', '<final1>', ...)
-- Recusa a mudança da coluna quando o valor antigo é um dos finais. As demais
-- colunas da linha continuam podendo mudar (ex.: status fiscal da OS entregue).
CREATE OR REPLACE FUNCTION public.bloquear_saida_status_final() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  coluna text := TG_ARGV[0];
  anterior text := to_jsonb(OLD) ->> coluna;
  novo text := to_jsonb(NEW) ->> coluna;
BEGIN
  IF novo IS DISTINCT FROM anterior THEN
    FOR i IN 1 .. TG_NARGS - 1 LOOP
      IF anterior = TG_ARGV[i] THEN
        RAISE EXCEPTION '%.%: "%" é final e não muda para "%"', TG_TABLE_NAME, coluna, anterior, novo
          USING ERRCODE = 'restrict_violation';
      END IF;
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

-- empresa_grupo_id (regra 4.15) aponta para uma empresa do MESMO tenant. As tabelas
-- de negócio não têm tenant_id, então isso não cabe numa FK (modelo 1.5).
CREATE OR REPLACE FUNCTION public.validar_empresa_grupo() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF NEW.empresa_grupo_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.empresas e JOIN public.empresas g ON g.tenant_id = e.tenant_id
        WHERE e.id = NEW.empresa_id AND g.id = NEW.empresa_grupo_id) THEN
    RAISE EXCEPTION '%: a empresa do grupo precisa ser do mesmo tenant', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
