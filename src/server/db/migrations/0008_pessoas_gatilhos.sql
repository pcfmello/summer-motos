-- Gatilhos set_updated_at (D005) de pessoas (passo 5 da seção 15). Os GIN de busca de clientes e fornecedores ficam no passo 10.

CREATE TRIGGER clientes_set_updated_at BEFORE UPDATE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER motos_cliente_set_updated_at BEFORE UPDATE ON public.motos_cliente
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER fornecedores_set_updated_at BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER fornecedor_produto_vinculos_set_updated_at BEFORE UPDATE ON public.fornecedor_produto_vinculos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- empresa do grupo só no mesmo tenant (regra 4.15)
CREATE TRIGGER clientes_validar_empresa_grupo BEFORE INSERT OR UPDATE OF empresa_id, empresa_grupo_id ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.validar_empresa_grupo();
--> statement-breakpoint
CREATE TRIGGER fornecedores_validar_empresa_grupo BEFORE INSERT OR UPDATE OF empresa_id, empresa_grupo_id ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.validar_empresa_grupo();
