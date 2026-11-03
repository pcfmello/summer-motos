CREATE TABLE "marcas_moto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modelos_moto" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"marca_moto_id" uuid NOT NULL,
	"nome" text COLLATE "pt-BR-x-icu" NOT NULL,
	"cilindrada" integer,
	"ativo" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "modelos_moto_cilindrada_check" CHECK ("modelos_moto"."cilindrada" > 0)
);
--> statement-breakpoint
ALTER TABLE "modelos_moto" ADD CONSTRAINT "modelos_moto_marca_moto_id_fk" FOREIGN KEY ("marca_moto_id") REFERENCES "public"."marcas_moto"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "marcas_moto_nome_key" ON "marcas_moto" USING btree (lower("nome"));--> statement-breakpoint
CREATE UNIQUE INDEX "modelos_moto_marca_moto_id_nome_key" ON "modelos_moto" USING btree ("marca_moto_id",lower("nome"));