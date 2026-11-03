CREATE TABLE "api_chaves" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"hash" text NOT NULL,
	"prefixo" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"ultimo_uso_em" timestamp with time zone,
	"revogada_em" timestamp with time zone,
	"criado_por" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_chaves_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "api_chaves_hash_key" UNIQUE("hash"),
	CONSTRAINT "api_chaves_hash_check" CHECK ("api_chaves"."hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "canais_venda" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"ativo" boolean DEFAULT false NOT NULL,
	"conta_externa_id" text,
	"credenciais_cifrado" "bytea",
	"token_expira_em" timestamp with time zone,
	"webhook_segredo_cifrado" "bytea",
	"tabela_preco_id" uuid NOT NULL,
	"estoque_seguranca" numeric(14, 4) DEFAULT '0' NOT NULL,
	"evento_faturamento" text DEFAULT 'pago' NOT NULL,
	"emissor_fiscal" text NOT NULL,
	"config" jsonb DEFAULT '{"sincronizar_estoque": true, "sincronizar_preco": true, "janela_agrupamento_segundos": 10, "max_tentativas": 8}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canais_venda_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "canais_venda_empresa_id_tipo_nome_key" UNIQUE("empresa_id","tipo","nome"),
	CONSTRAINT "canais_venda_tipo_check" CHECK ("canais_venda"."tipo" in ('mercado_livre', 'ecommerce')),
	CONSTRAINT "canais_venda_estoque_seguranca_check" CHECK ("canais_venda"."estoque_seguranca" >= 0),
	CONSTRAINT "canais_venda_evento_faturamento_check" CHECK ("canais_venda"."evento_faturamento" in ('pago', 'faturado', 'enviado', 'entregue')),
	CONSTRAINT "canais_venda_emissor_fiscal_check" CHECK ("canais_venda"."emissor_fiscal" in ('focus', 'externo'))
);
--> statement-breakpoint
CREATE TABLE "canal_anuncios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"produto_id" uuid,
	"id_externo" text NOT NULL,
	"id_variacao" text,
	"sku" text,
	"titulo" text,
	"status_externo" text,
	"sincronizar" boolean DEFAULT true NOT NULL,
	"quantidade_publicada" integer,
	"preco_publicado" numeric(14, 2),
	"sincronizado_em" timestamp with time zone,
	"ultimo_erro" text,
	"ultimo_erro_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canal_anuncios_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "canal_anuncios_canal_externo_variacao_key" UNIQUE NULLS NOT DISTINCT("canal_id","id_externo","id_variacao"),
	CONSTRAINT "canal_anuncios_quantidade_publicada_check" CHECK ("canal_anuncios"."quantidade_publicada" >= 0)
);
--> statement-breakpoint
CREATE TABLE "eventos_integracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"integracao" text NOT NULL,
	"canal_id" uuid,
	"direcao" text NOT NULL,
	"tipo" text NOT NULL,
	"id_externo" text,
	"chave_idempotencia" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"processado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_integracao_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "eventos_integracao_idempotencia_key" UNIQUE NULLS NOT DISTINCT("empresa_id","integracao","canal_id","direcao","chave_idempotencia"),
	CONSTRAINT "eventos_integracao_integracao_check" CHECK ("eventos_integracao"."integracao" in ('mercado_livre', 'ecommerce', 'focus', 'mde')),
	CONSTRAINT "eventos_integracao_direcao_check" CHECK ("eventos_integracao"."direcao" in ('entrada', 'saida')),
	CONSTRAINT "eventos_integracao_tentativas_check" CHECK ("eventos_integracao"."tentativas" >= 0),
	CONSTRAINT "eventos_integracao_canal_check" CHECK ("eventos_integracao"."integracao" not in ('mercado_livre', 'ecommerce') or "eventos_integracao"."canal_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"produto_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processado_em" timestamp with time zone,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "outbox_tipo_check" CHECK ("outbox"."tipo" in ('produto.disponivel_alterado', 'produto.preco_alterado'))
);
--> statement-breakpoint
CREATE TABLE "pedido_canal_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"pedido_canal_id" uuid NOT NULL,
	"canal_anuncio_id" uuid,
	"produto_id" uuid,
	"id_externo_item" text,
	"sku" text,
	"titulo" text,
	"quantidade" numeric(14, 4) NOT NULL,
	"preco_unitario" numeric(14, 2) NOT NULL,
	"valor_total" numeric(14, 2) NOT NULL,
	"taxa" numeric(14, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedido_canal_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "pedido_canal_itens_empresa_id_id_produto_id_key" UNIQUE("empresa_id","id","produto_id"),
	CONSTRAINT "pedido_canal_itens_quantidade_check" CHECK ("pedido_canal_itens"."quantidade" > 0),
	CONSTRAINT "pedido_canal_itens_preco_unitario_check" CHECK ("pedido_canal_itens"."preco_unitario" >= 0),
	CONSTRAINT "pedido_canal_itens_taxa_check" CHECK ("pedido_canal_itens"."taxa" >= 0)
);
--> statement-breakpoint
CREATE TABLE "pedidos_canal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"canal_id" uuid NOT NULL,
	"id_externo" text NOT NULL,
	"pack_id_externo" text,
	"envio_id_externo" text,
	"status_externo" text,
	"status" text DEFAULT 'pendente' NOT NULL,
	"pendencia" text,
	"comprador_nome" text,
	"comprador_tipo_pessoa" text,
	"comprador_cpf_cnpj" text,
	"comprador_ie" text,
	"comprador_indicador_ie" smallint,
	"comprador_email" text,
	"comprador_telefone" text,
	"comprador_cep" text,
	"comprador_logradouro" text,
	"comprador_numero" text,
	"comprador_complemento" text,
	"comprador_bairro" text,
	"comprador_municipio" text,
	"comprador_codigo_ibge_municipio" text,
	"comprador_uf" text,
	"valor_produtos" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_frete" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_taxas" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_desconto" numeric(14, 2) DEFAULT '0' NOT NULL,
	"valor_total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"pago_em" timestamp with time zone,
	"faturado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"venda_id" uuid,
	"nota_externa_chave" text,
	"nota_externa_numero" bigint,
	"nota_externa_serie" integer,
	"nota_externa_xml_chave" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pedidos_canal_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "pedidos_canal_canal_id_id_externo_key" UNIQUE("canal_id","id_externo"),
	CONSTRAINT "pedidos_canal_status_check" CHECK ("pedidos_canal"."status" in ('pendente', 'pago', 'faturado', 'cancelado', 'devolvido')),
	CONSTRAINT "pedidos_canal_comprador_tipo_pessoa_check" CHECK ("pedidos_canal"."comprador_tipo_pessoa" in ('pf', 'pj')),
	CONSTRAINT "pedidos_canal_comprador_cpf_cnpj_check" CHECK ("pedidos_canal"."comprador_cpf_cnpj" is null or ("pedidos_canal"."comprador_tipo_pessoa" = 'pf' and "pedidos_canal"."comprador_cpf_cnpj" ~ '^[0-9]{11}$') or ("pedidos_canal"."comprador_tipo_pessoa" = 'pj' and "pedidos_canal"."comprador_cpf_cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$')),
	CONSTRAINT "pedidos_canal_comprador_indicador_ie_check" CHECK ("pedidos_canal"."comprador_indicador_ie" in (1, 2, 9)),
	CONSTRAINT "pedidos_canal_comprador_cep_check" CHECK ("pedidos_canal"."comprador_cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "pedidos_canal_comprador_codigo_ibge_municipio_check" CHECK ("pedidos_canal"."comprador_codigo_ibge_municipio" ~ '^[0-9]{7}$'),
	CONSTRAINT "pedidos_canal_comprador_uf_check" CHECK ("pedidos_canal"."comprador_uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "pedidos_canal_nota_externa_chave_check" CHECK ("pedidos_canal"."nota_externa_chave" ~ '^[0-9]{44}$'),
	CONSTRAINT "pedidos_canal_faturado_check" CHECK ("pedidos_canal"."status" <> 'faturado' or "pedidos_canal"."venda_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_canal_id_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canais_venda"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_chaves" ADD CONSTRAINT "api_chaves_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canais_venda" ADD CONSTRAINT "canais_venda_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canais_venda" ADD CONSTRAINT "canais_venda_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_anuncios" ADD CONSTRAINT "canal_anuncios_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_anuncios" ADD CONSTRAINT "canal_anuncios_canal_id_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canais_venda"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canal_anuncios" ADD CONSTRAINT "canal_anuncios_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_integracao" ADD CONSTRAINT "eventos_integracao_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_integracao" ADD CONSTRAINT "eventos_integracao_canal_id_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canais_venda"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbox" ADD CONSTRAINT "outbox_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_canal_itens" ADD CONSTRAINT "pedido_canal_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_canal_itens" ADD CONSTRAINT "pedido_canal_itens_pedido_canal_id_fk" FOREIGN KEY ("empresa_id","pedido_canal_id") REFERENCES "public"."pedidos_canal"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_canal_itens" ADD CONSTRAINT "pedido_canal_itens_canal_anuncio_id_fk" FOREIGN KEY ("empresa_id","canal_anuncio_id") REFERENCES "public"."canal_anuncios"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_canal_itens" ADD CONSTRAINT "pedido_canal_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_canal" ADD CONSTRAINT "pedidos_canal_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_canal" ADD CONSTRAINT "pedidos_canal_canal_id_fk" FOREIGN KEY ("empresa_id","canal_id") REFERENCES "public"."canais_venda"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedidos_canal" ADD CONSTRAINT "pedidos_canal_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_chaves_empresa_id_canal_id_idx" ON "api_chaves" USING btree ("empresa_id","canal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "canais_venda_tipo_conta_externa_id_key" ON "canais_venda" USING btree ("tipo","conta_externa_id") WHERE "canais_venda"."conta_externa_id" is not null;--> statement-breakpoint
CREATE INDEX "canal_anuncios_empresa_id_produto_id_idx" ON "canal_anuncios" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "canal_anuncios_com_erro_idx" ON "canal_anuncios" USING btree ("canal_id") WHERE "canal_anuncios"."ultimo_erro" is not null;--> statement-breakpoint
CREATE INDEX "eventos_integracao_pendentes_idx" ON "eventos_integracao" USING btree ("recebido_em") WHERE "eventos_integracao"."processado_em" is null;--> statement-breakpoint
CREATE INDEX "eventos_integracao_empresa_integracao_recebido_idx" ON "eventos_integracao" USING btree ("empresa_id","integracao","recebido_em" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "outbox_pendentes_idx" ON "outbox" USING btree ("created_at") WHERE "outbox"."processado_em" is null;--> statement-breakpoint
CREATE INDEX "outbox_agrupamento_idx" ON "outbox" USING btree ("empresa_id","produto_id") WHERE "outbox"."processado_em" is null;--> statement-breakpoint
CREATE INDEX "pedido_canal_itens_empresa_id_pedido_canal_id_idx" ON "pedido_canal_itens" USING btree ("empresa_id","pedido_canal_id");--> statement-breakpoint
CREATE INDEX "pedido_canal_itens_empresa_id_produto_id_idx" ON "pedido_canal_itens" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "pedidos_canal_empresa_status_criado_idx" ON "pedidos_canal" USING btree ("empresa_id","status","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "pedidos_canal_empresa_criado_idx" ON "pedidos_canal" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "pedidos_canal_com_pendencia_idx" ON "pedidos_canal" USING btree ("empresa_id") WHERE "pedidos_canal"."pendencia" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "pedidos_canal_empresa_id_nota_externa_chave_key" ON "pedidos_canal" USING btree ("empresa_id","nota_externa_chave") WHERE "pedidos_canal"."nota_externa_chave" is not null;--> statement-breakpoint
ALTER TABLE "estoque_reservas" ADD CONSTRAINT "estoque_reservas_pedido_canal_item_id_fk" FOREIGN KEY ("empresa_id","pedido_canal_item_id","produto_id") REFERENCES "public"."pedido_canal_itens"("empresa_id","id","produto_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venda_itens" ADD CONSTRAINT "venda_itens_pedido_canal_item_id_fk" FOREIGN KEY ("empresa_id","pedido_canal_item_id") REFERENCES "public"."pedido_canal_itens"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_pedido_canal_id_fk" FOREIGN KEY ("empresa_id","pedido_canal_id") REFERENCES "public"."pedidos_canal"("empresa_id","id") ON DELETE restrict ON UPDATE no action;