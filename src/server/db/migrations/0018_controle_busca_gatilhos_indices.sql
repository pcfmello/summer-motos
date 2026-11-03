-- Passo 10 da seção 15: gatilhos de controle e índices de busca.

CREATE TRIGGER sequencias_set_updated_at BEFORE UPDATE ON public.sequencias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- auditoria [A]: o histórico de quem mudou o quê não pode ser reescrito (D008).
CREATE TRIGGER auditoria_bloquear_alteracao BEFORE UPDATE OR DELETE ON public.auditoria
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();
--> statement-breakpoint

-- Busca sem acento e por trecho (pg_trgm + f_unaccent da migração 0000).
-- A query precisa usar exatamente a mesma expressão, f_unaccent(lower(coluna)),
-- junto com o filtro de empresa_id. Tabelas vazias na criação: CREATE INDEX comum
-- basta. Índices novos em tabela grande, no futuro, usam CONCURRENTLY numa
-- migração própria, fora de transação.
CREATE INDEX produtos_busca_descricao_trgm ON public.produtos
  USING gin (public.f_unaccent(lower(descricao)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX produtos_busca_codigo_trgm ON public.produtos
  USING gin (public.f_unaccent(lower(codigo)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX produtos_busca_referencia_fabricante_trgm ON public.produtos
  USING gin (public.f_unaccent(lower(referencia_fabricante)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX produtos_busca_codigo_original_trgm ON public.produtos
  USING gin (public.f_unaccent(lower(codigo_original)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX clientes_busca_nome_trgm ON public.clientes
  USING gin (public.f_unaccent(lower(nome)) gin_trgm_ops);
--> statement-breakpoint
CREATE INDEX fornecedores_busca_razao_social_trgm ON public.fornecedores
  USING gin (public.f_unaccent(lower(razao_social)) gin_trgm_ops);
