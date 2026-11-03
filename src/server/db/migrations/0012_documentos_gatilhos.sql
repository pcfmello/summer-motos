-- Gatilhos dos documentos comerciais (passo 7 da seção 15).
-- set_updated_at (D005) em todas, exceto as append-only os_historico_status e comissao_ajustes (1.6).

CREATE TRIGGER orcamentos_set_updated_at BEFORE UPDATE ON public.orcamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER orcamento_itens_set_updated_at BEFORE UPDATE ON public.orcamento_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER acertos_comissao_set_updated_at BEFORE UPDATE ON public.acertos_comissao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER vendas_set_updated_at BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER venda_itens_set_updated_at BEFORE UPDATE ON public.venda_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER venda_pagamentos_set_updated_at BEFORE UPDATE ON public.venda_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER ordens_servico_set_updated_at BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER os_itens_set_updated_at BEFORE UPDATE ON public.os_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER os_pagamentos_set_updated_at BEFORE UPDATE ON public.os_pagamentos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER devolucoes_set_updated_at BEFORE UPDATE ON public.devolucoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint
CREATE TRIGGER devolucao_itens_set_updated_at BEFORE UPDATE ON public.devolucao_itens
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
--> statement-breakpoint

-- os_historico_status [A]: toda mudança de status da OS fica registrada (D17 do modelo).
CREATE TRIGGER os_historico_status_bloquear_alteracao BEFORE UPDATE OR DELETE ON public.os_historico_status
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_alteracao();
--> statement-breakpoint

-- comissao_ajustes [A] com uma exceção (7.11): o único UPDATE aceito preenche
-- acerto_comissao_id de nulo para um valor, uma vez, sem mudar nenhuma outra coluna.
-- O updated_at passa a marcar quando o acerto absorveu o ajuste. DELETE é recusado.
CREATE OR REPLACE FUNCTION public.comissao_ajustes_bloquear_alteracao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.acerto_comissao_id IS NULL
     AND NEW.acerto_comissao_id IS NOT NULL
     AND (to_jsonb(NEW) - 'acerto_comissao_id' - 'updated_at')
         = (to_jsonb(OLD) - 'acerto_comissao_id' - 'updated_at') THEN
    NEW.updated_at := now();
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'comissao_ajustes só aceita inserções e o preenchimento único de acerto_comissao_id: % não é permitido', TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = 'Corrija com um novo ajuste, nunca alterando ou apagando o existente.';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER comissao_ajustes_bloquear_alteracao BEFORE UPDATE OR DELETE ON public.comissao_ajustes
  FOR EACH ROW EXECUTE FUNCTION public.comissao_ajustes_bloquear_alteracao();
--> statement-breakpoint

-- OS entregue ou cancelada não muda de status (D018); venda cancelada não volta
CREATE TRIGGER ordens_servico_status_final BEFORE UPDATE OF status ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_saida_status_final('status', 'entregue', 'cancelada');
--> statement-breakpoint
CREATE TRIGGER vendas_status_final BEFORE UPDATE OF status ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.bloquear_saida_status_final('status', 'cancelada');
--> statement-breakpoint

-- empresa do grupo só no mesmo tenant (regra 4.15)
CREATE TRIGGER vendas_validar_empresa_grupo BEFORE INSERT OR UPDATE OF empresa_id, empresa_grupo_id ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.validar_empresa_grupo();
--> statement-breakpoint

-- Comissão congelada não muda (regra 4.13, D022 do modelo). Correção de comissão
-- é um novo registro em comissao_ajustes. O acerto é preenchido uma vez só.

-- Serviço da OS: congelado na entrega (comissao_congelada_em).
CREATE OR REPLACE FUNCTION public.os_itens_proteger_comissao() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
BEGIN
  IF OLD.comissao_congelada_em IS NOT NULL AND (
       NEW.comissao_congelada_em IS DISTINCT FROM OLD.comissao_congelada_em
    OR NEW.comissao_valor IS DISTINCT FROM OLD.comissao_valor
    OR NEW.mecanico_id IS DISTINCT FROM OLD.mecanico_id) THEN
    RAISE EXCEPTION 'os_itens: a comissão do servico % está congelada', OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Corrija com um ajuste, sem alterar o item.';
  END IF;
  IF OLD.acerto_id IS NOT NULL AND NEW.acerto_id IS DISTINCT FROM OLD.acerto_id THEN
    RAISE EXCEPTION 'os_itens: o serviço % já foi pago no acerto %', OLD.id, OLD.acerto_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER os_itens_proteger_comissao BEFORE UPDATE ON public.os_itens
  FOR EACH ROW EXECUTE FUNCTION public.os_itens_proteger_comissao();
--> statement-breakpoint

-- Vendedor na venda (nasce finalizada) e na OS fechada (entregue ou cancelada).
CREATE OR REPLACE FUNCTION public.proteger_comissao_vendedor() RETURNS trigger
  LANGUAGE plpgsql
  AS $$
DECLARE
  fechado boolean := TG_TABLE_NAME = 'vendas' OR OLD.status IN ('entregue', 'cancelada');
BEGIN
  IF fechado AND (
       NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id
    OR NEW.comissao_vendedor_percentual IS DISTINCT FROM OLD.comissao_vendedor_percentual
    OR NEW.comissao_vendedor_base IS DISTINCT FROM OLD.comissao_vendedor_base
    OR NEW.comissao_vendedor_valor IS DISTINCT FROM OLD.comissao_vendedor_valor) THEN
    RAISE EXCEPTION '%: a comissão do vendedor do documento % está congelada', TG_TABLE_NAME, OLD.id
      USING ERRCODE = 'restrict_violation', HINT = 'Corrija com um registro em comissao_ajustes.';
  END IF;
  IF OLD.acerto_comissao_id IS NOT NULL AND NEW.acerto_comissao_id IS DISTINCT FROM OLD.acerto_comissao_id THEN
    RAISE EXCEPTION '%: a comissão do documento % já foi paga no acerto %', TG_TABLE_NAME, OLD.id, OLD.acerto_comissao_id
      USING ERRCODE = 'restrict_violation';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER vendas_proteger_comissao BEFORE UPDATE ON public.vendas
  FOR EACH ROW EXECUTE FUNCTION public.proteger_comissao_vendedor();
--> statement-breakpoint
CREATE TRIGGER ordens_servico_proteger_comissao BEFORE UPDATE ON public.ordens_servico
  FOR EACH ROW EXECUTE FUNCTION public.proteger_comissao_vendedor();
