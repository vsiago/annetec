CREATE TABLE "vendas_agentes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"user_id" text NOT NULL,
	"papel" text NOT NULL,
	"corretora_id" uuid,
	"unidade_id" uuid,
	"equipe_id" uuid,
	"codigo_indicacao" text NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"meta_mensal" integer,
	"nome" text NOT NULL,
	"cpf" text,
	"telefone" text,
	"data_nascimento" date,
	"endereco" jsonb,
	"repasse" jsonb,
	"observacoes" text,
	"ultima_presenca_em" timestamp with time zone,
	"criado_por_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_agentes_scope_check" CHECK ("vendas_agentes"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_agentes_papel_check" CHECK ("vendas_agentes"."papel" in ('master', 'gerente', 'supervisor', 'vendedor', 'balcao'))
);
--> statement-breakpoint
CREATE TABLE "vendas_atendimentos_balcao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" text NOT NULL,
	"agente_id" uuid NOT NULL,
	"unidade_id" uuid,
	"lead_id" uuid,
	"nome" text NOT NULL,
	"documento" text,
	"telefone" text,
	"servico" text NOT NULL,
	"valor_tabela" numeric(12, 2) NOT NULL,
	"desconto_percentual" integer DEFAULT 0 NOT NULL,
	"valor_com_plano" numeric(12, 2) NOT NULL,
	"plano_id" text,
	"resultado" text NOT NULL,
	"observacoes" text,
	"assinatura_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_atendimentos_balcao_resultado_check" CHECK ("vendas_atendimentos_balcao"."resultado" in ('assinou', 'vai_pensar', 'recusou', 'ja_associado', 'so_informacao'))
);
--> statement-breakpoint
CREATE TABLE "vendas_comissoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"lead_id" uuid,
	"beneficiario_agente_id" uuid,
	"beneficiario_corretora_id" uuid,
	"parte" text NOT NULL,
	"tipo" text NOT NULL,
	"parcela" integer DEFAULT 1 NOT NULL,
	"cobranca_origem" text NOT NULL,
	"cobranca_ref" text NOT NULL,
	"base" numeric(12, 2) NOT NULL,
	"percentual" numeric(6, 2) NOT NULL,
	"valor" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'a_pagar' NOT NULL,
	"mes_referencia" text NOT NULL,
	"pago_em" timestamp with time zone,
	"pago_por_user_id" text,
	"pagamento_ref" text,
	"observacao" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_comissoes_scope_check" CHECK ("vendas_comissoes"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_comissoes_parte_check" CHECK ("vendas_comissoes"."parte" in ('vendedor', 'supervisor', 'gerente', 'corretora')),
	CONSTRAINT "vendas_comissoes_tipo_check" CHECK ("vendas_comissoes"."tipo" in ('mensalidade', 'adesao')),
	CONSTRAINT "vendas_comissoes_status_check" CHECK ("vendas_comissoes"."status" in ('prevista', 'a_pagar', 'paga', 'cancelada', 'a_descontar')),
	CONSTRAINT "vendas_comissoes_origem_check" CHECK ("vendas_comissoes"."cobranca_origem" in ('platform', 'club'))
);
--> statement-breakpoint
CREATE TABLE "vendas_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"escala_mensal" jsonb DEFAULT '[100,50,25]'::jsonb NOT NULL,
	"percentual_adesao" numeric(5, 2) DEFAULT '0' NOT NULL,
	"overrides" jsonb DEFAULT '{"supervisor":10,"gerente":5,"corretora":5}'::jsonb NOT NULL,
	"balcao_percentual" jsonb,
	"distribuicao" text DEFAULT 'pool' NOT NULL,
	"pool_retorno_horas" integer DEFAULT 48 NOT NULL,
	"presenca_minutos" integer DEFAULT 3 NOT NULL,
	"balcao_desconto_padrao" integer DEFAULT 30 NOT NULL,
	"meta_mensal_padrao" integer DEFAULT 10 NOT NULL,
	"modelos_mensagem" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_config_scope_check" CHECK ("vendas_config"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_config_distribuicao_check" CHECK ("vendas_config"."distribuicao" in ('pool', 'automatica'))
);
--> statement-breakpoint
CREATE TABLE "vendas_corretoras" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"nome_fantasia" text NOT NULL,
	"razao_social" text NOT NULL,
	"cnpj" text NOT NULL,
	"email" text,
	"telefone" text,
	"endereco" jsonb,
	"gerente_agente_id" uuid,
	"status" text DEFAULT 'ativa' NOT NULL,
	"comissao_overrides" jsonb,
	"observacoes" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_corretoras_scope_check" CHECK ("vendas_corretoras"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_corretoras_status_check" CHECK ("vendas_corretoras"."status" in ('ativa', 'inativa'))
);
--> statement-breakpoint
CREATE TABLE "vendas_equipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"corretora_id" uuid,
	"unidade_id" uuid,
	"nome" text NOT NULL,
	"supervisor_agente_id" uuid,
	"status" text DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_equipes_scope_check" CHECK ("vendas_equipes"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_equipes_status_check" CHECK ("vendas_equipes"."status" in ('ativa', 'inativa'))
);
--> statement-breakpoint
CREATE TABLE "vendas_lead_eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"texto" text,
	"dados" jsonb,
	"por_user_id" text,
	"por_agente_id" uuid,
	"em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_lead_eventos_tipo_check" CHECK ("vendas_lead_eventos"."tipo" in ('criado', 'reivindicado', 'atribuido', 'devolvido_pool', 'etapa', 'ligacao', 'whatsapp', 'email', 'reuniao', 'visita', 'nota', 'atendimento_balcao', 'proximo_passo', 'conversao', 'sistema'))
);
--> statement-breakpoint
CREATE TABLE "vendas_leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"tipo" text DEFAULT 'pessoa' NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"email" text,
	"telefone" text,
	"cidade" text,
	"uf" text,
	"origem" text DEFAULT 'outro' NOT NULL,
	"origem_detalhe" text,
	"etapa" text DEFAULT 'novo' NOT NULL,
	"agente_id" uuid,
	"reivindicado_em" timestamp with time zone,
	"pool_desde" timestamp with time zone,
	"proximo_passo" text,
	"proximo_passo_em" timestamp with time zone,
	"ultimo_contato_em" timestamp with time zone,
	"interesse_plano_id" text,
	"valor_estimado" numeric(12, 2),
	"vidas_estimadas" integer,
	"atribuicao" jsonb,
	"conversao" jsonb,
	"ganho_em" timestamp with time zone,
	"perdido_em" timestamp with time zone,
	"motivo_perda" text,
	"observacoes" text,
	"dados" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"legado" jsonb,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_leads_scope_check" CHECK ("vendas_leads"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_leads_etapa_check" CHECK ("vendas_leads"."etapa" in ('novo', 'em_contato', 'proposta', 'negociacao', 'ganho', 'perdido')),
	CONSTRAINT "vendas_leads_tipo_check" CHECK ("vendas_leads"."tipo" in ('pessoa', 'empresa')),
	CONSTRAINT "vendas_leads_origem_check" CHECK ("vendas_leads"."origem" in ('site', 'indicacao', 'balcao', 'prospeccao', 'evento', 'redes_sociais', 'importacao', 'link', 'outro'))
);
--> statement-breakpoint
CREATE TABLE "vendas_unidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" text NOT NULL,
	"tenant_id" text,
	"corretora_id" uuid,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'outro' NOT NULL,
	"endereco" jsonb,
	"telefone" text,
	"responsavel_agente_id" uuid,
	"status" text DEFAULT 'ativa' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vendas_unidades_scope_check" CHECK ("vendas_unidades"."scope" in ('platform', 'tenant')),
	CONSTRAINT "vendas_unidades_tipo_check" CHECK ("vendas_unidades"."tipo" in ('corretora', 'clinica', 'ambulatorio', 'hospital', 'loja', 'outro')),
	CONSTRAINT "vendas_unidades_status_check" CHECK ("vendas_unidades"."status" in ('ativa', 'inativa'))
);
--> statement-breakpoint
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_audience_check";--> statement-breakpoint
ALTER TABLE "club_plans" ADD COLUMN "balcao_desconto_percentual" integer;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD COLUMN "vendas_agente_id" uuid;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD COLUMN "vendas_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "vendas_agente_id" uuid;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD COLUMN "vendas_lead_id" uuid;--> statement-breakpoint
ALTER TABLE "vendas_agentes" ADD CONSTRAINT "vendas_agentes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_agentes" ADD CONSTRAINT "vendas_agentes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_agentes" ADD CONSTRAINT "vendas_agentes_corretora_id_vendas_corretoras_id_fk" FOREIGN KEY ("corretora_id") REFERENCES "public"."vendas_corretoras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_agentes" ADD CONSTRAINT "vendas_agentes_unidade_id_vendas_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."vendas_unidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_agentes" ADD CONSTRAINT "vendas_agentes_equipe_id_vendas_equipes_id_fk" FOREIGN KEY ("equipe_id") REFERENCES "public"."vendas_equipes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_atendimentos_balcao" ADD CONSTRAINT "vendas_atendimentos_balcao_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_atendimentos_balcao" ADD CONSTRAINT "vendas_atendimentos_balcao_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_atendimentos_balcao" ADD CONSTRAINT "vendas_atendimentos_balcao_unidade_id_vendas_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."vendas_unidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_atendimentos_balcao" ADD CONSTRAINT "vendas_atendimentos_balcao_lead_id_vendas_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."vendas_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comissoes" ADD CONSTRAINT "vendas_comissoes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comissoes" ADD CONSTRAINT "vendas_comissoes_lead_id_vendas_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."vendas_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comissoes" ADD CONSTRAINT "vendas_comissoes_beneficiario_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("beneficiario_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_comissoes" ADD CONSTRAINT "vendas_comissoes_beneficiario_corretora_id_vendas_corretoras_id_fk" FOREIGN KEY ("beneficiario_corretora_id") REFERENCES "public"."vendas_corretoras"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_config" ADD CONSTRAINT "vendas_config_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_corretoras" ADD CONSTRAINT "vendas_corretoras_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_corretoras" ADD CONSTRAINT "vendas_corretoras_gerente_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("gerente_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_equipes" ADD CONSTRAINT "vendas_equipes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_equipes" ADD CONSTRAINT "vendas_equipes_corretora_id_vendas_corretoras_id_fk" FOREIGN KEY ("corretora_id") REFERENCES "public"."vendas_corretoras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_equipes" ADD CONSTRAINT "vendas_equipes_unidade_id_vendas_unidades_id_fk" FOREIGN KEY ("unidade_id") REFERENCES "public"."vendas_unidades"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_equipes" ADD CONSTRAINT "vendas_equipes_supervisor_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("supervisor_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_lead_eventos" ADD CONSTRAINT "vendas_lead_eventos_lead_id_vendas_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."vendas_leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_leads" ADD CONSTRAINT "vendas_leads_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_leads" ADD CONSTRAINT "vendas_leads_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_unidades" ADD CONSTRAINT "vendas_unidades_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_unidades" ADD CONSTRAINT "vendas_unidades_corretora_id_vendas_corretoras_id_fk" FOREIGN KEY ("corretora_id") REFERENCES "public"."vendas_corretoras"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas_unidades" ADD CONSTRAINT "vendas_unidades_responsavel_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("responsavel_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_agentes_user_scope_tenant_key" ON "vendas_agentes" USING btree ("user_id","scope",coalesce("tenant_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_agentes_codigo_key" ON "vendas_agentes" USING btree ("codigo_indicacao");--> statement-breakpoint
CREATE INDEX "vendas_agentes_scope_papel_idx" ON "vendas_agentes" USING btree ("scope","tenant_id","papel");--> statement-breakpoint
CREATE INDEX "vendas_agentes_equipe_idx" ON "vendas_agentes" USING btree ("equipe_id");--> statement-breakpoint
CREATE INDEX "vendas_agentes_corretora_idx" ON "vendas_agentes" USING btree ("corretora_id");--> statement-breakpoint
CREATE INDEX "vendas_agentes_unidade_idx" ON "vendas_agentes" USING btree ("unidade_id");--> statement-breakpoint
CREATE INDEX "vendas_agentes_presenca_idx" ON "vendas_agentes" USING btree ("ultima_presenca_em");--> statement-breakpoint
CREATE INDEX "vendas_atendimentos_balcao_idx" ON "vendas_atendimentos_balcao" USING btree ("tenant_id","agente_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_comissoes_cobranca_parte_key" ON "vendas_comissoes" USING btree ("cobranca_origem","cobranca_ref","tipo","parte",coalesce("beneficiario_agente_id"::text, "beneficiario_corretora_id"::text, ''));--> statement-breakpoint
CREATE INDEX "vendas_comissoes_scope_status_idx" ON "vendas_comissoes" USING btree ("scope","tenant_id","status");--> statement-breakpoint
CREATE INDEX "vendas_comissoes_beneficiario_mes_idx" ON "vendas_comissoes" USING btree ("beneficiario_agente_id","mes_referencia");--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_config_scope_tenant_key" ON "vendas_config" USING btree ("scope",coalesce("tenant_id", ''));--> statement-breakpoint
CREATE UNIQUE INDEX "vendas_corretoras_cnpj_key" ON "vendas_corretoras" USING btree ("scope",coalesce("tenant_id", ''),"cnpj");--> statement-breakpoint
CREATE INDEX "vendas_corretoras_scope_idx" ON "vendas_corretoras" USING btree ("scope","tenant_id","status");--> statement-breakpoint
CREATE INDEX "vendas_equipes_scope_idx" ON "vendas_equipes" USING btree ("scope","tenant_id","status");--> statement-breakpoint
CREATE INDEX "vendas_equipes_corretora_idx" ON "vendas_equipes" USING btree ("corretora_id");--> statement-breakpoint
CREATE INDEX "vendas_equipes_supervisor_idx" ON "vendas_equipes" USING btree ("supervisor_agente_id");--> statement-breakpoint
CREATE INDEX "vendas_lead_eventos_lead_em_idx" ON "vendas_lead_eventos" USING btree ("lead_id","em");--> statement-breakpoint
CREATE INDEX "vendas_leads_scope_etapa_idx" ON "vendas_leads" USING btree ("scope","tenant_id","etapa");--> statement-breakpoint
CREATE INDEX "vendas_leads_agente_etapa_idx" ON "vendas_leads" USING btree ("agente_id","etapa");--> statement-breakpoint
CREATE INDEX "vendas_leads_pool_idx" ON "vendas_leads" USING btree ("scope","tenant_id") WHERE "vendas_leads"."agente_id" is null;--> statement-breakpoint
CREATE INDEX "vendas_leads_documento_idx" ON "vendas_leads" USING btree ("documento");--> statement-breakpoint
CREATE INDEX "vendas_leads_telefone_idx" ON "vendas_leads" USING btree ("telefone");--> statement-breakpoint
CREATE INDEX "vendas_leads_proximo_passo_idx" ON "vendas_leads" USING btree ("proximo_passo_em");--> statement-breakpoint
CREATE INDEX "vendas_unidades_scope_idx" ON "vendas_unidades" USING btree ("scope","tenant_id","status");--> statement-breakpoint
CREATE INDEX "vendas_unidades_corretora_idx" ON "vendas_unidades" USING btree ("corretora_id");--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_vendas_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("vendas_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "club_subscriptions" ADD CONSTRAINT "club_subscriptions_vendas_lead_id_vendas_leads_id_fk" FOREIGN KEY ("vendas_lead_id") REFERENCES "public"."vendas_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD CONSTRAINT "platform_onboarding_proposals_vendas_agente_id_vendas_agentes_id_fk" FOREIGN KEY ("vendas_agente_id") REFERENCES "public"."vendas_agentes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_onboarding_proposals" ADD CONSTRAINT "platform_onboarding_proposals_vendas_lead_id_vendas_leads_id_fk" FOREIGN KEY ("vendas_lead_id") REFERENCES "public"."vendas_leads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "club_subscriptions_vendas_agente_idx" ON "club_subscriptions" USING btree ("vendas_agente_id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_sales_recipient_check" CHECK ("notifications"."audience" <> 'sales' or "notifications"."recipient_user_id" is not null);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_audience_check" CHECK ("notifications"."audience" in ('tenant', 'platform', 'seller', 'sales'));
--> statement-breakpoint

-- ===========================================================================
-- MIGRAÇÃO DE DADOS da Rede Comercial (docs/rede-comercial.md, "Migração de dados").
-- Idempotente: cada INSERT é protegido por ON CONFLICT DO NOTHING ou NOT EXISTS,
-- então rodar de novo não duplica nada. As tabelas antigas NÃO são apagadas.
-- ===========================================================================

-- Gera um `codigo_indicacao` de 7 caracteres sem ambíguos (sem 0/O, 1/I), único em vendas_agentes.
CREATE OR REPLACE FUNCTION vendas_gerar_codigo() RETURNS text AS $fn$
DECLARE
	alfabeto constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	candidato text;
BEGIN
	LOOP
		candidato := '';
		FOR i IN 1..7 LOOP
			candidato := candidato || substr(alfabeto, 1 + floor(random() * 32)::int, 1);
		END LOOP;
		EXIT WHEN NOT EXISTS (SELECT 1 FROM vendas_agentes WHERE codigo_indicacao = candidato);
	END LOOP;
	RETURN candidato;
END;
$fn$ LANGUAGE plpgsql VOLATILE;
--> statement-breakpoint

-- 1. platform_sales_settings -> vendas_config (platform). A regra nova (100/50/25 + 50% de adesão) substitui a antiga 50/20/10.
INSERT INTO "vendas_config" ("scope", "tenant_id", "escala_mensal", "percentual_adesao", "modelos_mensagem", "updated_by_user_id")
SELECT
	'platform',
	NULL,
	'[100,50,25]'::jsonb,
	50,
	$json$[
		{"id":"primeiro-contato","titulo":"Primeiro contato","canal":"whatsapp","texto":"Olá, {{nome}}! Aqui é {{vendedor}}. Vi seu interesse no plano {{plano}} e queria te apresentar as condições. Posso te ligar agora?"},
		{"id":"envio-link","titulo":"Envio do link","canal":"whatsapp","texto":"Oi, {{nome}}! Segue o link para você conhecer o plano {{plano}} e aderir: {{link}}. Qualquer dúvida, fico por aqui. {{vendedor}}"},
		{"id":"retomar","titulo":"Retomar conversa","canal":"whatsapp","texto":"Oi, {{nome}}, tudo bem? Passando para saber se ficou alguma dúvida sobre o plano {{plano}}. {{vendedor}}"},
		{"id":"proposta-email","titulo":"Proposta por e-mail","canal":"email","texto":"Olá, {{nome}}. Conforme conversamos, segue o link da proposta do plano {{plano}}: {{link}}. Atenciosamente, {{vendedor}}."}
	]$json$::jsonb,
	(SELECT "updated_by_user_id" FROM "platform_sales_settings" WHERE "id" = 'default')
WHERE NOT EXISTS (SELECT 1 FROM "vendas_config" WHERE "scope" = 'platform' AND "tenant_id" IS NULL);
--> statement-breakpoint

-- 2. platform_sellers -> vendas_agentes (platform, vendedor solo). O código de indicação antigo é preservado.
INSERT INTO "vendas_agentes" ("scope", "tenant_id", "user_id", "papel", "codigo_indicacao", "ativo", "meta_mensal", "nome", "telefone", "criado_por_user_id", "created_at")
SELECT 'platform', NULL, ps."user_id", 'vendedor', ps."referral_code", ps."active", ps."monthly_goal", u."name", u."phone", ps."created_by_user_id", ps."created_at"
FROM "platform_sellers" ps
JOIN "user" u ON u."id" = ps."user_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 3a. platform_prospects -> vendas_leads (empresa). Etapas: proposta_enviada->proposta; em_contratacao|em_aprovacao->negociacao.
INSERT INTO "vendas_leads" (
	"scope", "tenant_id", "tipo", "nome", "documento", "email", "telefone", "cidade", "uf",
	"origem", "etapa", "agente_id", "reivindicado_em", "pool_desde",
	"proximo_passo", "proximo_passo_em", "ultimo_contato_em",
	"interesse_plano_id", "valor_estimado", "vidas_estimadas",
	"atribuicao", "conversao", "ganho_em", "perdido_em", "motivo_perda",
	"dados", "legado", "created_at", "updated_at"
)
SELECT
	'platform', NULL, 'empresa', p."name", p."cnpj", p."email", p."phone", p."city", p."state",
	CASE p."origin"
		WHEN 'prospeccao_ativa' THEN 'prospeccao'
		WHEN 'indicacao' THEN 'indicacao'
		WHEN 'evento' THEN 'evento'
		WHEN 'site' THEN 'site'
		WHEN 'redes_sociais' THEN 'redes_sociais'
		ELSE 'outro'
	END,
	CASE p."stage"
		WHEN 'novo' THEN 'novo'
		WHEN 'em_contato' THEN 'em_contato'
		WHEN 'proposta_enviada' THEN 'proposta'
		WHEN 'em_contratacao' THEN 'negociacao'
		WHEN 'em_aprovacao' THEN 'negociacao'
		WHEN 'ganho' THEN 'ganho'
		WHEN 'perdido' THEN 'perdido'
		ELSE 'novo'
	END,
	va."id",
	CASE WHEN va."id" IS NOT NULL THEN p."created_at" END,
	CASE WHEN va."id" IS NULL THEN p."created_at" END,
	p."next_action",
	(p."next_action_at"::timestamp AT TIME ZONE 'America/Sao_Paulo'),
	(SELECT max(i."occurred_at") FROM "platform_prospect_interactions" i WHERE i."prospect_id" = p."id" AND i."kind" IN ('ligacao', 'whatsapp', 'email', 'reuniao', 'visita')),
	p."interest_plan_id", p."estimated_value", p."estimated_lives",
	CASE WHEN p."stage" = 'ganho' AND va."id" IS NOT NULL THEN
		jsonb_build_object('agenteId', va."id", 'papel', 'vendedor', 'equipeId', NULL, 'supervisorAgenteId', NULL, 'unidadeId', NULL, 'corretoraId', NULL, 'gerenteAgenteId', NULL)
	END,
	CASE WHEN p."proposal_id" IS NOT NULL THEN
		jsonb_build_object('tipo', 'proposta', 'id', p."proposal_id"::text, 'status', (SELECT pr."status"::text FROM "platform_onboarding_proposals" pr WHERE pr."id" = p."proposal_id"), 'atualizadoEm', p."updated_at")
	END,
	p."won_at", p."lost_at", p."lost_reason",
	jsonb_strip_nulls(jsonb_build_object('contatoNome', p."contact_name")),
	jsonb_build_object('tabela', 'platform_prospects', 'id', p."id"::text),
	p."created_at", p."updated_at"
FROM "platform_prospects" p
LEFT JOIN "vendas_agentes" va ON va."scope" = 'platform' AND va."tenant_id" IS NULL AND va."user_id" = p."seller_user_id"
WHERE NOT EXISTS (
	SELECT 1 FROM "vendas_leads" l
	WHERE l."scope" = 'platform' AND l."legado"->>'tabela' = 'platform_prospects' AND l."legado"->>'id' = p."id"::text
);
--> statement-breakpoint

-- 3b. platform_prospect_interactions -> vendas_lead_eventos.
INSERT INTO "vendas_lead_eventos" ("lead_id", "tipo", "texto", "dados", "por_user_id", "por_agente_id", "em")
SELECT
	l."id",
	i."kind",
	i."description",
	jsonb_strip_nulls(jsonb_build_object('legadoId', i."id"::text, 'autorNome', i."author_name")),
	i."author_user_id",
	(SELECT a."id" FROM "vendas_agentes" a WHERE a."scope" = 'platform' AND a."tenant_id" IS NULL AND a."user_id" = i."author_user_id"),
	i."occurred_at"
FROM "platform_prospect_interactions" i
JOIN "vendas_leads" l ON l."scope" = 'platform' AND l."legado"->>'tabela' = 'platform_prospects' AND l."legado"->>'id' = i."prospect_id"::text
WHERE NOT EXISTS (
	SELECT 1 FROM "vendas_lead_eventos" e WHERE e."lead_id" = l."id" AND e."dados"->>'legadoId' = i."id"::text
);
--> statement-breakpoint

-- 4. Vendedores dos clubes (member.role = 'seller') -> vendas_agentes (tenant, vendedor solo, código gerado).
INSERT INTO "vendas_agentes" ("scope", "tenant_id", "user_id", "papel", "codigo_indicacao", "ativo", "meta_mensal", "nome", "telefone", "created_at")
SELECT
	'tenant', m."organization_id", m."user_id", 'vendedor', vendas_gerar_codigo(),
	(m."access_status" = 'active'),
	CASE WHEN sp."sales_goal" IS NOT NULL AND sp."sales_goal" > 0 THEN round(sp."sales_goal")::int END,
	u."name", u."phone", m."created_at"
FROM "member" m
JOIN "user" u ON u."id" = m."user_id"
LEFT JOIN "seller_profiles" sp ON sp."user_id" = m."user_id" AND sp."organization_id" = m."organization_id"
WHERE m."role" = 'seller'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 5a. leads (CRM do clube) -> vendas_leads (pessoa). Sem vendedor = pool.
INSERT INTO "vendas_leads" (
	"scope", "tenant_id", "tipo", "nome", "email", "telefone",
	"origem", "origem_detalhe", "etapa", "agente_id", "reivindicado_em", "pool_desde",
	"ultimo_contato_em", "valor_estimado", "atribuicao", "ganho_em", "perdido_em",
	"observacoes", "dados", "legado", "created_at", "updated_at"
)
SELECT
	'tenant', l."organization_id", 'pessoa', l."name", l."email", l."phone",
	CASE WHEN l."source" ILIKE 'Site%' THEN 'site' ELSE 'outro' END,
	l."source",
	CASE l."status"::text
		WHEN 'new' THEN 'novo'
		WHEN 'contacted' THEN 'em_contato'
		WHEN 'qualified' THEN 'em_contato'
		WHEN 'proposal' THEN 'proposta'
		WHEN 'negotiation' THEN 'negociacao'
		WHEN 'closed' THEN 'ganho'
		WHEN 'lost' THEN 'perdido'
		ELSE 'novo'
	END,
	va."id",
	CASE WHEN va."id" IS NOT NULL THEN l."created_at" END,
	CASE WHEN va."id" IS NULL AND l."status"::text IN ('new', 'contacted', 'qualified') THEN l."created_at" END,
	(SELECT max(i."occurred_at") FROM "lead_interactions" i WHERE i."lead_id" = l."id" AND i."type"::text <> 'note'),
	l."estimated_value",
	CASE WHEN l."status"::text = 'closed' AND va."id" IS NOT NULL THEN
		jsonb_build_object('agenteId', va."id", 'papel', 'vendedor', 'equipeId', NULL, 'supervisorAgenteId', NULL, 'unidadeId', NULL, 'corretoraId', NULL, 'gerenteAgenteId', NULL)
	END,
	CASE WHEN l."status"::text = 'closed' THEN l."updated_at" END,
	CASE WHEN l."status"::text = 'lost' THEN l."updated_at" END,
	l."notes",
	'{}'::jsonb,
	jsonb_build_object('tabela', 'leads', 'id', l."id"::text),
	l."created_at", l."updated_at"
FROM "leads" l
LEFT JOIN "vendas_agentes" va ON va."scope" = 'tenant' AND va."tenant_id" = l."organization_id" AND va."user_id" = l."seller_id"
WHERE NOT EXISTS (
	SELECT 1 FROM "vendas_leads" x
	WHERE x."scope" = 'tenant' AND x."tenant_id" = l."organization_id" AND x."legado"->>'tabela' = 'leads' AND x."legado"->>'id' = l."id"::text
);
--> statement-breakpoint

-- 5b. lead_interactions -> vendas_lead_eventos.
INSERT INTO "vendas_lead_eventos" ("lead_id", "tipo", "texto", "dados", "por_user_id", "por_agente_id", "em")
SELECT
	v."id",
	CASE i."type"::text
		WHEN 'call' THEN 'ligacao'
		WHEN 'email' THEN 'email'
		WHEN 'meeting' THEN 'reuniao'
		WHEN 'whatsapp' THEN 'whatsapp'
		ELSE 'nota'
	END,
	i."description",
	jsonb_build_object('legadoId', i."id"::text),
	i."author_id",
	(SELECT a."id" FROM "vendas_agentes" a WHERE a."scope" = 'tenant' AND a."tenant_id" = v."tenant_id" AND a."user_id" = i."author_id"),
	i."occurred_at"
FROM "lead_interactions" i
JOIN "vendas_leads" v ON v."scope" = 'tenant' AND v."legado"->>'tabela' = 'leads' AND v."legado"->>'id' = i."lead_id"::text
WHERE NOT EXISTS (
	SELECT 1 FROM "vendas_lead_eventos" e WHERE e."lead_id" = v."id" AND e."dados"->>'legadoId' = i."id"::text
);
--> statement-breakpoint

-- 6. platform_sales_commissions -> vendas_comissoes (parte vendedor; origem platform).
INSERT INTO "vendas_comissoes" (
	"scope", "tenant_id", "lead_id", "beneficiario_agente_id", "parte", "tipo", "parcela",
	"cobranca_origem", "cobranca_ref", "base", "percentual", "valor", "status", "mes_referencia",
	"pago_em", "pago_por_user_id", "pagamento_ref", "observacao", "created_at", "updated_at"
)
SELECT
	'platform', NULL,
	(
		SELECT l."id" FROM "platform_prospects" pp
		JOIN "vendas_leads" l ON l."scope" = 'platform' AND l."legado"->>'tabela' = 'platform_prospects' AND l."legado"->>'id' = pp."id"::text
		WHERE pp."proposal_id" = c."proposal_id" LIMIT 1
	),
	va."id", 'vendedor',
	CASE c."kind" WHEN 'setup_fee' THEN 'adesao' ELSE 'mensalidade' END,
	COALESCE(c."installment", 1),
	'platform', c."charge_id"::text, c."base_amount", c."percent", c."amount", c."status", c."reference_month",
	CASE WHEN c."status" = 'paga' THEN COALESCE((c."payout_date"::timestamp AT TIME ZONE 'America/Sao_Paulo'), c."updated_at") END,
	c."paid_out_by_user_id", c."payout_note", c."cancel_reason", c."created_at", c."updated_at"
FROM "platform_sales_commissions" c
LEFT JOIN "vendas_agentes" va ON va."scope" = 'platform' AND va."tenant_id" IS NULL AND va."user_id" = c."seller_user_id"
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- 7. Atribuição das propostas já existentes: agente e lead migrados (o seller_user_id antigo continua preenchido).
UPDATE "platform_onboarding_proposals" pr
SET "vendas_agente_id" = va."id"
FROM "vendas_agentes" va
WHERE pr."vendas_agente_id" IS NULL
	AND pr."seller_user_id" IS NOT NULL
	AND va."scope" = 'platform' AND va."tenant_id" IS NULL AND va."user_id" = pr."seller_user_id";
--> statement-breakpoint
UPDATE "platform_onboarding_proposals" pr
SET "vendas_lead_id" = l."id"
FROM "platform_prospects" pp
JOIN "vendas_leads" l ON l."scope" = 'platform' AND l."legado"->>'tabela' = 'platform_prospects' AND l."legado"->>'id' = pp."id"::text
WHERE pr."vendas_lead_id" IS NULL AND pp."proposal_id" = pr."id";
--> statement-breakpoint

DROP FUNCTION vendas_gerar_codigo();
