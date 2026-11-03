-- Gatilhos set_updated_at (D005) do catálogo (passo 4 da seção 15). Os índices GIN de busca de produtos ficam no passo 10.

CREATE TRIGGER categorias_set_updated_at BEFORE UPDATE ON public.categorias
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER marcas_set_updated_at BEFORE UPDATE ON public.marcas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER perfis_tributarios_set_updated_at BEFORE UPDATE ON public.perfis_tributarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER produtos_set_updated_at BEFORE UPDATE ON public.produtos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER produto_codigos_barras_set_updated_at BEFORE UPDATE ON public.produto_codigos_barras
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER produto_imagens_set_updated_at BEFORE UPDATE ON public.produto_imagens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER produto_aplicacoes_set_updated_at BEFORE UPDATE ON public.produto_aplicacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER servicos_set_updated_at BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER mecanicos_set_updated_at BEFORE UPDATE ON public.mecanicos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER vendedores_set_updated_at BEFORE UPDATE ON public.vendedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tabelas_preco_set_updated_at BEFORE UPDATE ON public.tabelas_preco
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER tabela_preco_itens_set_updated_at BEFORE UPDATE ON public.tabela_preco_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
