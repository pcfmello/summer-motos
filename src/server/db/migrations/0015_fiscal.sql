CREATE TABLE "documentos_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"modelo" smallint NOT NULL,
	"finalidade" text DEFAULT 'normal' NOT NULL,
	"natureza_operacao" text NOT NULL,
	"serie" integer NOT NULL,
	"numero" bigint,
	"chave" text,
	"ref" text NOT NULL,
	"ambiente" text NOT NULL,
	"status" text DEFAULT 'pendente' NOT NULL,
	"codigo_status_sefaz" text,
	"motivo_rejeicao" text,
	"protocolo" text,
	"xml_chave" text,
	"pdf_chave" text,
	"venda_id" uuid,
	"ordem_servico_id" uuid,
	"devolucao_id" uuid,
	"chave_referenciada" text,
	"valor_total" numeric(14, 2) NOT NULL,
	"data_emissao" timestamp with time zone,
	"autorizado_em" timestamp with time zone,
	"cancelado_em" timestamp with time zone,
	"usuario_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "documentos_fiscais_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "documentos_fiscais_ref_key" UNIQUE("ref"),
	CONSTRAINT "documentos_fiscais_modelo_check" CHECK ("documentos_fiscais"."modelo" in (55, 65)),
	CONSTRAINT "documentos_fiscais_finalidade_check" CHECK ("documentos_fiscais"."finalidade" in ('normal', 'devolucao', 'complementar', 'ajuste')),
	CONSTRAINT "documentos_fiscais_serie_check" CHECK ("documentos_fiscais"."serie" >= 0),
	CONSTRAINT "documentos_fiscais_chave_check" CHECK ("documentos_fiscais"."chave" ~ '^[0-9]{44}$'),
	CONSTRAINT "documentos_fiscais_ambiente_check" CHECK ("documentos_fiscais"."ambiente" in ('homologacao', 'producao')),
	CONSTRAINT "documentos_fiscais_status_check" CHECK ("documentos_fiscais"."status" in ('pendente', 'processando', 'autorizado', 'erro', 'cancelado', 'denegado')),
	CONSTRAINT "documentos_fiscais_chave_referenciada_check" CHECK ("documentos_fiscais"."chave_referenciada" ~ '^[0-9]{44}$'),
	CONSTRAINT "documentos_fiscais_origem_check" CHECK (num_nonnulls("documentos_fiscais"."venda_id", "documentos_fiscais"."ordem_servico_id", "documentos_fiscais"."devolucao_id") = 1)
);
--> statement-breakpoint
CREATE TABLE "eventos_fiscais" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"documento_fiscal_id" uuid,
	"tipo" text NOT NULL,
	"sequencia" smallint,
	"modelo" smallint,
	"serie" integer,
	"numero_inicial" bigint,
	"numero_final" bigint,
	"justificativa" text NOT NULL,
	"protocolo" text,
	"status" text DEFAULT 'processando' NOT NULL,
	"mensagem_sefaz" text,
	"xml_chave" text,
	"usuario_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "eventos_fiscais_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "eventos_fiscais_tipo_check" CHECK ("eventos_fiscais"."tipo" in ('cancelamento', 'carta_correcao', 'inutilizacao')),
	CONSTRAINT "eventos_fiscais_sequencia_check" CHECK ("eventos_fiscais"."sequencia" between 1 and 20),
	CONSTRAINT "eventos_fiscais_modelo_check" CHECK ("eventos_fiscais"."modelo" in (55, 65)),
	CONSTRAINT "eventos_fiscais_numero_final_check" CHECK ("eventos_fiscais"."numero_final" >= "eventos_fiscais"."numero_inicial"),
	CONSTRAINT "eventos_fiscais_justificativa_check" CHECK (char_length("eventos_fiscais"."justificativa") >= 15),
	CONSTRAINT "eventos_fiscais_status_check" CHECK ("eventos_fiscais"."status" in ('processando', 'autorizado', 'erro')),
	CONSTRAINT "eventos_fiscais_tipo_documento_check" CHECK (("eventos_fiscais"."tipo" = 'inutilizacao' and "eventos_fiscais"."documento_fiscal_id" is null and num_nonnulls("eventos_fiscais"."modelo", "eventos_fiscais"."serie", "eventos_fiscais"."numero_inicial", "eventos_fiscais"."numero_final") = 4) or ("eventos_fiscais"."tipo" <> 'inutilizacao' and "eventos_fiscais"."documento_fiscal_id" is not null))
);
--> statement-breakpoint
CREATE TABLE "notas_recebidas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"emitente_cnpj" text NOT NULL,
	"emitente_nome" text,
	"valor" numeric(14, 2),
	"data_emissao" timestamp with time zone NOT NULL,
	"situacao_nfe" text,
	"status_manifestacao" text DEFAULT 'sem_manifestacao' NOT NULL,
	"manifestada_em" timestamp with time zone,
	"xml_completo" boolean DEFAULT false NOT NULL,
	"xml_chave" text,
	"entrada_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notas_recebidas_empresa_id_id_key" UNIQUE("empresa_id","id"),
	CONSTRAINT "notas_recebidas_empresa_id_chave_key" UNIQUE("empresa_id","chave"),
	CONSTRAINT "notas_recebidas_chave_check" CHECK ("notas_recebidas"."chave" ~ '^[0-9]{44}$'),
	CONSTRAINT "notas_recebidas_emitente_cnpj_check" CHECK ("notas_recebidas"."emitente_cnpj" ~ '^[0-9A-Z]{12}[0-9]{2}$'),
	CONSTRAINT "notas_recebidas_status_manifestacao_check" CHECK ("notas_recebidas"."status_manifestacao" in ('sem_manifestacao', 'ciencia', 'confirmada', 'desconhecida', 'nao_realizada'))
);
--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_venda_id_fk" FOREIGN KEY ("empresa_id","venda_id") REFERENCES "public"."vendas"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_ordem_servico_id_fk" FOREIGN KEY ("empresa_id","ordem_servico_id") REFERENCES "public"."ordens_servico"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_devolucao_id_fk" FOREIGN KEY ("empresa_id","devolucao_id") REFERENCES "public"."devolucoes"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos_fiscais" ADD CONSTRAINT "documentos_fiscais_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_fiscais" ADD CONSTRAINT "eventos_fiscais_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_fiscais" ADD CONSTRAINT "eventos_fiscais_documento_fiscal_id_fk" FOREIGN KEY ("empresa_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos_fiscais" ADD CONSTRAINT "eventos_fiscais_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_recebidas" ADD CONSTRAINT "notas_recebidas_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresas"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notas_recebidas" ADD CONSTRAINT "notas_recebidas_entrada_id_fk" FOREIGN KEY ("empresa_id","entrada_id") REFERENCES "public"."entradas_estoque"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_numeracao_key" ON "documentos_fiscais" USING btree ("empresa_id","ambiente","modelo","serie","numero") WHERE "documentos_fiscais"."numero" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_empresa_id_chave_key" ON "documentos_fiscais" USING btree ("empresa_id","chave") WHERE "documentos_fiscais"."chave" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_venda_vigente_key" ON "documentos_fiscais" USING btree ("empresa_id","venda_id") WHERE "documentos_fiscais"."venda_id" is not null and "documentos_fiscais"."status" in ('pendente', 'processando', 'autorizado');--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_ordem_servico_vigente_key" ON "documentos_fiscais" USING btree ("empresa_id","ordem_servico_id") WHERE "documentos_fiscais"."ordem_servico_id" is not null and "documentos_fiscais"."status" in ('pendente', 'processando', 'autorizado');--> statement-breakpoint
CREATE UNIQUE INDEX "documentos_fiscais_devolucao_vigente_key" ON "documentos_fiscais" USING btree ("empresa_id","devolucao_id") WHERE "documentos_fiscais"."devolucao_id" is not null and "documentos_fiscais"."status" in ('pendente', 'processando', 'autorizado');--> statement-breakpoint
CREATE INDEX "documentos_fiscais_pendentes_idx" ON "documentos_fiscais" USING btree ("empresa_id","status") WHERE "documentos_fiscais"."status" in ('processando', 'erro');--> statement-breakpoint
CREATE INDEX "eventos_fiscais_empresa_id_documento_fiscal_id_idx" ON "eventos_fiscais" USING btree ("empresa_id","documento_fiscal_id");--> statement-breakpoint
CREATE UNIQUE INDEX "eventos_fiscais_carta_correcao_sequencia_key" ON "eventos_fiscais" USING btree ("documento_fiscal_id","sequencia") WHERE "eventos_fiscais"."tipo" = 'carta_correcao';--> statement-breakpoint
CREATE INDEX "notas_recebidas_empresa_manifestacao_emissao_idx" ON "notas_recebidas" USING btree ("empresa_id","status_manifestacao","data_emissao");--> statement-breakpoint
ALTER TABLE "devolucoes" ADD CONSTRAINT "devolucoes_documento_fiscal_id_fk" FOREIGN KEY ("empresa_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordens_servico" ADD CONSTRAINT "ordens_servico_documento_fiscal_id_fk" FOREIGN KEY ("empresa_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("empresa_id","id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_documento_fiscal_id_fk" FOREIGN KEY ("empresa_id","documento_fiscal_id") REFERENCES "public"."documentos_fiscais"("empresa_id","id") ON DELETE restrict ON UPDATE no action;