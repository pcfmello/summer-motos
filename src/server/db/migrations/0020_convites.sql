CREATE TABLE "convites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" text DEFAULT 'empresa' NOT NULL,
	"empresa_id" uuid,
	"email" text NOT NULL,
	"perfil" text,
	"token_hash" text NOT NULL,
	"criado_por" uuid,
	"expira_em" timestamp with time zone DEFAULT now() + interval '7 days' NOT NULL,
	"aceito_em" timestamp with time zone,
	"aceito_por" uuid,
	"revogado_em" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "convites_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "convites_token_hash_key" UNIQUE("token_hash"),
	CONSTRAINT "convites_tipo_check" CHECK ("convites"."tipo" in ('empresa', 'admin_plataforma')),
	CONSTRAINT "convites_perfil_check" CHECK ("convites"."perfil" in ('dono', 'balcao', 'estoque', 'mecanico')),
	CONSTRAINT "convites_token_hash_check" CHECK ("convites"."token_hash" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "convites_email_check" CHECK ("convites"."email" = lower(btrim("convites"."email")) and "convites"."email" <> ''),
	CONSTRAINT "convites_alvo_check" CHECK (("convites"."tipo" = 'empresa' and "convites"."empresa_id" is not null and "convites"."perfil" is not null)
        or ("convites"."tipo" = 'admin_plataforma' and "convites"."empresa_id" is null and "convites"."perfil" is null)),
	CONSTRAINT "convites_situacao_check" CHECK (not ("convites"."aceito_em" is not null and "convites"."revogado_em" is not null)
        and ("convites"."aceito_por" is null or "convites"."aceito_em" is not null))
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_criado_por_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_aceito_por_fk" FOREIGN KEY ("aceito_por") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "convites_empresa_id_email_pendente_key" ON "convites" USING btree ("empresa_id","email") WHERE "convites"."aceito_em" is null and "convites"."revogado_em" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "convites_email_admin_pendente_key" ON "convites" USING btree ("email") WHERE "convites"."tipo" = 'admin_plataforma' and "convites"."aceito_em" is null and "convites"."revogado_em" is null;--> statement-breakpoint
CREATE INDEX "convites_email_idx" ON "convites" USING btree ("email");