-- Gatilhos set_updated_at (D005) do fiscal (passo 9 da seção 15).

CREATE TRIGGER documentos_fiscais_set_updated_at BEFORE UPDATE ON public.documentos_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER eventos_fiscais_set_updated_at BEFORE UPDATE ON public.eventos_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER notas_recebidas_set_updated_at BEFORE UPDATE ON public.notas_recebidas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
