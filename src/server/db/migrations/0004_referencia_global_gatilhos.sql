-- Gatilhos set_updated_at (D005) da referência global (passo 3 da seção 15). Os índices lower(nome) já vêm da migração gerada.

CREATE TRIGGER marcas_moto_set_updated_at BEFORE UPDATE ON public.marcas_moto
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER modelos_moto_set_updated_at BEFORE UPDATE ON public.modelos_moto
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
