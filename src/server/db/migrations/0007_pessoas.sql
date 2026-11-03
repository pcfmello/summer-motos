CREATE TABLE "clientes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo_pessoa" text DEFAULT 'pf' NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"cpf_cnpj" text,
	"ie" text,
	"indicador_ie" smallint DEFAULT 9 NOT NULL,
	"whatsapp" text,
	"email" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"codigo_ibge_municipio" text,
	"uf" text,
	"tabela_preco_id" uuid,
	"empresa_grupo_id" uuid,
	"consumidor_final_padrao" boolean DEFAULT false NOT NULL,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "clientes_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "clientes_tipo_pessoa_check" CHECK ("clientes"."tipo_pessoa" in ('pf', 'pj')),
	CONSTRAINT "clientes_cpf_cnpj_check" CHECK ("clientes"."cpf_cnpj" is null or ("clientes"."tipo_pessoa" = 'pf' and "clientes"."cpf_cnpj" ~ '^[0-9]{11}$') or ("clientes"."tipo_pessoa" = 'pj' and "clientes"."cpf_cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$')),
	CONSTRAINT "clientes_indicador_ie_check" CHECK ("clientes"."indicador_ie" in (1, 2, 9)),
	CONSTRAINT "clientes_whatsapp_check" CHECK ("clientes"."whatsapp" ~ '^[0-9]{10,13}$'),
	CONSTRAINT "clientes_cep_check" CHECK ("clientes"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "clientes_codigo_ibge_municipio_check" CHECK ("clientes"."codigo_ibge_municipio" ~ '^[0-9]{7}$'),
	CONSTRAINT "clientes_uf_check" CHECK ("clientes"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "clientes_empresa_grupo_id_check" CHECK ("clientes"."empresa_grupo_id" <> "clientes"."empresa_id")
);
--> statement-breakpoint
CREATE TABLE "fornecedor_produto_vinculos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid NOT NULL,
	"codigo_fornecedor" text NOT NULL,
	"produto_id" uuid NOT NULL,
	"unidade_compra" text,
	"fator" numeric(14, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedor_produto_vinculos_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "fornecedor_produto_vinculos_fornecedor_codigo_key" UNIQUE("empresa_id","fornecedor_id","codigo_fornecedor"),
	CONSTRAINT "fornecedor_produto_vinculos_fator_check" CHECK ("fornecedor_produto_vinculos"."fator" > 0)
);
--> statement-breakpoint
CREATE TABLE "fornecedores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cnpj" text,
	"razao_social" text COLLATE "pt-BR-x-icu" NOT NULL,
	"nome_fantasia" text,
	"ie" text,
	"contato" text,
	"telefone" text,
	"email" text,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"codigo_ibge_municipio" text,
	"uf" text,
	"empresa_grupo_id" uuid,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fornecedores_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "fornecedores_cnpj_check" CHECK ("fornecedores"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "fornecedores_cep_check" CHECK ("fornecedores"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "fornecedores_codigo_ibge_municipio_check" CHECK ("fornecedores"."codigo_ibge_municipio" ~ '^[0-9]{7}$'),
	CONSTRAINT "fornecedores_uf_check" CHECK ("fornecedores"."uf" ~ '^[A-Z]{2}$'),
	CONSTRAINT "fornecedores_empresa_grupo_id_check" CHECK ("fornecedores"."empresa_grupo_id" <> "fornecedores"."empresa_id")
);
--> statement-breakpoint
CREATE TABLE "motos_cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"modelo_moto_id" uuid,
	"descricao" text,
	"ano" smallint,
	"placa" text,
	"cor" text,
	"km_atual" integer,
	"chassi" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "motos_cliente_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "motos_cliente_ano_check" CHECK ("motos_cliente"."ano" between 1950 and 2100),
	CONSTRAINT "motos_cliente_placa_check" CHECK ("motos_cliente"."placa" ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$'),
	CONSTRAINT "motos_cliente_km_atual_check" CHECK ("motos_cliente"."km_atual" >= 0),
	CONSTRAINT "motos_cliente_modelo_check" CHECK ("motos_cliente"."modelo_moto_id" is not null or "motos_cliente"."descricao" is not null)
);
--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_tabela_preco_id_fk" FOREIGN KEY ("empresa_id","tabela_preco_id") REFERENCES "public"."tabelas_preco"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clientes" ADD CONSTRAINT "clientes_empresa_grupo_id_fk" FOREIGN KEY ("empresa_grupo_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_produto_vinculos" ADD CONSTRAINT "fornecedor_produto_vinculos_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_produto_vinculos" ADD CONSTRAINT "fornecedor_produto_vinculos_fornecedor_id_fk" FOREIGN KEY ("empresa_id","fornecedor_id") REFERENCES "public"."fornecedores"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor_produto_vinculos" ADD CONSTRAINT "fornecedor_produto_vinculos_produto_id_fk" FOREIGN KEY ("empresa_id","produto_id") REFERENCES "public"."produtos"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedores" ADD CONSTRAINT "fornecedores_empresa_grupo_id_fk" FOREIGN KEY ("empresa_grupo_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos_cliente" ADD CONSTRAINT "motos_cliente_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos_cliente" ADD CONSTRAINT "motos_cliente_cliente_id_fk" FOREIGN KEY ("empresa_id","cliente_id") REFERENCES "public"."clientes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "motos_cliente" ADD CONSTRAINT "motos_cliente_modelo_moto_id_fk" FOREIGN KEY ("modelo_moto_id") REFERENCES "public"."modelos_moto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_id_cpf_cnpj_key" ON "clientes" USING btree ("empresa_id","cpf_cnpj") WHERE "clientes"."cpf_cnpj" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "clientes_empresa_id_consumidor_final_key" ON "clientes" USING btree ("empresa_id") WHERE "clientes"."consumidor_final_padrao";--> statement-breakpoint
CREATE INDEX "clientes_empresa_id_nome_id_idx" ON "clientes" USING btree ("empresa_id","nome","id");--> statement-breakpoint
CREATE INDEX "clientes_empresa_id_whatsapp_idx" ON "clientes" USING btree ("empresa_id","whatsapp");--> statement-breakpoint
CREATE INDEX "fornecedor_produto_vinculos_empresa_id_produto_id_idx" ON "fornecedor_produto_vinculos" USING btree ("empresa_id","produto_id");--> statement-breakpoint
CREATE UNIQUE INDEX "fornecedores_empresa_id_cnpj_key" ON "fornecedores" USING btree ("empresa_id","cnpj") WHERE "fornecedores"."cnpj" is not null;--> statement-breakpoint
CREATE INDEX "fornecedores_empresa_id_razao_social_id_idx" ON "fornecedores" USING btree ("empresa_id","razao_social","id");--> statement-breakpoint
CREATE UNIQUE INDEX "motos_cliente_empresa_id_placa_key" ON "motos_cliente" USING btree ("empresa_id","placa") WHERE "motos_cliente"."placa" is not null;--> statement-breakpoint
CREATE INDEX "motos_cliente_empresa_id_cliente_id_idx" ON "motos_cliente" USING btree ("empresa_id","cliente_id");