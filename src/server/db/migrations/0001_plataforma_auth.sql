CREATE TABLE "contas_acesso" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contas_acesso_provider_id_account_id_key" UNIQUE("provider_id","account_id")
);
--> statement-breakpoint
CREATE TABLE "credenciais_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ambiente" text NOT NULL,
	"focus_token_cifrado" "bytea",
	"csc_id" text,
	"csc_cifrado" "bytea",
	"certificado_validade" date,
	"certificado_enviado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credenciais_fiscais_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "credenciais_fiscais_empresa_id_ambiente_key" UNIQUE("empresa_id","ambiente"),
	CONSTRAINT "credenciais_fiscais_ambiente_check" CHECK ("credenciais_fiscais"."ambiente" in ('homologacao', 'producao'))
);
--> statement-breakpoint
CREATE TABLE "empresas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"razao_social" text NOT NULL,
	"nome_fantasia" text,
	"cnpj" text NOT NULL,
	"ie" text,
	"im" text,
	"regime_tributario" text NOT NULL,
	"cep" text,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"municipio" text,
	"codigo_ibge_municipio" text,
	"uf" text,
	"telefone" text,
	"logo_chave" text,
	"config" jsonb DEFAULT '{"permite_estoque_negativo": false, "arredondamento_preco": {"modo": "nenhum"}, "limite_desconto_percentual": {"dono": "100.0000", "balcao": "0.0000", "estoque": "0.0000", "mecanico": "0.0000"}, "validade_orcamento_dias": 7}'::jsonb NOT NULL,
	"modulos" jsonb DEFAULT '{"balcao": false, "os": false, "fiscal": false, "mercado_livre": false, "ecommerce": false, "estoque": false}'::jsonb NOT NULL,
	"config_fiscal" jsonb DEFAULT '{"ambiente": "homologacao", "nfe": {"serie": 1}, "nfce": {"serie": 1}, "series_emissor_externo": []}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "empresas_cnpj_key" UNIQUE("cnpj"),
	CONSTRAINT "empresas_cnpj_check" CHECK ("empresas"."cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "empresas_regime_tributario_check" CHECK ("empresas"."regime_tributario" in ('simples_nacional', 'lucro_presumido', 'lucro_real')),
	CONSTRAINT "empresas_cep_check" CHECK ("empresas"."cep" ~ '^[0-9]{8}$'),
	CONSTRAINT "empresas_codigo_ibge_municipio_check" CHECK ("empresas"."codigo_ibge_municipio" ~ '^[0-9]{7}$'),
	CONSTRAINT "empresas_uf_check" CHECK ("empresas"."uf" ~ '^[A-Z]{2}$')
);
--> statement-breakpoint
CREATE TABLE "membros" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"perfil" text NOT NULL,
	"pin_hash" text,
	"pin_falhas" smallint DEFAULT 0 NOT NULL,
	"pin_bloqueado_ate" timestamp with time zone,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membros_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "membros_empresa_id_usuario_id_key" UNIQUE("empresa_id","usuario_id"),
	CONSTRAINT "membros_perfil_check" CHECK ("membros"."perfil" in ('dono', 'balcao', 'estoque', 'mecanico')),
	CONSTRAINT "membros_pin_hash_check" CHECK ("membros"."pin_hash" is null or "membros"."perfil" = 'dono'),
	CONSTRAINT "membros_pin_falhas_check" CHECK ("membros"."pin_falhas" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	"empresa_ativa_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessoes_token_key" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"status" text DEFAULT 'ativo' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_status_check" CHECK ("tenants"."status" in ('ativo', 'suspenso'))
);
--> statement-breakpoint
CREATE TABLE "usuarios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"admin_plataforma" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuarios_email_key" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verificacoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contas_acesso" ADD CONSTRAINT "contas_acesso_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credenciais_fiscais" ADD CONSTRAINT "credenciais_fiscais_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "empresas" ADD CONSTRAINT "empresas_tenant_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membros" ADD CONSTRAINT "membros_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_empresa_ativa_id_fk" FOREIGN KEY ("empresa_ativa_id","user_id") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contas_acesso_user_id_idx" ON "contas_acesso" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "empresas_tenant_id_idx" ON "empresas" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "membros_usuario_id_idx" ON "membros" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sessoes_user_id_idx" ON "sessoes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verificacoes_identifier_idx" ON "verificacoes" USING btree ("identifier");