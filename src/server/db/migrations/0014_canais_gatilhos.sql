-- Gatilhos set_updated_at (D005) dos canais de venda (passo 8 da seção 15).

CREATE TRIGGER canais_venda_set_updated_at BEFORE UPDATE ON public.canais_venda
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER canal_anuncios_set_updated_at BEFORE UPDATE ON public.canal_anuncios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER pedidos_canal_set_updated_at BEFORE UPDATE ON public.pedidos_canal
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER pedido_canal_itens_set_updated_at BEFORE UPDATE ON public.pedido_canal_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER eventos_integracao_set_updated_at BEFORE UPDATE ON public.eventos_integracao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER api_chaves_set_updated_at BEFORE UPDATE ON public.api_chaves
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER outbox_set_updated_at BEFORE UPDATE ON public.outbox
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
