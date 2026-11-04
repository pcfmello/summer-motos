-- Gatilho set_updated_at (D005) da tabela convites (D033).

CREATE TRIGGER convites_set_updated_at BEFORE UPDATE ON public.convites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
