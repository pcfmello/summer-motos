CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid,
	"autorizado_por" uuid,
	"entidade" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"antes" jsonb,
	"depois" jsonb,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auditoria_empresa_id_id_key" UNIQUE("empresa_id","id")
);
--> statement-breakpoint
CREATE TABLE "sequencias" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"ultimo_valor" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sequencias_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "sequencias_empresa_id_chave_key" UNIQUE("empresa_id","chave"),
	CONSTRAINT "sequencias_chave_check" CHECK ("sequencias"."chave" in ('produto', 'ean', 'orcamento', 'venda', 'os', 'devolucao', 'acerto')),
	CONSTRAINT "sequencias_ultimo_valor_check" CHECK ("sequencias"."ultimo_valor" >= 0)
);
--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_autorizado_por_fk" FOREIGN KEY ("empresa_id","autorizado_por") REFERENCES "public"."membros"("empresa_id","usuario_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sequencias" ADD CONSTRAINT "sequencias_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "auditoria_empresa_entidade_idx" ON "auditoria" USING btree ("empresa_id","entidade","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_empresa_criado_idx" ON "auditoria" USING btree ("empresa_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);--> statement-breakpoint
CREATE INDEX "auditoria_empresa_acao_criado_idx" ON "auditoria" USING btree ("empresa_id","acao","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);