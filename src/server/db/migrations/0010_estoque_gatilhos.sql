-- Gatilhos do estoque (passo 6 da seção 15).
-- set_updated_at (D005) em todas, exceto movimentacoes_estoque, que é append-only (D008).

CREATE TRIGGER depositos_set_updated_at BEFORE UPDATE ON public.depositos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER estoque_saldos_set_updated_at BEFORE UPDATE ON public.estoque_saldos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER estoque_reservas_set_updated_at BEFORE UPDATE ON public.estoque_reservas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER entradas_estoque_set_updated_at BEFORE UPDATE ON public.entradas_estoque
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER entrada_itens_set_updated_at BEFORE UPDATE ON public.entrada_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER inventarios_set_updated_at BEFORE UPDATE ON public.inventarios
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER inventario_itens_set_updated_at BEFORE UPDATE ON public.inventario_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- movimentacoes_estoque [A]: o saldo só muda por movimento, e erro se corrige com estorno.
CREATE TRIGGER movimentacoes_estoque_bloquear_alteracao BEFORE UPDATE OR DELETE ON public.movimentacoes_estoque
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();
--> statement-breakpoint

-- Estorno é sempre total e espelha o original: mesmo produto, mesmo depósito,
-- quantidade com sinal invertido e o mesmo custo (seção 13.2). Recusa parcial do
-- fornecedor é ajuste_manual com motivo (13.6). O índice único de estorno_de_id
-- garante um estorno por movimento.
CREATE OR REPLACE FUNCTION public.movimentacoes_estoque_validar_estorno() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  original public.movimentacoes_estoque%ROWTYPE;
BEGIN
  SELECT * INTO original FROM public.movimentacoes_estoque
   WHERE empresa_id = NEW.empresa_id AND id = NEW.estorno_de_id;
  IF NOT FOUND THEN
    RETURN NEW; -- a FK composta estorno_de_id recusa
  END IF;
  IF original.produto_id <> NEW.produto_id
     OR original.deposito_id <> NEW.deposito_id
     OR NEW.quantidade <> -original.quantidade
     OR NEW.custo_unitario IS DISTINCT FROM original.custo_unitario THEN
    RAISE EXCEPTION 'estorno inconsistente com o movimento %: precisa ter o mesmo produto, depósito e custo, com a quantidade invertida (%)',
      original.id, -original.quantidade
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER movimentacoes_estoque_validar_estorno BEFORE INSERT ON public.movimentacoes_estoque
  FOR EACH ROW WHEN (NEW.tipo = 'estorno') EXECUTE FUNCTION public.movimentacoes_estoque_validar_estorno();
--> statement-breakpoint

-- reserva consumida ou liberada não volta a ativa
CREATE TRIGGER estoque_reservas_status_final BEFORE UPDATE OF status ON public.estoque_reservas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_saida_status_final('status', 'consumida', 'liberada');
