CREATE TABLE "categorias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"markup_padrao" numeric(7, 4),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "categorias_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "categorias_markup_padrao_check" CHECK ("categorias"."markup_padrao" >= 0)
);
--> statement-breakpoint
CREATE TABLE "marcas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "marcas_empresa_id_id_key" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "mecanicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"usuario_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mecanicos_empresa_id_id_key" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "perfis_tributarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"descricao" text,
	"regime" text NOT NULL,
	"csosn" text,
	"cst_icms" text,
	"aliquota_icms" numeric(7, 4),
	"reducao_base_icms" numeric(7, 4),
	"st_retido_anteriormente" boolean DEFAULT false NOT NULL,
	"mva" numeric(7, 4),
	"aliquota_st" numeric(7, 4),
	"fcp_st" numeric(7, 4),
	"cst_pis" text,
	"aliq_pis" numeric(7, 4),
	"cst_cofins" text,
	"aliq_cofins" numeric(7, 4),
	"monofasico" boolean DEFAULT false NOT NULL,
	"cst_ipi" text,
	"aliq_ipi" numeric(7, 4),
	"cst_ibs_cbs" text,
	"cclasstrib" text,
	"aliq_cbs" numeric(7, 4),
	"aliq_ibs_uf" numeric(7, 4),
	"aliq_ibs_mun" numeric(7, 4),
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "perfis_tributarios_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "perfis_tributarios_regime_check" CHECK ("perfis_tributarios"."regime" in ('simples', 'normal')),
	CONSTRAINT "perfis_tributarios_csosn_check" CHECK ("perfis_tributarios"."csosn" ~ '^[0-9]{3}$'),
	CONSTRAINT "perfis_tributarios_cst_icms_check" CHECK ("perfis_tributarios"."cst_icms" ~ '^[0-9]{2}$'),
	CONSTRAINT "perfis_tributarios_aliquota_icms_check" CHECK ("perfis_tributarios"."aliquota_icms" >= 0),
	CONSTRAINT "perfis_tributarios_reducao_base_icms_check" CHECK ("perfis_tributarios"."reducao_base_icms" between 0 and 100),
	CONSTRAINT "perfis_tributarios_mva_check" CHECK ("perfis_tributarios"."mva" >= 0),
	CONSTRAINT "perfis_tributarios_aliquota_st_check" CHECK ("perfis_tributarios"."aliquota_st" >= 0),
	CONSTRAINT "perfis_tributarios_fcp_st_check" CHECK ("perfis_tributarios"."fcp_st" >= 0),
	CONSTRAINT "perfis_tributarios_cst_pis_check" CHECK ("perfis_tributarios"."cst_pis" ~ '^[0-9]{2}$'),
	CONSTRAINT "perfis_tributarios_aliq_pis_check" CHECK ("perfis_tributarios"."aliq_pis" >= 0),
	CONSTRAINT "perfis_tributarios_cst_cofins_check" CHECK ("perfis_tributarios"."cst_cofins" ~ '^[0-9]{2}$'),
	CONSTRAINT "perfis_tributarios_aliq_cofins_check" CHECK ("perfis_tributarios"."aliq_cofins" >= 0),
	CONSTRAINT "perfis_tributarios_cst_ipi_check" CHECK ("perfis_tributarios"."cst_ipi" ~ '^[0-9]{2}$'),
	CONSTRAINT "perfis_tributarios_aliq_ipi_check" CHECK ("perfis_tributarios"."aliq_ipi" >= 0),
	CONSTRAINT "perfis_tributarios_cst_ibs_cbs_check" CHECK ("perfis_tributarios"."cst_ibs_cbs" ~ '^[0-9]{3}$'),
	CONSTRAINT "perfis_tributarios_cclasstrib_check" CHECK ("perfis_tributarios"."cclasstrib" ~ '^[0-9]{6}$'),
	CONSTRAINT "perfis_tributarios_aliq_cbs_check" CHECK ("perfis_tributarios"."aliq_cbs" >= 0),
	CONSTRAINT "perfis_tributarios_aliq_ibs_uf_check" CHECK ("perfis_tributarios"."aliq_ibs_uf" >= 0),
	CONSTRAINT "perfis_tributarios_aliq_ibs_mun_check" CHECK ("perfis_tributarios"."aliq_ibs_mun" >= 0),
	CONSTRAINT "perfis_tributarios_regime_icms_check" CHECK (("perfis_tributarios"."regime" = 'simples' and "perfis_tributarios"."csosn" is not null) or ("perfis_tributarios"."regime" = 'normal' and "perfis_tributarios"."cst_icms" is not null))
);
--> statement-breakpoint
CREATE TABLE "produto_aplicacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"modelo_moto_id" uuid NOT NULL,
	"ano_inicial" smallint,
	"ano_final" smallint,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produto_aplicacoes_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "produto_aplicacoes_ano_inicial_check" CHECK ("produto_aplicacoes"."ano_inicial" between 1950 and 2100),
	CONSTRAINT "produto_aplicacoes_ano_final_check" CHECK ("produto_aplicacoes"."ano_final" between 1950 and 2100),
	CONSTRAINT "produto_aplicacoes_anos_check" CHECK ("produto_aplicacoes"."ano_final" is null or "produto_aplicacoes"."ano_inicial" is null or "produto_aplicacoes"."ano_final" >= "produto_aplicacoes"."ano_inicial")
);
--> statement-breakpoint
CREATE TABLE "produto_codigos_barras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"tipo" text NOT NULL,
	"fator" numeric(14, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produto_codigos_barras_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "produto_codigos_barras_empresa_id_codigo_key" UNIQUE("empresa_id","codigo"),
	CONSTRAINT "produto_codigos_barras_codigo_check" CHECK ("produto_codigos_barras"."codigo" = btrim("produto_codigos_barras"."codigo") and "produto_codigos_barras"."codigo" <> ''),
	CONSTRAINT "produto_codigos_barras_tipo_check" CHECK ("produto_codigos_barras"."tipo" in ('fabricante', 'interno', 'embalagem')),
	CONSTRAINT "produto_codigos_barras_fator_check" CHECK ("produto_codigos_barras"."fator" > 0)
);
--> statement-breakpoint
CREATE TABLE "produto_imagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"ordem" smallint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produto_imagens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "produto_imagens_ordem_check" CHECK ("produto_imagens"."ordem" >= 0)
);
--> statement-breakpoint
CREATE TABLE "produtos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text COLLATE "pt-BR-x-icu" NOT NULL,
	"descricao_curta" text,
	"descricao_completa" text,
	"categoria_id" uuid,
	"marca_id" uuid,
	"referencia_fabricante" text,
	"codigo_original" text,
	"unidade" text DEFAULT 'UN' NOT NULL,
	"corredor" text,
	"prateleira" text,
	"gaveta" text,
	"estoque_minimo" numeric(14, 4) DEFAULT '0' NOT NULL,
	"markup" numeric(7, 4),
	"preco_venda" numeric(14, 2) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"peso_g" integer,
	"altura_cm" numeric(8, 2),
	"largura_cm" numeric(8, 2),
	"comprimento_cm" numeric(8, 2),
	"ncm" text,
	"cest" text,
	"origem" smallint,
	"gtin_fiscal" text,
	"unidade_tributavel" text,
	"perfil_tributario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "produtos_empresa_id_codigo_key" UNIQUE("empresa_id","codigo"),
	CONSTRAINT "produtos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "produtos_codigo_check" CHECK ("produtos"."codigo" = btrim("produtos"."codigo") and "produtos"."codigo" <> ''),
	CONSTRAINT "produtos_unidade_check" CHECK ("produtos"."unidade" in ('UN', 'PC', 'PAR', 'JG', 'KIT', 'CX', 'PCT', 'LT', 'ML', 'M')),
	CONSTRAINT "produtos_estoque_minimo_check" CHECK ("produtos"."estoque_minimo" >= 0),
	CONSTRAINT "produtos_markup_check" CHECK ("produtos"."markup" >= 0),
	CONSTRAINT "produtos_preco_venda_check" CHECK ("produtos"."preco_venda" >= 0),
	CONSTRAINT "produtos_peso_g_check" CHECK ("produtos"."peso_g" > 0),
	CONSTRAINT "produtos_altura_cm_check" CHECK ("produtos"."altura_cm" > 0),
	CONSTRAINT "produtos_largura_cm_check" CHECK ("produtos"."largura_cm" > 0),
	CONSTRAINT "produtos_comprimento_cm_check" CHECK ("produtos"."comprimento_cm" > 0),
	CONSTRAINT "produtos_ncm_check" CHECK ("produtos"."ncm" ~ '^[0-9]{8}$'),
	CONSTRAINT "produtos_cest_check" CHECK ("produtos"."cest" ~ '^[0-9]{7}$'),
	CONSTRAINT "produtos_origem_check" CHECK ("produtos"."origem" between 0 and 8),
	CONSTRAINT "produtos_gtin_fiscal_check" CHECK ("produtos"."gtin_fiscal" ~ '^([0-9]{8}|[0-9]{12,14})$' and not (length("produtos"."gtin_fiscal") = 13 and "produtos"."gtin_fiscal" like '2%'))
);
--> statement-breakpoint
CREATE TABLE "servicos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"descricao" text COLLATE "pt-BR-x-icu" NOT NULL,
	"preco_padrao" numeric(14, 2) DEFAULT '0' NOT NULL,
	"comissao_valor" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tempo_estimado_min" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"item_lista_servico" text,
	"codigo_tributacao_municipio" text,
	"aliquota_iss" numeric(7, 4),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "servicos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "servicos_empresa_id_codigo_key" UNIQUE("empresa_id","codigo"),
	CONSTRAINT "servicos_codigo_check" CHECK (btrim("servicos"."codigo") <> ''),
	CONSTRAINT "servicos_preco_padrao_check" CHECK ("servicos"."preco_padrao" >= 0),
	CONSTRAINT "servicos_comissao_valor_check" CHECK ("servicos"."comissao_valor" >= 0),
	CONSTRAINT "servicos_tempo_estimado_min_check" CHECK ("servicos"."tempo_estimado_min" > 0),
	CONSTRAINT "servicos_aliquota_iss_check" CHECK ("servicos"."aliquota_iss" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tabela_preco_itens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tabela_preco_id" uuid NOT NULL,
	"produto_id" uuid NOT NULL,
	"preco" numeric(14, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tabela_preco_itens_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "tabela_preco_itens_tabela_preco_id_produto_id_key" UNIQUE("tabela_preco_id","produto_id"),
	CONSTRAINT "tabela_preco_itens_preco_check" CHECK ("tabela_preco_itens"."preco" >= 0)
);
--> statement-breakpoint
CREATE TABLE "tabelas_preco" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"base" text DEFAULT 'preco_base' NOT NULL,
	"percentual" numeric(7, 4) DEFAULT '0' NOT NULL,
	"padrao" boolean DEFAULT false NOT NULL,
	"aplicar_arredondamento" boolean DEFAULT true NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tabelas_preco_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "tabelas_preco_base_check" CHECK ("tabelas_preco"."base" in ('preco_base', 'ultimo_custo', 'custo_medio')),
	CONSTRAINT "tabelas_preco_percentual_check" CHECK ("tabelas_preco"."percentual" > -100)
);
--> statement-breakpoint
CREATE TABLE "vendedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"usuario_id" uuid,
	"percentual_comissao" numeric(7, 4) DEFAULT '0' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendedores_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "vendedores_percentual_comissao_check" CHECK ("vendedores"."percentual_comissao" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "categorias" ADD CONSTRAINT "categorias_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marcas" ADD CONSTRAINT "marcas_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mecanicos" ADD CONSTRAINT "mecanicos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mecanicos" ADD CONSTRAINT "mecanicos_usuario_id_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "perfis_tributarios" ADD CONSTRAINT "perfis_tributarios_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_aplicacoes" ADD CONSTRAINT "produto_aplicacoes_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_aplicacoes" ADD CONSTRAINT "produto_aplicacoes_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_aplicacoes" ADD CONSTRAINT "produto_aplicacoes_modelo_moto_id_fk" FOREIGN KEY ("modelo_moto_id") REFERENCES "public"."modelos_moto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_codigos_barras" ADD CONSTRAINT "produto_codigos_barras_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_codigos_barras" ADD CONSTRAINT "produto_codigos_barras_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_imagens" ADD CONSTRAINT "produto_imagens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produto_imagens" ADD CONSTRAINT "produto_imagens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_categoria_id_fk" FOREIGN KEY ("empresa_id","categoria_id") REFERENCES "public"."categorias"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_marca_id_fk" FOREIGN KEY ("empresa_id","marca_id") REFERENCES "public"."marcas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "produtos" ADD CONSTRAINT "produtos_perfil_tributario_id_fk" FOREIGN KEY ("empresa_id","perfil_tributario_id") REFERENCES "public"."perfis_tributarios"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "servicos" ADD CONSTRAINT "servicos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabela_preco_itens" ADD CONSTRAINT "tabela_preco_itens_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tabelas_preco" ADD CONSTRAINT "tabelas_preco_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendedores" ADD CONSTRAINT "vendedores_usuario_id_fk" FOREIGN KEY ("empresa_id","usuario_id") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "categorias_empresa_id_nome_key" ON "categorias" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_empresa_id_nome_key" ON "marcas" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "mecanicos_empresa_id_usuario_id_key" ON "mecanicos" USING btree ("empresa_id","usuario_id") WHERE "mecanicos"."usuario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "perfis_tributarios_empresa_id_nome_key" ON "perfis_tributarios" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE INDEX "produto_aplicacoes_empresa_id_modelo_moto_id_idx" ON "produto_aplicacoes" USING btree ("empresa_id","modelo_moto_id");--> statement-breakpoint
CREATE INDEX "produto_aplicacoes_empresa_id_produto_id_idx" ON "produto_aplicacoes" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "produto_codigos_barras_empresa_id_produto_id_idx" ON "produto_codigos_barras" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE INDEX "produto_imagens_empresa_id_produto_id_ordem_idx" ON "produto_imagens" USING btree ("empresa_id","produto_id","ordem");--> statement-breakpoint
CREATE INDEX "produtos_empresa_id_descricao_id_idx" ON "produtos" USING btree ("empresa_id","descricao","id");--> statement-breakpoint
CREATE INDEX "produtos_empresa_id_categoria_id_idx" ON "produtos" USING btree ("empresa_id","categoria_id");--> statement-breakpoint
CREATE INDEX "produtos_empresa_id_marca_id_idx" ON "produtos" USING btree ("empresa_id","marca_id");--> statement-breakpoint
CREATE INDEX "tabela_preco_itens_empresa_id_produto_id_idx" ON "tabela_preco_itens" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tabelas_preco_empresa_id_nome_key" ON "tabelas_preco" USING btree ("empresa_id",lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "tabelas_preco_empresa_id_padrao_key" ON "tabelas_preco" USING btree ("empresa_id") WHERE "tabelas_preco"."padrao";--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_empresa_id_usuario_id_key" ON "vendedores" USING btree ("empresa_id","usuario_id") WHERE "vendedores"."usuario_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "vendedores_empresa_id_nome_key" ON "vendedores" USING btree ("empresa_id",lower("nome"));