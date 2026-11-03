CREATE TABLE "acertos_comissao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"beneficiario_tipo" text NOT NULL,
	"mecanico_id" uuid,
	"vendedor_id" uuid,
	"periodo_inicio" date NOT NULL,
	"periodo_fim" date NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"forma" text NOT NULL,
	"pago_por" uuid NOT NULL,
	"pago_em" timestamp with time zone DEFAULT now() NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "acertos_comissao_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "acertos_comissao_empresa_id_numero_key" UNIQUE("empresa_id","numero"),
	CONSTRAINT "acertos_comissao_beneficiario_tipo_check" CHECK ("acertos_comissao"."beneficiario_tipo" in ('mecanico', 'vendedor')),
	CONSTRAINT "acertos_comissao_periodo_fim_check" CHECK ("acertos_comissao"."periodo_fim" >= "acertos_comissao"."periodo_inicio"),
	CONSTRAINT "acertos_comissao_valor_check" CHECK ("acertos_comissao"."valor" > 0),
	CONSTRAINT "acertos_comissao_forma_check" CHECK ("acertos_comissao"."forma" in ('pix', 'dinheiro')),
	CONSTRAINT "acertos_comissao_beneficiario_check" CHECK (("acertos_comissao"."beneficiario_tipo" = 'mecanico' and "acertos_comissao"."mecanico_id" is not null and "acertos_comissao"."vendedor_id" is null) or ("acertos_comissao"."beneficiario_tipo" = 'vendedor' and "acertos_comissao"."vendedor_id" is not null and "acertos_comissao"."mecanico_id" is null))
);
--> statement-breakpoint
CREATE TABLE "comissao_ajustes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"vendedor_id" uuid NOT NULL,
	"venda_id" uuid,
	"ordem_servico_id" uuid,
	"devolucao_id" uuid,
	"valor" numeric(14, 2) NOT NULL,
	"motivo" text NOT NULL,
	"acerto_comissao_id" uuid,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comissao_ajustes_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "comissao_ajustes_valor_check" CHECK ("comissao_ajustes"."valor" <> 0),
	CONSTRAINT "comissao_ajustes_origem_check" CHECK (num_nonnulls("comissao_ajustes"."venda_id", "comissao_ajustes"."ordem_servico_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "devolucao_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"devolucao_id" uuid NOT NULL,
	"produto_id" uuid,
	"deposito_id" uuid,
	"venda_item_id" uuid,
	"os_item_id" uuid,
	"entrada_item_id" uuid,
	"quantidade" numeric(14, 4) NOT NULL,
	"valor_unitario" numeric(14, 2) NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"custo_unitario" numeric(16, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devolucao_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "devolucao_itens_quantidade_check" CHECK ("devolucao_itens"."quantidade" > 0),
	CONSTRAINT "devolucao_itens_valor_unitario_check" CHECK ("devolucao_itens"."valor_unitario" >= 0),
	CONSTRAINT "devolucao_itens_valor_total_check" CHECK ("devolucao_itens"."valor_total" >= 0),
	CONSTRAINT "devolucao_itens_custo_unitario_check" CHECK ("devolucao_itens"."custo_unitario" >= 0),
	CONSTRAINT "devolucao_itens_origem_check" CHECK (num_nonnulls("devolucao_itens"."venda_item_id", "devolucao_itens"."os_item_id", "devolucao_itens"."entrada_item_id") <= 1),
	CONSTRAINT "devolucao_itens_deposito_check" CHECK (("devolucao_itens"."produto_id" is null) = ("devolucao_itens"."deposito_id" is null)),
	CONSTRAINT "devolucao_itens_mao_de_obra_check" CHECK ("devolucao_itens"."produto_id" is not null or "devolucao_itens"."os_item_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "devolucoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"tipo" text NOT NULL,
	"status" text,
	"venda_id" uuid,
	"ordem_servico_id" uuid,
	"entrada_id" uuid,
	"cliente_id" uuid,
	"fornecedor_id" uuid,
	"garantia" boolean DEFAULT false NOT NULL,
	"motivo" text NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"valor_devolvido" numeric(14, 2),
	"forma_devolucao" text,
	"documento_fiscal_id" uuid,
	"status_fiscal" text DEFAULT 'nao_emitido' NOT NULL,
	"usuario_id" uuid NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "devolucoes_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "devolucoes_empresa_id_numero_key" UNIQUE("empresa_id","numero"),
	CONSTRAINT "devolucoes_tipo_check" CHECK ("devolucoes"."tipo" in ('cliente', 'fornecedor')),
	CONSTRAINT "devolucoes_status_check" CHECK ("devolucoes"."status" in ('enviado', 'aceito', 'recusado')),
	CONSTRAINT "devolucoes_valor_total_check" CHECK ("devolucoes"."valor_total" >= 0),
	CONSTRAINT "devolucoes_valor_devolvido_check" CHECK ("devolucoes"."valor_devolvido" >= 0),
	CONSTRAINT "devolucoes_forma_devolucao_check" CHECK ("devolucoes"."forma_devolucao" in ('dinheiro', 'pix', 'estorno_cartao', 'marketplace', 'outros')),
	CONSTRAINT "devolucoes_status_fiscal_check" CHECK ("devolucoes"."status_fiscal" in ('nao_emitido', 'processando', 'autorizado', 'erro', 'cancelado', 'denegado', 'externo')),
	CONSTRAINT "devolucoes_tipo_origem_check" CHECK (("devolucoes"."tipo" = 'cliente' and "devolucoes"."cliente_id" is not null and num_nonnulls("devolucoes"."venda_id", "devolucoes"."ordem_servico_id") = 1 and "devolucoes"."fornecedor_id" is null and "devolucoes"."status" is null and "devolucoes"."valor_devolvido" is not null and "devolucoes"."forma_devolucao" is not null) or ("devolucoes"."tipo" = 'fornecedor' and "devolucoes"."fornecedor_id" is not null and "devolucoes"."status" is not null and "devolucoes"."venda_id" is null and "devolucoes"."ordem_servico_id" is null and "devolucoes"."valor_devolvido" is null and "devolucoes"."forma_devolucao" is null))
);
--> statement-breakpoint
CREATE TABLE "orcamento_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"orcamento_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"tipo" text NOT NULL,
	"produto_id" uuid,
	"servico_id" uuid,
	"codigo" text,
	"descricao" text NOT NULL,
	"unidade" text,
	"quantidade" numeric(14, 4) NOT NULL,
	"preco_unitario" numeric(14, 2) NOT NULL,
	"valor_bruto" numeric(14, 2) NOT NULL,
	"desconto_item" numeric(14, 2) DEFAULT '0' NOT NULL,
	"desconto_rateado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"mecanico_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orcamento_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "orcamento_itens_tipo_check" CHECK ("orcamento_itens"."tipo" in ('produto', 'servico')),
	CONSTRAINT "orcamento_itens_quantidade_check" CHECK ("orcamento_itens"."quantidade" > 0),
	CONSTRAINT "orcamento_itens_preco_unitario_check" CHECK ("orcamento_itens"."preco_unitario" >= 0),
	CONSTRAINT "orcamento_itens_desconto_item_check" CHECK ("orcamento_itens"."desconto_item" >= 0),
	CONSTRAINT "orcamento_itens_desconto_rateado_check" CHECK ("orcamento_itens"."desconto_rateado" >= 0),
	CONSTRAINT "orcamento_itens_valor_total_check" CHECK ("orcamento_itens"."valor_total" >= 0),
	CONSTRAINT "orcamento_itens_valor_bruto_check" CHECK ("orcamento_itens"."valor_bruto" = round("orcamento_itens"."quantidade" * "orcamento_itens"."preco_unitario", 2)),
	CONSTRAINT "orcamento_itens_valor_total_calculo_check" CHECK ("orcamento_itens"."valor_total" = "orcamento_itens"."valor_bruto" - "orcamento_itens"."desconto_item" - "orcamento_itens"."desconto_rateado"),
	CONSTRAINT "orcamento_itens_tipo_referencia_check" CHECK (("orcamento_itens"."tipo" = 'produto' and "orcamento_itens"."produto_id" is not null and "orcamento_itens"."servico_id" is null and "orcamento_itens"."mecanico_id" is null) or ("orcamento_itens"."tipo" = 'servico' and "orcamento_itens"."produto_id" is null))
);
--> statement-breakpoint
CREATE TABLE "orcamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"cliente_id" uuid,
	"cliente_nome" text,
	"moto_cliente_id" uuid,
	"moto_descricao" text,
	"vendedor_id" uuid,
	"tabela_preco_id" uuid NOT NULL,
	"validade" date NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"valor_produtos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_servicos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"desconto_autorizado_por" uuid,
	"observacoes" text,
	"usuario_id" uuid NOT NULL,
	"venda_id" uuid,
	"ordem_servico_id" uuid,
	"convertido_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orcamentos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "orcamentos_empresa_id_numero_key" UNIQUE("empresa_id","numero"),
	CONSTRAINT "orcamentos_status_check" CHECK ("orcamentos"."status" in ('aberto', 'aprovado', 'recusado', 'convertido')),
	CONSTRAINT "orcamentos_valor_desconto_check" CHECK ("orcamentos"."valor_desconto" >= 0),
	CONSTRAINT "orcamentos_valor_total_check" CHECK ("orcamentos"."valor_total" >= 0),
	CONSTRAINT "orcamentos_cliente_check" CHECK ("orcamentos"."cliente_id" is not null or "orcamentos"."cliente_nome" is not null),
	CONSTRAINT "orcamentos_conversao_check" CHECK (("orcamentos"."status" = 'convertido') = (num_nonnulls("orcamentos"."venda_id", "orcamentos"."ordem_servico_id") = 1))
);
--> statement-breakpoint
CREATE TABLE "ordens_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"cliente_id" uuid NOT NULL,
	"moto_cliente_id" uuid NOT NULL,
	"km_entrada" integer,
	"defeito_relatado" text NOT NULL,
	"diagnostico" text,
	"mecanico_responsavel_id" uuid,
	"vendedor_id" uuid,
	"comissao_vendedor_percentual" numeric(7, 4),
	"comissao_vendedor_base" numeric(14, 2),
	"comissao_vendedor_valor" numeric(14, 2),
	"acerto_comissao_id" uuid,
	"previsao_entrega" timestamp with time zone,
	"status" text DEFAULT 'aberta' NOT NULL,
	"orcamento_id" uuid,
	"deposito_id" uuid NOT NULL,
	"deposito_vendavel" boolean DEFAULT true NOT NULL,
	"tabela_preco_id" uuid NOT NULL,
	"valor_pecas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_servicos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"desconto_autorizado_por" uuid,
	"quitada_em" timestamp with time zone,
	"entregue_em" timestamp with time zone,
	"entregue_por" uuid,
	"cancelada_em" timestamp with time zone,
	"motivo_cancelamento" text,
	"status_fiscal" text DEFAULT 'nao_emitido' NOT NULL,
	"emissor_fiscal" text,
	"documento_fiscal_id" uuid,
	"usuario_id" uuid NOT NULL,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ordens_servico_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "ordens_servico_empresa_id_numero_key" UNIQUE("empresa_id","numero"),
	CONSTRAINT "ordens_servico_deposito_vendavel_check" CHECK ("ordens_servico"."deposito_vendavel"),
	CONSTRAINT "ordens_servico_km_entrada_check" CHECK ("ordens_servico"."km_entrada" >= 0),
	CONSTRAINT "ordens_servico_comissao_vendedor_percentual_check" CHECK ("ordens_servico"."comissao_vendedor_percentual" between 0 and 100),
	CONSTRAINT "ordens_servico_comissao_vendedor_base_check" CHECK ("ordens_servico"."comissao_vendedor_base" >= 0),
	CONSTRAINT "ordens_servico_comissao_vendedor_valor_check" CHECK ("ordens_servico"."comissao_vendedor_valor" >= 0),
	CONSTRAINT "ordens_servico_status_check" CHECK ("ordens_servico"."status" in ('aberta', 'aguardando_peca', 'em_execucao', 'pronta', 'entregue', 'cancelada')),
	CONSTRAINT "ordens_servico_valor_desconto_check" CHECK ("ordens_servico"."valor_desconto" >= 0),
	CONSTRAINT "ordens_servico_valor_total_check" CHECK ("ordens_servico"."valor_total" >= 0),
	CONSTRAINT "ordens_servico_status_fiscal_check" CHECK ("ordens_servico"."status_fiscal" in ('nao_emitido', 'processando', 'autorizado', 'erro', 'cancelado', 'denegado', 'externo')),
	CONSTRAINT "ordens_servico_emissor_fiscal_check" CHECK ("ordens_servico"."emissor_fiscal" in ('focus', 'nao_fiscal')),
	CONSTRAINT "ordens_servico_entrega_check" CHECK ("ordens_servico"."status" <> 'entregue' or "ordens_servico"."entregue_em" is not null),
	CONSTRAINT "ordens_servico_cancelamento_check" CHECK ("ordens_servico"."status" <> 'cancelada' or ("ordens_servico"."cancelada_em" is not null and "ordens_servico"."motivo_cancelamento" is not null)),
	CONSTRAINT "ordens_servico_comissao_completa_check" CHECK (num_nonnulls("ordens_servico"."comissao_vendedor_percentual", "ordens_servico"."comissao_vendedor_base", "ordens_servico"."comissao_vendedor_valor") in (0, 3)),
	CONSTRAINT "ordens_servico_comissao_entregue_check" CHECK ("ordens_servico"."comissao_vendedor_valor" is null or ("ordens_servico"."status" = 'entregue' and "ordens_servico"."vendedor_id" is not null)),
	CONSTRAINT "ordens_servico_comissao_congelada_check" CHECK ("ordens_servico"."status" <> 'entregue' or "ordens_servico"."vendedor_id" is null or "ordens_servico"."comissao_vendedor_valor" is not null),
	CONSTRAINT "ordens_servico_comissao_vendedor_calculo_check" CHECK ("ordens_servico"."comissao_vendedor_valor" = round("ordens_servico"."comissao_vendedor_base" * "ordens_servico"."comissao_vendedor_percentual" / 100, 2)),
	CONSTRAINT "ordens_servico_acerto_comissao_check" CHECK ("ordens_servico"."acerto_comissao_id" is null or "ordens_servico"."comissao_vendedor_valor" is not null)
);
--> statement-breakpoint
CREATE TABLE "os_historico_status" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_servico_id" uuid NOT NULL,
	"status_anterior" text,
	"status_novo" text NOT NULL,
	"motivo" text,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_historico_status_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "os_historico_status_status_anterior_check" CHECK ("os_historico_status"."status_anterior" in ('aberta', 'aguardando_peca', 'em_execucao', 'pronta', 'entregue', 'cancelada')),
	CONSTRAINT "os_historico_status_status_novo_check" CHECK ("os_historico_status"."status_novo" in ('aberta', 'aguardando_peca', 'em_execucao', 'pronta', 'entregue', 'cancelada'))
);
--> statement-breakpoint
CREATE TABLE "os_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_servico_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"quantidade" numeric(14, 4) NOT NULL,
	"preco_unitario" numeric(14, 2) NOT NULL,
	"valor_bruto" numeric(14, 2) NOT NULL,
	"desconto_item" numeric(14, 2) DEFAULT '0' NOT NULL,
	"desconto_rateado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"produto_id" uuid,
	"codigo" text,
	"ncm" text,
	"unidade" text,
	"custo_unitario" numeric(16, 6),
	"servico_id" uuid,
	"mecanico_id" uuid,
	"comissao_valor" numeric(14, 2),
	"comissao_congelada_em" timestamp with time zone,
	"acerto_id" uuid,
	"removido_em" timestamp with time zone,
	"removido_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "os_itens_empresa_id_id_produto_id_key" UNIQUE("empresa_id","id","produto_id"),
	CONSTRAINT "os_itens_tipo_check" CHECK ("os_itens"."tipo" in ('produto', 'servico')),
	CONSTRAINT "os_itens_quantidade_check" CHECK ("os_itens"."quantidade" > 0),
	CONSTRAINT "os_itens_preco_unitario_check" CHECK ("os_itens"."preco_unitario" >= 0),
	CONSTRAINT "os_itens_desconto_item_check" CHECK ("os_itens"."desconto_item" >= 0),
	CONSTRAINT "os_itens_desconto_rateado_check" CHECK ("os_itens"."desconto_rateado" >= 0),
	CONSTRAINT "os_itens_valor_total_check" CHECK ("os_itens"."valor_total" >= 0),
	CONSTRAINT "os_itens_valor_bruto_check" CHECK ("os_itens"."valor_bruto" = round("os_itens"."quantidade" * "os_itens"."preco_unitario", 2)),
	CONSTRAINT "os_itens_valor_total_calculo_check" CHECK ("os_itens"."valor_total" = "os_itens"."valor_bruto" - "os_itens"."desconto_item" - "os_itens"."desconto_rateado"),
	CONSTRAINT "os_itens_ncm_check" CHECK ("os_itens"."ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "os_itens_custo_unitario_check" CHECK ("os_itens"."custo_unitario" >= 0),
	CONSTRAINT "os_itens_comissao_valor_check" CHECK ("os_itens"."comissao_valor" >= 0),
	CONSTRAINT "os_itens_tipo_referencia_check" CHECK (("os_itens"."tipo" = 'produto' and "os_itens"."produto_id" is not null and "os_itens"."servico_id" is null and "os_itens"."mecanico_id" is null and "os_itens"."comissao_valor" is null) or ("os_itens"."tipo" = 'servico' and "os_itens"."produto_id" is null and "os_itens"."comissao_valor" is not null)),
	CONSTRAINT "os_itens_acerto_check" CHECK ("os_itens"."acerto_id" is null or "os_itens"."comissao_congelada_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "os_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ordem_servico_id" uuid NOT NULL,
	"forma" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"parcelas" smallint DEFAULT 1 NOT NULL,
	"troco" numeric(14, 2) DEFAULT '0' NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "os_pagamentos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "os_pagamentos_forma_check" CHECK ("os_pagamentos"."forma" in ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'crediario', 'marketplace', 'outros')),
	CONSTRAINT "os_pagamentos_valor_check" CHECK ("os_pagamentos"."valor" > 0),
	CONSTRAINT "os_pagamentos_parcelas_check" CHECK ("os_pagamentos"."parcelas" between 1 and 48),
	CONSTRAINT "os_pagamentos_troco_check" CHECK ("os_pagamentos"."troco" >= 0),
	CONSTRAINT "os_pagamentos_troco_dinheiro_check" CHECK ("os_pagamentos"."forma" = 'dinheiro' or "os_pagamentos"."troco" = 0)
);
--> statement-breakpoint
CREATE TABLE "venda_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"venda_id" uuid NOT NULL,
	"ordem" smallint NOT NULL,
	"produto_id" uuid NOT NULL,
	"pedido_canal_item_id" uuid,
	"codigo" text NOT NULL,
	"descricao" text NOT NULL,
	"ncm" text,
	"unidade" text NOT NULL,
	"quantidade" numeric(14, 4) NOT NULL,
	"preco_unitario" numeric(14, 2) NOT NULL,
	"valor_bruto" numeric(14, 2) NOT NULL,
	"desconto_item" numeric(14, 2) DEFAULT '0' NOT NULL,
	"desconto_rateado" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"custo_unitario" numeric(16, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venda_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "venda_itens_ncm_check" CHECK ("venda_itens"."ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "venda_itens_quantidade_check" CHECK ("venda_itens"."quantidade" > 0),
	CONSTRAINT "venda_itens_preco_unitario_check" CHECK ("venda_itens"."preco_unitario" >= 0),
	CONSTRAINT "venda_itens_desconto_item_check" CHECK ("venda_itens"."desconto_item" >= 0),
	CONSTRAINT "venda_itens_desconto_rateado_check" CHECK ("venda_itens"."desconto_rateado" >= 0),
	CONSTRAINT "venda_itens_valor_total_check" CHECK ("venda_itens"."valor_total" >= 0),
	CONSTRAINT "venda_itens_valor_bruto_check" CHECK ("venda_itens"."valor_bruto" = round("venda_itens"."quantidade" * "venda_itens"."preco_unitario", 2)),
	CONSTRAINT "venda_itens_valor_total_calculo_check" CHECK ("venda_itens"."valor_total" = "venda_itens"."valor_bruto" - "venda_itens"."desconto_item" - "venda_itens"."desconto_rateado"),
	CONSTRAINT "venda_itens_custo_unitario_check" CHECK ("venda_itens"."custo_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "venda_pagamentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"venda_id" uuid NOT NULL,
	"forma" text NOT NULL,
	"valor" numeric(14, 2) NOT NULL,
	"parcelas" smallint DEFAULT 1 NOT NULL,
	"troco" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "venda_pagamentos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "venda_pagamentos_forma_check" CHECK ("venda_pagamentos"."forma" in ('dinheiro', 'pix', 'debito', 'credito', 'boleto', 'crediario', 'marketplace', 'outros')),
	CONSTRAINT "venda_pagamentos_valor_check" CHECK ("venda_pagamentos"."valor" > 0),
	CONSTRAINT "venda_pagamentos_parcelas_check" CHECK ("venda_pagamentos"."parcelas" between 1 and 48),
	CONSTRAINT "venda_pagamentos_troco_check" CHECK ("venda_pagamentos"."troco" >= 0),
	CONSTRAINT "venda_pagamentos_troco_dinheiro_check" CHECK ("venda_pagamentos"."forma" = 'dinheiro' or "venda_pagamentos"."troco" = 0)
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" bigint NOT NULL,
	"cliente_id" uuid NOT NULL,
	"empresa_grupo_id" uuid,
	"canal" text DEFAULT 'balcao' NOT NULL,
	"pedido_canal_id" uuid,
	"orcamento_id" uuid,
	"deposito_id" uuid NOT NULL,
	"deposito_vendavel" boolean DEFAULT true NOT NULL,
	"tabela_preco_id" uuid NOT NULL,
	"vendedor_id" uuid,
	"comissao_vendedor_percentual" numeric(7, 4),
	"comissao_vendedor_base" numeric(14, 2),
	"comissao_vendedor_valor" numeric(14, 2),
	"acerto_comissao_id" uuid,
	"status" text DEFAULT 'finalizada' NOT NULL,
	"valor_produtos" numeric(14, 2) NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_frete" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"desconto_autorizado_por" uuid,
	"status_fiscal" text DEFAULT 'nao_emitido' NOT NULL,
	"emissor_fiscal" text,
	"documento_fiscal_id" uuid,
	"finalizada_em" timestamp with time zone DEFAULT now() NOT NULL,
	"usuario_id" uuid,
	"cancelada_em" timestamp with time zone,
	"cancelada_por" uuid,
	"motivo_cancelamento" text,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "vendas_empresa_id_numero_key" UNIQUE("empresa_id","numero"),
	CONSTRAINT "vendas_deposito_vendavel_check" CHECK ("vendas"."deposito_vendavel"),
	CONSTRAINT "vendas_canal_check" CHECK ("vendas"."canal" in ('balcao', 'orcamento', 'os', 'mercado_livre', 'ecommerce')),
	CONSTRAINT "vendas_comissao_vendedor_percentual_check" CHECK ("vendas"."comissao_vendedor_percentual" between 0 and 100),
	CONSTRAINT "vendas_comissao_vendedor_base_check" CHECK ("vendas"."comissao_vendedor_base" >= 0),
	CONSTRAINT "vendas_comissao_vendedor_valor_check" CHECK ("vendas"."comissao_vendedor_valor" >= 0),
	CONSTRAINT "vendas_status_check" CHECK ("vendas"."status" in ('finalizada', 'cancelada')),
	CONSTRAINT "vendas_valor_desconto_check" CHECK ("vendas"."valor_desconto" >= 0),
	CONSTRAINT "vendas_valor_frete_check" CHECK ("vendas"."valor_frete" >= 0),
	CONSTRAINT "vendas_valor_total_check" CHECK ("vendas"."valor_total" >= 0),
	CONSTRAINT "vendas_status_fiscal_check" CHECK ("vendas"."status_fiscal" in ('nao_emitido', 'processando', 'autorizado', 'erro', 'cancelado', 'denegado', 'externo')),
	CONSTRAINT "vendas_emissor_fiscal_check" CHECK ("vendas"."emissor_fiscal" in ('focus', 'externo', 'nao_fiscal')),
	CONSTRAINT "vendas_cancelamento_check" CHECK ("vendas"."status" <> 'cancelada' or ("vendas"."cancelada_em" is not null and "vendas"."cancelada_por" is not null and "vendas"."motivo_cancelamento" is not null)),
	CONSTRAINT "vendas_pedido_canal_check" CHECK (("vendas"."canal" in ('mercado_livre', 'ecommerce')) = ("vendas"."pedido_canal_id" is not null)),
	CONSTRAINT "vendas_comissao_completa_check" CHECK (num_nonnulls("vendas"."comissao_vendedor_percentual", "vendas"."comissao_vendedor_base", "vendas"."comissao_vendedor_valor") in (0, 3)),
	CONSTRAINT "vendas_comissao_vendedor_check" CHECK (("vendas"."vendedor_id" is null) = ("vendas"."comissao_vendedor_valor" is null)),
	CONSTRAINT "vendas_empresa_grupo_id_check" CHECK ("vendas"."empresa_grupo_id" <> "vendas"."empresa_id"),
	CONSTRAINT "vendas_comissao_vendedor_calculo_check" CHECK ("vendas"."comissao_vendedor_valor" = round("vendas"."comissao_vendedor_base" * "vendas"."comissao_vendedor_percentual" / 100, 2)),
	CONSTRAINT "vendas_acerto_comissao_check" CHECK ("vendas"."acerto_comissao_id" is null or "vendas"."vendedor_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "acertos_comissao" ADD CONSTRAINT "acertos_comissao_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acertos_comissao" ADD CONSTRAINT "acertos_comissao_mecanico_id_fk" FOREIGN KEY ("empresa_id","mecanico_id") REFERENCES "public"."mecanicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acertos_comissao" ADD CONSTRAINT "acertos_comissao_vendedor_id_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acertos_comissao" ADD CONSTRAINT "acertos_comissao_pago_por_fk" FOREIGN KEY ("pago_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_vendedor_id_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_devolucao_id_fk" FOREIGN KEY ("empresa_id","devolucao_id") REFERENCES "public"."devolucoes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_acerto_comissao_id_fk" FOREIGN KEY ("empresa_id","acerto_comissao_id") REFERENCES "public"."acertos_comissao"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comissao_ajustes" ADD CONSTRAINT "comissao_ajustes_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_devolucao_id_fk" FOREIGN KEY ("empresa_id","devolucao_id") REFERENCES "public"."devolucoes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_venda_item_id_fk" FOREIGN KEY ("empresa_id","venda_item_id") REFERENCES "public"."venda_itens"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_os_item_id_fk" FOREIGN KEY ("empresa_id","os_item_id") REFERENCES "public"."os_itens"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucao_itens" ADD CONSTRAINT "devolucao_itens_entrada_item_id_fk" FOREIGN KEY ("empresa_id","entrada_item_id") REFERENCES "public"."entrada_itens"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_entrada_id_fk" FOREIGN KEY ("empresa_id","entrada_id") REFERENCES "public"."entradas_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_cliente_id_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_fornecedor_id_fk" FOREIGN KEY ("empresa_id","fornecedor_id") REFERENCES "public"."fornecedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_orcamento_id_fk" FOREIGN KEY ("empresa_id","orcamento_id") REFERENCES "public"."orcamentos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_servico_id_fk" FOREIGN KEY ("empresa_id","servico_id") REFERENCES "public"."servicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamento_itens" ADD CONSTRAINT "orcamento_itens_mecanico_id_fk" FOREIGN KEY ("empresa_id","mecanico_id") REFERENCES "public"."mecanicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_cliente_id_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_moto_cliente_id_fk" FOREIGN KEY ("empresa_id","moto_cliente_id") REFERENCES "public"."motos_cliente"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_vendedor_id_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_desconto_autorizado_por_fk" FOREIGN KEY ("empresa_id","desconto_autorizado_por") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orcamentos" ADD CONSTRAINT "orcamentos_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_cliente_id_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_moto_cliente_id_fk" FOREIGN KEY ("empresa_id","moto_cliente_id") REFERENCES "public"."motos_cliente"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_mecanico_responsavel_id_fk" FOREIGN KEY ("empresa_id","mecanico_responsavel_id") REFERENCES "public"."mecanicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_vendedor_id_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_acerto_comissao_id_fk" FOREIGN KEY ("empresa_id","acerto_comissao_id") REFERENCES "public"."acertos_comissao"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_orcamento_id_fk" FOREIGN KEY ("empresa_id","orcamento_id") REFERENCES "public"."orcamentos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id","deposito_vendavel") REFERENCES "public"."depositos"("empresa_id","id","vendavel") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_desconto_autorizado_por_fk" FOREIGN KEY ("empresa_id","desconto_autorizado_por") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_entregue_por_fk" FOREIGN KEY ("entregue_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_historico_status" ADD CONSTRAINT "os_historico_status_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_historico_status" ADD CONSTRAINT "os_historico_status_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_historico_status" ADD CONSTRAINT "os_historico_status_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_servico_id_fk" FOREIGN KEY ("empresa_id","servico_id") REFERENCES "public"."servicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_mecanico_id_fk" FOREIGN KEY ("empresa_id","mecanico_id") REFERENCES "public"."mecanicos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_acerto_id_fk" FOREIGN KEY ("empresa_id","acerto_id") REFERENCES "public"."acertos_comissao"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_itens" ADD CONSTRAINT "os_itens_removido_por_fk" FOREIGN KEY ("removido_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_pagamentos" ADD CONSTRAINT "os_pagamentos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_pagamentos" ADD CONSTRAINT "os_pagamentos_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_pagamentos" ADD CONSTRAINT "os_pagamentos_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_pagamentos" ADD CONSTRAINT "venda_pagamentos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_pagamentos" ADD CONSTRAINT "venda_pagamentos_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cliente_id_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_empresa_grupo_id_fk" FOREIGN KEY ("empresa_grupo_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_orcamento_id_fk" FOREIGN KEY ("empresa_id","orcamento_id") REFERENCES "public"."orcamentos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id","deposito_vendavel") REFERENCES "public"."depositos"("empresa_id","id","vendavel") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_vendedor_id_fk" FOREIGN KEY ("empresa_id","vendedor_id") REFERENCES "public"."vendedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_acerto_comissao_id_fk" FOREIGN KEY ("empresa_id","acerto_comissao_id") REFERENCES "public"."acertos_comissao"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_desconto_autorizado_por_fk" FOREIGN KEY ("empresa_id","desconto_autorizado_por") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_cancelada_por_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "acertos_comissao_empresa_mecanico_pago_idx" ON "acertos_comissao" USING btree ("empresa_id","mecanico_id","pago_em" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "acertos_comissao_empresa_vendedor_pago_idx" ON "acertos_comissao" USING btree ("empresa_id","vendedor_id","pago_em" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "acertos_comissao_empresa_pago_idx" ON "acertos_comissao" USING btree ("empresa_id","pago_em" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "comissao_ajustes_a_absorver_idx" ON "comissao_ajustes" USING btree ("empresa_id","vendedor_id") WHERE "comissao_ajustes"."acerto_comissao_id" is null;--> statement-breakpoint
CREATE INDEX "devolucao_itens_empresa_id_devolucao_id_idx" ON "devolucao_itens" USING btree ("empresa_id","devolucao_id");--> statement-breakpoint
CREATE INDEX "devolucao_itens_empresa_id_venda_item_id_idx" ON "devolucao_itens" USING btree ("empresa_id","venda_item_id");--> statement-breakpoint
CREATE INDEX "devolucao_itens_empresa_id_os_item_id_idx" ON "devolucao_itens" USING btree ("empresa_id","os_item_id");--> statement-breakpoint
CREATE INDEX "devolucoes_empresa_id_venda_id_idx" ON "devolucoes" USING btree ("empresa_id","venda_id");--> statement-breakpoint
CREATE INDEX "devolucoes_empresa_id_ordem_servico_id_idx" ON "devolucoes" USING btree ("empresa_id","ordem_servico_id");--> statement-breakpoint
CREATE INDEX "devolucoes_empresa_criado_idx" ON "devolucoes" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "devolucoes_empresa_tipo_criado_idx" ON "devolucoes" USING btree ("empresa_id","tipo","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "orcamento_itens_empresa_orcamento_ordem_idx" ON "orcamento_itens" USING btree ("empresa_id","orcamento_id","ordem");--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_criado_idx" ON "orcamentos" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_status_criado_idx" ON "orcamentos" USING btree ("empresa_id","status","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_id_cliente_id_idx" ON "orcamentos" USING btree ("empresa_id","cliente_id");--> statement-breakpoint
CREATE INDEX "orcamentos_empresa_id_validade_idx" ON "orcamentos" USING btree ("empresa_id","validade");--> statement-breakpoint
CREATE UNIQUE INDEX "ordens_servico_orcamento_id_key" ON "ordens_servico" USING btree ("empresa_id","orcamento_id") WHERE "ordens_servico"."orcamento_id" is not null;--> statement-breakpoint
CREATE INDEX "ordens_servico_empresa_criado_idx" ON "ordens_servico" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ordens_servico_empresa_status_criado_idx" ON "ordens_servico" USING btree ("empresa_id","status","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "ordens_servico_empresa_mecanico_status_idx" ON "ordens_servico" USING btree ("empresa_id","mecanico_responsavel_id","status");--> statement-breakpoint
CREATE INDEX "ordens_servico_comissao_a_pagar_idx" ON "ordens_servico" USING btree ("empresa_id","vendedor_id","entregue_em") WHERE "ordens_servico"."vendedor_id" is not null and "ordens_servico"."acerto_comissao_id" is null;--> statement-breakpoint
CREATE INDEX "ordens_servico_empresa_id_moto_cliente_id_idx" ON "ordens_servico" USING btree ("empresa_id","moto_cliente_id");--> statement-breakpoint
CREATE INDEX "ordens_servico_empresa_id_cliente_id_idx" ON "ordens_servico" USING btree ("empresa_id","cliente_id");--> statement-breakpoint
CREATE INDEX "os_historico_status_empresa_os_criado_idx" ON "os_historico_status" USING btree ("empresa_id","ordem_servico_id","created_at");--> statement-breakpoint
CREATE INDEX "os_itens_empresa_os_ordem_idx" ON "os_itens" USING btree ("empresa_id","ordem_servico_id","ordem");--> statement-breakpoint
CREATE INDEX "os_itens_empresa_mecanico_congelada_idx" ON "os_itens" USING btree ("empresa_id","mecanico_id","comissao_congelada_em");--> statement-breakpoint
CREATE INDEX "os_itens_empresa_id_acerto_id_idx" ON "os_itens" USING btree ("empresa_id","acerto_id");--> statement-breakpoint
CREATE INDEX "os_itens_empresa_id_produto_id_idx" ON "os_itens" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "os_pagamentos_empresa_id_ordem_servico_id_idx" ON "os_pagamentos" USING btree ("empresa_id","ordem_servico_id");--> statement-breakpoint
CREATE INDEX "venda_itens_empresa_venda_ordem_idx" ON "venda_itens" USING btree ("empresa_id","venda_id","ordem");--> statement-breakpoint
CREATE INDEX "venda_itens_empresa_id_produto_id_idx" ON "venda_itens" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "venda_pagamentos_empresa_id_venda_id_idx" ON "venda_pagamentos" USING btree ("empresa_id","venda_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_pedido_canal_id_key" ON "vendas" USING btree ("empresa_id","pedido_canal_id") WHERE "vendas"."pedido_canal_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_orcamento_id_key" ON "vendas" USING btree ("empresa_id","orcamento_id") WHERE "vendas"."orcamento_id" is not null;--> statement-breakpoint
CREATE INDEX "vendas_empresa_finalizada_idx" ON "vendas" USING btree ("empresa_id","finalizada_em" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "vendas_empresa_canal_finalizada_idx" ON "vendas" USING btree ("empresa_id","canal","finalizada_em" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "vendas_empresa_id_cliente_id_idx" ON "vendas" USING btree ("empresa_id","cliente_id");--> statement-breakpoint
CREATE INDEX "vendas_comissao_a_pagar_idx" ON "vendas" USING btree ("empresa_id","vendedor_id","finalizada_em") WHERE "vendas"."vendedor_id" is not null and "vendas"."acerto_comissao_id" is null;--> statement-breakpoint
CREATE INDEX "vendas_status_fiscal_pendente_idx" ON "vendas" USING btree ("empresa_id","status_fiscal") WHERE "vendas"."status_fiscal" in ('processando', 'erro');--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_os_item_id_fk" FOREIGN KEY ("empresa_id","os_item_id","produto_id") REFERENCES "public"."os_itens"("empresa_id","id","produto_id") ON DELETE restrict ON UPDATE no action;