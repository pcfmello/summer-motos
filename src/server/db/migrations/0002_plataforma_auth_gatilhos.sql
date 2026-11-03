-- Gatilhos set_updated_at (D005) das tabelas de plataforma e acesso (passo 2 da seção 15).

CREATE TRIGGER tenants_set_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER empresas_set_updated_at BEFORE UPDATE ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER usuarios_set_updated_at BEFORE UPDATE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER sessoes_set_updated_at BEFORE UPDATE ON public.sessoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER contas_acesso_set_updated_at BEFORE UPDATE ON public.contas_acesso
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER verificacoes_set_updated_at BEFORE UPDATE ON public.verificacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER membros_set_updated_at BEFORE UPDATE ON public.membros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER credenciais_fiscais_set_updated_at BEFORE UPDATE ON public.credenciais_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
