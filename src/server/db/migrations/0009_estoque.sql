CREATE TABLE "depositos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"vendavel" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "depositos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "depositos_empresa_id_nome_key" UNIQUE("empresa_id","nome"),
	CONSTRAINT "depositos_empresa_id_id_vendavel_key" UNIQUE("empresa_id","id","vendavel"),
	CONSTRAINT "depositos_padrao_check" CHECK (not "depositos"."padrao" or "depositos"."vendavel")
);
--> statement-breakpoint
CREATE TABLE "entrada_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entrada_id" uuid NOT NULL,
	"numero_item" smallint NOT NULL,
	"produto_id" uuid,
	"codigo_fornecedor" text,
	"descricao_fornecedor" text,
	"ean_fornecedor" text,
	"ncm" text,
	"cfop" text,
	"unidade_compra" text NOT NULL,
	"fator" numeric(14, 4) DEFAULT '1' NOT NULL,
	"quantidade_compra" numeric(14, 4) NOT NULL,
	"quantidade_estoque" numeric(14, 4) NOT NULL,
	"valor_produto" numeric(14, 2) NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_frete" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_seguro" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_outras_despesas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_ipi" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_st" numeric(14, 2) DEFAULT '0' NOT NULL,
	"custo_unitario" numeric(16, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entrada_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "entrada_itens_entrada_id_numero_item_key" UNIQUE("entrada_id","numero_item"),
	CONSTRAINT "entrada_itens_numero_item_check" CHECK ("entrada_itens"."numero_item" > 0),
	CONSTRAINT "entrada_itens_ncm_check" CHECK ("entrada_itens"."ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "entrada_itens_cfop_check" CHECK ("entrada_itens"."cfop" ~ '^[0-9]{4}$'),
	CONSTRAINT "entrada_itens_fator_check" CHECK ("entrada_itens"."fator" > 0),
	CONSTRAINT "entrada_itens_quantidade_compra_check" CHECK ("entrada_itens"."quantidade_compra" > 0),
	CONSTRAINT "entrada_itens_quantidade_estoque_check" CHECK ("entrada_itens"."quantidade_estoque" > 0),
	CONSTRAINT "entrada_itens_quantidade_estoque_calculo_check" CHECK ("entrada_itens"."quantidade_estoque" = round("entrada_itens"."quantidade_compra" * "entrada_itens"."fator", 4)),
	CONSTRAINT "entrada_itens_valor_produto_check" CHECK ("entrada_itens"."valor_produto" >= 0),
	CONSTRAINT "entrada_itens_valor_desconto_check" CHECK ("entrada_itens"."valor_desconto" >= 0),
	CONSTRAINT "entrada_itens_valor_frete_check" CHECK ("entrada_itens"."valor_frete" >= 0),
	CONSTRAINT "entrada_itens_valor_seguro_check" CHECK ("entrada_itens"."valor_seguro" >= 0),
	CONSTRAINT "entrada_itens_valor_outras_despesas_check" CHECK ("entrada_itens"."valor_outras_despesas" >= 0),
	CONSTRAINT "entrada_itens_valor_ipi_check" CHECK ("entrada_itens"."valor_ipi" >= 0),
	CONSTRAINT "entrada_itens_valor_st_check" CHECK ("entrada_itens"."valor_st" >= 0),
	CONSTRAINT "entrada_itens_custo_unitario_check" CHECK ("entrada_itens"."custo_unitario" >= 0)
);
--> statement-breakpoint
CREATE TABLE "entradas_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid,
	"deposito_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"numero_nota" bigint,
	"serie_nota" integer,
	"chave_acesso" text,
	"data_emissao" timestamp with time zone,
	"data_entrada" timestamp with time zone DEFAULT now() NOT NULL,
	"valor_produtos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_frete" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_seguro" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_outras_despesas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_ipi" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_st" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"xml_chave" text,
	"observacoes" text,
	"usuario_id" uuid NOT NULL,
	"confirmada_em" timestamp with time zone,
	"confirmada_por" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entradas_estoque_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "entradas_estoque_origem_check" CHECK ("entradas_estoque"."origem" in ('manual', 'xml')),
	CONSTRAINT "entradas_estoque_status_check" CHECK ("entradas_estoque"."status" in ('rascunho', 'confirmada', 'cancelada')),
	CONSTRAINT "entradas_estoque_numero_nota_check" CHECK ("entradas_estoque"."numero_nota" > 0),
	CONSTRAINT "entradas_estoque_serie_nota_check" CHECK ("entradas_estoque"."serie_nota" >= 0),
	CONSTRAINT "entradas_estoque_chave_acesso_check" CHECK ("entradas_estoque"."chave_acesso" ~ '^[0-9]{44}$'),
	CONSTRAINT "entradas_estoque_valor_frete_check" CHECK ("entradas_estoque"."valor_frete" >= 0),
	CONSTRAINT "entradas_estoque_valor_seguro_check" CHECK ("entradas_estoque"."valor_seguro" >= 0),
	CONSTRAINT "entradas_estoque_valor_outras_despesas_check" CHECK ("entradas_estoque"."valor_outras_despesas" >= 0),
	CONSTRAINT "entradas_estoque_valor_desconto_check" CHECK ("entradas_estoque"."valor_desconto" >= 0),
	CONSTRAINT "entradas_estoque_valor_ipi_check" CHECK ("entradas_estoque"."valor_ipi" >= 0),
	CONSTRAINT "entradas_estoque_valor_st_check" CHECK ("entradas_estoque"."valor_st" >= 0),
	CONSTRAINT "entradas_estoque_origem_xml_check" CHECK ("entradas_estoque"."origem" <> 'xml' or ("entradas_estoque"."chave_acesso" is not null and "entradas_estoque"."xml_chave" is not null)),
	CONSTRAINT "entradas_estoque_confirmada_check" CHECK ("entradas_estoque"."status" <> 'confirmada' or "entradas_estoque"."confirmada_em" is not null),
	CONSTRAINT "entradas_estoque_cancelada_check" CHECK ("entradas_estoque"."status" <> 'cancelada' or "entradas_estoque"."confirmada_em" is null)
);
--> statement-breakpoint
CREATE TABLE "estoque_reservas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"deposito_vendavel" boolean DEFAULT true NOT NULL,
	"quantidade" numeric(14, 4) NOT NULL,
	"os_item_id" uuid,
	"pedido_canal_item_id" uuid,
	"status" text DEFAULT 'ativa' NOT NULL,
	"consumida_em" timestamp with time zone,
	"liberada_em" timestamp with time zone,
	"movimentacao_id" uuid,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estoque_reservas_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "estoque_reservas_deposito_vendavel_check" CHECK ("estoque_reservas"."deposito_vendavel"),
	CONSTRAINT "estoque_reservas_quantidade_check" CHECK ("estoque_reservas"."quantidade" > 0),
	CONSTRAINT "estoque_reservas_status_check" CHECK ("estoque_reservas"."status" in ('ativa', 'consumida', 'liberada')),
	CONSTRAINT "estoque_reservas_origem_check" CHECK (num_nonnulls("estoque_reservas"."os_item_id", "estoque_reservas"."pedido_canal_item_id") = 1),
	CONSTRAINT "estoque_reservas_consumida_check" CHECK ("estoque_reservas"."status" <> 'consumida' or ("estoque_reservas"."consumida_em" is not null and "estoque_reservas"."movimentacao_id" is not null)),
	CONSTRAINT "estoque_reservas_ativa_check" CHECK ("estoque_reservas"."status" <> 'ativa' or ("estoque_reservas"."consumida_em" is null and "estoque_reservas"."liberada_em" is null and "estoque_reservas"."movimentacao_id" is null)),
	CONSTRAINT "estoque_reservas_liberada_check" CHECK ("estoque_reservas"."status" <> 'liberada' or "estoque_reservas"."liberada_em" is not null)
);
--> statement-breakpoint
CREATE TABLE "estoque_saldos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"quantidade" numeric(14, 4) DEFAULT '0' NOT NULL,
	"quantidade_reservada" numeric(14, 4) DEFAULT '0' NOT NULL,
	"custo_medio" numeric(16, 6),
	"ultimo_custo" numeric(16, 6),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "estoque_saldos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "estoque_saldos_produto_id_deposito_id_key" UNIQUE("produto_id","deposito_id"),
	CONSTRAINT "estoque_saldos_quantidade_reservada_check" CHECK ("estoque_saldos"."quantidade_reservada" >= 0),
	CONSTRAINT "estoque_saldos_custo_medio_check" CHECK ("estoque_saldos"."custo_medio" >= 0),
	CONSTRAINT "estoque_saldos_ultimo_custo_check" CHECK ("estoque_saldos"."ultimo_custo" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventario_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"inventario_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"quantidade_sistema" numeric(14, 4) NOT NULL,
	"quantidade_contada" numeric(14, 4),
	"contado_em" timestamp with time zone,
	"contado_por" uuid,
	"diferenca_aplicada" numeric(14, 4),
	"movimentado_apos_abertura" boolean,
	"movimentacao_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventario_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "inventario_itens_inventario_id_produto_id_key" UNIQUE("inventario_id","produto_id"),
	CONSTRAINT "inventario_itens_quantidade_contada_check" CHECK ("inventario_itens"."quantidade_contada" >= 0)
);
--> statement-breakpoint
CREATE TABLE "inventarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"status" text DEFAULT 'aberto' NOT NULL,
	"filtro" text DEFAULT 'todos' NOT NULL,
	"filtro_categoria_id" uuid,
	"filtro_corredor" text,
	"filtro_prateleira" text,
	"saldo_inicial" boolean DEFAULT false NOT NULL,
	"aberto_em" timestamp with time zone DEFAULT now() NOT NULL,
	"aberto_por" uuid NOT NULL,
	"aplicado_em" timestamp with time zone,
	"aplicado_por" uuid,
	"cancelado_em" timestamp with time zone,
	"observacoes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inventarios_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "inventarios_status_check" CHECK ("inventarios"."status" in ('aberto', 'aplicado', 'cancelado')),
	CONSTRAINT "inventarios_filtro_check" CHECK ("inventarios"."filtro" in ('todos', 'categoria', 'localizacao')),
	CONSTRAINT "inventarios_filtro_categoria_check" CHECK ("inventarios"."filtro" <> 'categoria' or "inventarios"."filtro_categoria_id" is not null),
	CONSTRAINT "inventarios_filtro_localizacao_check" CHECK ("inventarios"."filtro" <> 'localizacao' or "inventarios"."filtro_corredor" is not null)
);
--> statement-breakpoint
CREATE TABLE "movimentacoes_estoque" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"deposito_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"quantidade" numeric(14, 4) NOT NULL,
	"custo_unitario" numeric(16, 6),
	"saldo_apos" numeric(14, 4) NOT NULL,
	"custo_medio_apos" numeric(16, 6),
	"origem_tipo" text,
	"origem_id" uuid,
	"origem_item_id" uuid,
	"estorno_de_id" uuid,
	"motivo" text,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movimentacoes_estoque_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "movimentacoes_estoque_tipo_check" CHECK ("movimentacoes_estoque"."tipo" in ('saldo_inicial', 'entrada_compra', 'entrada_manual', 'saida_venda', 'saida_os', 'ajuste_manual', 'ajuste_inventario', 'devolucao_cliente', 'devolucao_fornecedor', 'estorno')),
	CONSTRAINT "movimentacoes_estoque_quantidade_check" CHECK ("movimentacoes_estoque"."quantidade" <> 0),
	CONSTRAINT "movimentacoes_estoque_custo_unitario_check" CHECK ("movimentacoes_estoque"."custo_unitario" >= 0),
	CONSTRAINT "movimentacoes_estoque_origem_tipo_check" CHECK ("movimentacoes_estoque"."origem_tipo" in ('venda', 'ordem_servico', 'pedido_canal', 'entrada', 'inventario', 'devolucao')),
	CONSTRAINT "movimentacoes_estoque_sinal_check" CHECK (("movimentacoes_estoque"."tipo" in ('saldo_inicial', 'entrada_compra', 'entrada_manual', 'devolucao_cliente') and "movimentacoes_estoque"."quantidade" > 0) or ("movimentacoes_estoque"."tipo" in ('saida_venda', 'saida_os', 'devolucao_fornecedor') and "movimentacoes_estoque"."quantidade" < 0) or "movimentacoes_estoque"."tipo" in ('ajuste_manual', 'ajuste_inventario', 'estorno')),
	CONSTRAINT "movimentacoes_estoque_estorno_check" CHECK ("movimentacoes_estoque"."tipo" <> 'estorno' or "movimentacoes_estoque"."estorno_de_id" is not null),
	CONSTRAINT "movimentacoes_estoque_motivo_check" CHECK ("movimentacoes_estoque"."tipo" not in ('ajuste_manual', 'estorno') or "movimentacoes_estoque"."motivo" is not null),
	CONSTRAINT "movimentacoes_estoque_origem_check" CHECK (("movimentacoes_estoque"."origem_tipo" is null) = ("movimentacoes_estoque"."origem_id" is null)),
	CONSTRAINT "movimentacoes_estoque_custo_entrada_check" CHECK ("movimentacoes_estoque"."tipo" not in ('entrada_compra', 'entrada_manual') or "movimentacoes_estoque"."custo_unitario" is not null)
);
--> statement-breakpoint
ALTER TABLE "depositos" ADD CONSTRAINT "depositos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrada_itens" ADD CONSTRAINT "entrada_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrada_itens" ADD CONSTRAINT "entrada_itens_entrada_id_fk" FOREIGN KEY ("empresa_id","entrada_id") REFERENCES "public"."entradas_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entrada_itens" ADD CONSTRAINT "entrada_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_estoque" ADD CONSTRAINT "entradas_estoque_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_estoque" ADD CONSTRAINT "entradas_estoque_fornecedor_id_fk" FOREIGN KEY ("empresa_id","fornecedor_id") REFERENCES "public"."fornecedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_estoque" ADD CONSTRAINT "entradas_estoque_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_estoque" ADD CONSTRAINT "entradas_estoque_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entradas_estoque" ADD CONSTRAINT "entradas_estoque_confirmada_por_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id","deposito_vendavel") REFERENCES "public"."depositos"("empresa_id","id","vendavel") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_movimentacao_id_fk" FOREIGN KEY ("empresa_id","movimentacao_id") REFERENCES "public"."movimentacoes_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_saldos" ADD CONSTRAINT "estoque_saldos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_saldos" ADD CONSTRAINT "estoque_saldos_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "estoque_saldos" ADD CONSTRAINT "estoque_saldos_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_inventario_id_fk" FOREIGN KEY ("empresa_id","inventario_id") REFERENCES "public"."inventarios"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_contado_por_fk" FOREIGN KEY ("contado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventario_itens" ADD CONSTRAINT "inventario_itens_movimentacao_id_fk" FOREIGN KEY ("empresa_id","movimentacao_id") REFERENCES "public"."movimentacoes_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_filtro_categoria_id_fk" FOREIGN KEY ("empresa_id","filtro_categoria_id") REFERENCES "public"."categorias"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_aberto_por_fk" FOREIGN KEY ("aberto_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventarios" ADD CONSTRAINT "inventarios_aplicado_por_fk" FOREIGN KEY ("aplicado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_deposito_id_fk" FOREIGN KEY ("empresa_id","deposito_id") REFERENCES "public"."depositos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_estorno_de_id_fk" FOREIGN KEY ("empresa_id","estorno_de_id") REFERENCES "public"."movimentacoes_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movimentacoes_estoque" ADD CONSTRAINT "movimentacoes_estoque_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "depositos_empresa_id_padrao_key" ON "depositos" USING btree ("empresa_id") WHERE "depositos"."padrao";--> statement-breakpoint
CREATE INDEX "entrada_itens_empresa_id_produto_id_idx" ON "entrada_itens" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "entradas_estoque_empresa_id_chave_acesso_key" ON "entradas_estoque" USING btree ("empresa_id","chave_acesso") WHERE "entradas_estoque"."chave_acesso" is not null and "entradas_estoque"."status" <> 'cancelada';--> statement-breakpoint
CREATE INDEX "entradas_estoque_empresa_data_entrada_idx" ON "entradas_estoque" USING btree ("empresa_id","data_entrada" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "entradas_estoque_empresa_id_fornecedor_id_idx" ON "entradas_estoque" USING btree ("empresa_id","fornecedor_id");--> statement-breakpoint
CREATE INDEX "estoque_reservas_produto_id_status_idx" ON "estoque_reservas" USING btree ("produto_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "estoque_reservas_os_item_id_vigente_key" ON "estoque_reservas" USING btree ("empresa_id","os_item_id") WHERE "estoque_reservas"."status" <> 'liberada';--> statement-breakpoint
CREATE UNIQUE INDEX "estoque_reservas_pedido_canal_item_id_vigente_key" ON "estoque_reservas" USING btree ("empresa_id","pedido_canal_item_id") WHERE "estoque_reservas"."status" <> 'liberada';--> statement-breakpoint
CREATE INDEX "estoque_saldos_empresa_id_deposito_id_idx" ON "estoque_saldos" USING btree ("empresa_id","deposito_id");--> statement-breakpoint
CREATE UNIQUE INDEX "inventarios_empresa_id_deposito_id_aberto_key" ON "inventarios" USING btree ("empresa_id","deposito_id") WHERE "inventarios"."status" = 'aberto';--> statement-breakpoint
CREATE INDEX "inventarios_empresa_aberto_em_idx" ON "inventarios" USING btree ("empresa_id","aberto_em" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "movimentacoes_estoque_empresa_produto_criado_idx" ON "movimentacoes_estoque" USING btree ("empresa_id","produto_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "movimentacoes_estoque_empresa_criado_idx" ON "movimentacoes_estoque" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "movimentacoes_estoque_empresa_tipo_criado_idx" ON "movimentacoes_estoque" USING btree ("empresa_id","tipo","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "movimentacoes_estoque_empresa_usuario_criado_idx" ON "movimentacoes_estoque" USING btree ("empresa_id","usuario_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "movimentacoes_estoque_empresa_origem_idx" ON "movimentacoes_estoque" USING btree ("empresa_id","origem_tipo","origem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "movimentacoes_estoque_estorno_de_id_key" ON "movimentacoes_estoque" USING btree ("estorno_de_id") WHERE "movimentacoes_estoque"."estorno_de_id" is not null;