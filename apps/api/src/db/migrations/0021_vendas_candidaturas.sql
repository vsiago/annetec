CREATE TABLE IF NOT EXISTS "vendas_candidatura_documentos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"candidatura_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"file_id" uuid NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"replaced_at" timestamp with time zone,
	CONSTRAINT "vendas_candidatura_documentos_kind_check" CHECK ("vendas_candidatura_documentos"."kind" in ('documento_identidade', 'comprovante_endereco', 'cartao_cnpj', 'contrato_social', 'outro')),
	CONSTRAINT "vendas_candidatura_documentos_status_check" CHECK ("vendas_candidatura_documentos"."status" in ('uploaded', 'replaced'))
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "vendas_candidaturas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"status" text DEFAULT 'rascunho' NOT NULL,
	"tipo_pessoa" text NOT NULL,
	"atuacao" text NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"telefone" text NOT NULL,
	"cpf" text NOT NULL,
	"cnpj" text,
	"razao_social" text,
	"nome_fantasia" text,
	"data_nascimento" date,
	"endereco" jsonb,
	"codigo_indicacao" text,
	"indicado_por_agente_id" uuid,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"aceite" jsonb,
	"origem_ip" text,
	"origem_user_agent" text,
	"enviada_em" timestamp with time zone,
	"decidida_em" timestamp with time zone,
	"decidida_por_user_id" text,
	"motivo_recusa" text,
	"observacoes_decisao" text,
	"agente_id" uuid,
	"corretora_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_candidaturas_scope_check" CHECK ("vendas_candidaturas"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_candidaturas_scope_tenant_check" CHECK (("vendas_candidaturas"."scope" = 'platform' and "vendas_candidaturas"."tenant_id" is null) or ("vendas_candidaturas"."scope" = 'tenant' and "vendas_candidaturas"."tenant_id" is not null)),
	CONSTRAINT "vendas_candidaturas_status_check" CHECK ("vendas_candidaturas"."status" in ('rascunho', 'recebida', 'aprovada', 'recusada')),
	CONSTRAINT "vendas_candidaturas_tipo_pessoa_check" CHECK ("vendas_candidaturas"."tipo_pessoa" in ('pf', 'pj')),
	CONSTRAINT "vendas_candidaturas_atuacao_check" CHECK ("vendas_candidaturas"."atuacao" in ('vendedor_solo', 'vendedor_equipe', 'supervisor', 'gerente', 'corretora'))
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidatura_documentos" ADD CONSTRAINT "vendas_candidatura_documentos_candidatura_id_vendas_candidaturas_id_fk" FOREIGN KEY ("candidatura_id") REFERENCES "public"."vendas_candidaturas"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidatura_documentos" ADD CONSTRAINT "vendas_candidatura_documentos_file_id_platform_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."platform_files"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidaturas" ADD CONSTRAINT "vendas_candidaturas_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidaturas" ADD CONSTRAINT "vendas_candidaturas_indicado_por_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("indicado_por_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidaturas" ADD CONSTRAINT "vendas_candidaturas_decidida_por_user_id_user_id_fk" FOREIGN KEY ("decidida_por_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidaturas" ADD CONSTRAINT "vendas_candidaturas_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "vendas_candidaturas" ADD CONSTRAINT "vendas_candidaturas_corretora_id_vendas_corretoras_id_fk" FOREIGN KEY ("corretora_id") REFERENCES "public"."vendas_corretoras"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendas_candidatura_documentos_candidatura_idx" ON "vendas_candidatura_documentos" USING btree ("candidatura_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "vendas_candidaturas_scope_status_idx" ON "vendas_candidaturas" USING btree ("scope","tenant_id","status","created_at" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "vendas_candidaturas_recebida_email_key" ON "vendas_candidaturas" USING btree ("scope",coalesce("tenant_id", ''),"email") WHERE "vendas_candidaturas"."status" = 'recebida';
