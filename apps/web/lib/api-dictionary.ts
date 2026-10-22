export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export interface ApiRouteItem {
  method: HttpMethod
  /** Caminho relativo ao prefixo do módulo, com query string de exemplo quando relevante. */
  route: string
  description: string
  /** Papel exigido (Annetec) ou como o upstream é reaproveitado (Digital Saúde). */
  access: string
}

export interface ApiSection {
  heading: string
  items: ApiRouteItem[]
}

export interface ApiModule {
  title: string
  /** Prefixo real montado em apps/api/src/routes.ts. */
  prefix: string
  /** Nome do controller em apps/api/src/modules, para quem for direto ao código. */
  controllerRef?: string
  summary: string
  sections: ApiSection[]
}

/**
 * Espelho do que existe de verdade em `apps/api/src`. Toda vez que uma rota
 * for adicionada, renomeada ou tiver o papel de acesso alterado, atualizar
 * aqui — esta página é a referência rápida de quem integra com a API sem
 * abrir o código.
 */

// ---------------------------------------------------------------------------
// Annetec — regras de negócio próprias (apps/api/src/modules)
// ---------------------------------------------------------------------------
export const annetecModules: ApiModule[] = [
  {
    title: 'Autenticação',
    prefix: '/api/v1/auth',
    controllerRef: 'authController',
    summary:
      'Camada de identidade de toda a plataforma, construída inteiramente sobre o Better Auth — nenhuma rota aqui implementa hash de senha, sessão ou token por conta própria; tudo passa por auth.api.*.',
    sections: [
      {
        heading: 'Login',
        items: [
          {
            method: 'POST',
            route: '/login',
            description:
              'Autentica por e-mail e senha. Sem tenantSlug, resolve sozinho: equipe Annetec (scope platform) ou o vínculo do inquilino (admin > vendedor > associado); com tenantSlug, exige que a conta seja membro daquele inquilino, em qualquer papel.',
            access: 'público',
          },
          {
            method: 'POST',
            route: '/login/method',
            description:
              'Tela de login do inquilino, etapa 1: recebe { tenantSlug, email } e diz o próximo passo — portal (associado daquele inquilino, entra por CPF) ou password (admin/vendedor). E-mail desconhecido responde password, sem revelar se a conta existe.',
            access: 'público',
          },
          {
            method: 'POST',
            route: '/login/portal',
            description:
              'Login do associado por CPF + e-mail, validados ao vivo contra GET /contrato/procurarPorClientePortal na Digital Saúde. Sem senha local — a identidade é o próprio contrato. Provisiona a conta no primeiro acesso.',
            access: 'público',
          },
        ],
      },
      {
        heading: 'Cadastro e sessão',
        items: [
          { method: 'POST', route: '/register', description: 'Autocadastro de associado num inquilino (nome, e-mail, CPF, senha).', access: 'público' },
          { method: 'GET', route: '/me', description: 'Sessão do usuário autenticado — escopo, papel e inquilino ativo.', access: 'autenticado' },
          { method: 'POST', route: '/logout', description: 'Encerra a sessão atual.', access: 'autenticado' },
        ],
      },
      {
        heading: 'Senha',
        items: [
          { method: 'POST', route: '/password', description: 'Troca a própria senha (exige a senha atual, revoga as demais sessões).', access: 'autenticado' },
          { method: 'POST', route: '/password/forgot', description: 'Dispara o fluxo de redefinição de senha por e-mail.', access: 'público' },
        ],
      },
    ],
  },
  {
    title: 'Plataforma',
    prefix: '/api/v1/platform/tenants',
    controllerRef: 'tenantsController',
    summary:
      'Administração de inquilinos — o fluxo que o superadmin percorre em /admin/inquilinos. Território exclusivo da equipe Annetec, nunca acessível de dentro de um inquilino.',
    sections: [
      {
        heading: 'Ciclo de vida do inquilino',
        items: [
          { method: 'GET', route: '/', description: 'Lista os inquilinos, com busca e paginação.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/', description: 'Cria um inquilino e seu usuário admin, com senha provisória (aparece uma única vez, na resposta).', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/:id', description: 'Detalhe de um inquilino.', access: 'superadmin · platform_admin' },
          { method: 'PATCH', route: '/:id', description: 'Atualiza cadastro, marca (branding), plano contratado ou status comercial.', access: 'superadmin · platform_admin' },
          { method: 'DELETE', route: '/:id', description: 'Cancela o inquilino. Lógico — nada é apagado, o histórico continua acessível.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/operador', description: 'A Annetec operando como operadora (kind: platform) — no máximo uma linha existe. É o escopo padrão das telas de operação do /admin.', access: 'superadmin · platform_admin' },
        ],
      },
      {
        heading: 'Integração com a Digital Saúde',
        items: [
          { method: 'GET', route: '/:id/integration', description: 'Configuração da integração do inquilino, sem os segredos.', access: 'superadmin · platform_admin' },
          { method: 'PUT', route: '/:id/integration', description: 'Grava token/senhaApi cifrados (AES-256-GCM) — valida contra o ERP antes de salvar.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/:id/integration/test', description: 'Testa a integração já configurada e atualiza o último status.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/:id/integration/discovery', description: 'Lê no ERP os códigos que não têm endpoint próprio (grupo, filial, produto, grupo de produtor) percorrendo outras respostas. Só leitura.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/:id/integration/capabilities', description: 'Apura operação a operação o que o token do inquilino executa de fato — o 401 da Digital Saúde é por endpoint, não por credencial.', access: 'superadmin · platform_admin' },
        ],
      },
      {
        heading: 'Acesso ao inquilino',
        items: [
          { method: 'GET', route: '/:id/usuarios', description: 'Contas do inquilino pela ótica da plataforma. A rota equivalente do inquilino é por slug; esta é por id, que é a chave da tela de gestão.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/:id/usuarios/:userId/senha', description: 'Reset administrativo de senha, sem exigir a senha atual. Confere o vínculo com o inquilino antes (id de fora devolve 404) e registra na auditoria sem gravar a senha. Omitir o corpo gera uma provisória, devolvida uma única vez.', access: 'superadmin' },
          { method: 'POST', route: '/:id/entrar-como/:papel', description: 'Abre uma sessão real no inquilino com o papel pedido (admin ou vendedor), para operar o painel dele. O token do superadmin fica guardado para voltar.', access: 'superadmin' },
          { method: 'POST', route: '/:id/usuarios/:userId/entrar-como', description: 'Entra como um usuário específico do inquilino — sessão real, por até 1 h. Tão sensível quanto reset de senha; registrado na auditoria.', access: 'superadmin' },
        ],
      },
    ],
  },
  {
    title: 'Usuários da Plataforma',
    prefix: '/api/v1/platform/users',
    controllerRef: 'platformUsersController',
    summary:
      'Contas de equipe Annetec (superadmin, platform_admin) — a mesma tabela user do Better Auth que os inquilinos usam; o que isola "é Annetec" é o papel. Sem nenhuma dependência da Digital Saúde.',
    sections: [
      {
        heading: 'Cadastro',
        items: [
          { method: 'GET', route: '/', description: 'Lista as contas de plataforma, com busca e filtro por papel.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/', description: 'Cria uma conta de plataforma nova. Só superadmin — evita autopromoção.', access: 'superadmin' },
          { method: 'GET', route: '/:id', description: 'Detalhe de uma conta de plataforma.', access: 'superadmin · platform_admin' },
          { method: 'PATCH', route: '/:id', description: 'Edita nome, telefone, papel e ativação. Recusa autodesativação e recusa deixar a plataforma sem nenhum superadmin ativo. Desativar usa user.banned do Better Auth — a conta para de entrar de verdade, e continua assinando o histórico.', access: 'superadmin' },
        ],
      },
    ],
  },
  {
    title: 'Planos de Assinatura',
    prefix: '/api/v1/platform/plans',
    controllerRef: 'tenantPlansController',
    summary:
      'Catálogo de planos que a Annetec vende aos inquilinos — o que a tela /admin/configuracoes edita. Dado 100% Annetec: a Digital Saúde não sabe que a plataforma é vendida por assinatura.',
    sections: [
      {
        heading: 'Catálogo',
        items: [
          { method: 'GET', route: '/', description: 'Lista os planos. Poucos registros — sem paginação.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/', description: 'Cria um plano.', access: 'superadmin' },
          { method: 'PATCH', route: '/:id', description: 'Edita nome, preço, limite de associados ou recursos. Vale para quem já contratou o plano.', access: 'superadmin' },
          { method: 'DELETE', route: '/:id', description: 'Remove um plano — recusado (422) enquanto houver inquilino usando, porque a FK é SET NULL e eles ficariam sem plano em silêncio.', access: 'superadmin' },
        ],
      },
    ],
  },
  {
    title: 'Rastreabilidade',
    prefix: '/api/v1/platform/activity',
    controllerRef: 'activityAdminController',
    summary:
      'Visitas de página e ações relevantes — alimenta /admin/logs. Eventos imutáveis: "online agora" e "visto por último" são derivados por consulta, não guardados à parte.',
    sections: [
      {
        heading: 'Consulta',
        items: [
          { method: 'GET', route: '/overview', description: 'Panorama de atividade da plataforma.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/visitors', description: 'Visitantes e sessões, incluindo anônimos identificados por cookie antes de qualquer login.', access: 'superadmin · platform_admin' },
        ],
      },
    ],
  },
  {
    title: 'Ingestão de Atividade',
    prefix: '/api/v1/activity',
    controllerRef: 'activityIngestController',
    summary: 'Por onde o frontend registra visita de página. Aberto: precisa aceitar visitante anônimo, antes de existir sessão.',
    sections: [
      {
        heading: 'Registro',
        items: [
          { method: 'POST', route: '/events', description: 'Registra um evento de visita ou ação. Não exige sessão.', access: 'público' },
        ],
      },
    ],
  },
  {
    title: 'Usuários do inquilino',
    prefix: '/api/v1/t/:tenantSlug/usuarios',
    controllerRef: 'usersController',
    summary: 'CRUD de admin, vendedor e cliente dentro de um inquilino. Toda a rota é restrita ao admin do próprio inquilino.',
    sections: [
      {
        heading: 'Cadastro',
        items: [
          { method: 'GET', route: '/', description: 'Lista usuários do inquilino, com filtro por papel e paginação.', access: 'admin' },
          { method: 'POST', route: '/', description: 'Cria um usuário no inquilino. Reaproveita a conta Better Auth se o e-mail já existir em outro inquilino.', access: 'admin' },
          { method: 'GET', route: '/:id', description: 'Detalhe de um usuário.', access: 'admin' },
          { method: 'PATCH', route: '/:id', description: 'Atualiza nome, e-mail, telefone, papel ou ativo/inativo.', access: 'admin' },
          { method: 'DELETE', route: '/:id', description: 'Desativa o vínculo com o inquilino — a conta em si não é apagada.', access: 'admin' },
        ],
      },
      {
        heading: 'Vínculo com a Digital Saúde',
        items: [
          { method: 'PUT', route: '/:id/produtor', description: 'Vincula um vendedor a um produtor já existente no ERP, conferindo o código antes de gravar.', access: 'admin' },
          { method: 'POST', route: '/:id/produtor', description: 'Cria o produtor no ERP e já vincula ao vendedor.', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Contratos e Adesão',
    prefix: '/api/v1/t/:tenantSlug/contratos',
    controllerRef: 'contractsController',
    summary:
      'Adesões e o espelho local dos contratos da Digital Saúde (tabela contracts). A visibilidade é decidida uma vez no controller: cliente vê só os seus contratos, vendedor só os que produziu, admin vê todos.',
    sections: [
      {
        heading: 'Consulta',
        items: [
          { method: 'GET', route: '/', description: 'Lista contratos do espelho local, com filtro por status e busca.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/:codigo', description: 'Detalhe de um contrato — busca no ERP e grava se ainda não estiver espelhado.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/busca/cpf', description: 'Busca contrato por CPF direto no ERP — rota de central de atendimento.', access: 'admin' },
        ],
      },
      {
        heading: 'Adesão e ciclo de vida',
        items: [
          { method: 'POST', route: '/', description: 'Registra uma nova adesão na Digital Saúde a partir do input de domínio.', access: 'admin · vendedor' },
          { method: 'POST', route: '/:codigo/sync', description: 'Força a releitura de um contrato direto do ERP.', access: 'admin · vendedor' },
          { method: 'POST', route: '/:codigo/produzido', description: 'Muda o contrato de Pendente para Produzido.', access: 'admin' },
        ],
      },
      {
        heading: 'Documentos e saúde',
        items: [
          { method: 'POST', route: '/anexos', description: 'Anexa um documento (URL pública) a um contrato.', access: 'admin · vendedor' },
          { method: 'POST', route: '/patologias', description: 'Registra declaração de saúde de um beneficiário.', access: 'admin · vendedor' },
          { method: 'POST', route: '/pendencias', description: 'Abre uma pendência num contrato.', access: 'admin' },
        ],
      },
      {
        heading: 'Comunicação',
        items: [
          { method: 'POST', route: '/:codigo/carteirinha/email', description: 'Reenvia a carteirinha provisória por e-mail.', access: 'admin · vendedor · cliente' },
        ],
      },
    ],
  },
  {
    title: 'Carteirinha Digital',
    prefix: '/api/v1/t/:tenantSlug/carteirinhas',
    controllerRef: 'membershipCardsController',
    summary: 'Carteirinhas do associado autenticado, montadas a partir do espelho local — um cartão por beneficiário do seu contrato.',
    sections: [
      { heading: 'Consulta', items: [{ method: 'GET', route: '/', description: 'Carteirinhas do associado logado, com titular e dependentes.', access: 'cliente' }] },
    ],
  },
  {
    title: 'Catálogo',
    prefix: '/api/v1/t/:tenantSlug/catalogo',
    controllerRef: 'catalogController',
    summary:
      'Disponibiliza os dados comerciais de planos de saúde e realiza cotações, integrando com a API da Digital Saúde. Convênios, planos, carências e tabelas passam por um cache em banco (upstream_cache, TTL de 60 minutos) — cotação nunca é cacheada.',
    sections: [
      {
        heading: 'Convênios e Planos',
        items: [
          { method: 'GET', route: '/convenios', description: 'Lista os convênios cadastrados para o inquilino.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/convenios/:codigo', description: 'Detalhes de um convênio específico.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/planos?codigoProduto=...', description: 'Lista os planos vinculados a um produto.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/planos/:codigo', description: 'Detalhes de um plano específico.', access: 'admin · vendedor · cliente' },
        ],
      },
      {
        heading: 'Regras Comerciais (Tabelas e Carências)',
        items: [
          { method: 'GET', route: '/carencias?codigoConvenio=...', description: 'Consulta os períodos de carência de um convênio.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/tabelas?codigoConvenio=...', description: 'Consulta as tabelas de preços associadas a um convênio.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/tabelas/:codigo', description: 'Detalhe de uma tabela de preço por faixa etária.', access: 'admin · vendedor · cliente' },
        ],
      },
      {
        heading: 'Cotação / Simulação de Vendas',
        items: [
          {
            method: 'POST',
            route: '/cotacao',
            description: 'Realiza o cálculo dinâmico de preços com base na UF e na composição familiar (idades e parentescos). Nunca cacheado.',
            access: 'admin · vendedor',
          },
        ],
      },
      {
        heading: 'Gestão de Cache',
        items: [
          { method: 'DELETE', route: '/cache', description: 'Permite que administradores forcem a invalidação do cache em banco (upstream_cache).', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Financeiro',
    prefix: '/api/v1/t/:tenantSlug/financeiro',
    controllerRef: 'billingController',
    summary:
      'Faturas, demonstrativos e comissões. Nada é persistido: sempre lido do ERP no momento da consulta — um boleto desatualizado é pior que uma tela um pouco mais lenta. Antes de devolver qualquer coisa de um contrato, confirma que quem pediu pode ver aquele contrato.',
    sections: [
      {
        heading: 'Faturas',
        items: [
          { method: 'GET', route: '/faturas?contratoCodigo=...', description: 'Faturas de um contrato, com filtro por status.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/faturas/vencidas', description: 'Faturas vencidas de toda a carteira do inquilino.', access: 'admin' },
          { method: 'GET', route: '/faturas/:codigo', description: 'Detalhe de uma fatura, com linha digitável e link do boleto.', access: 'admin · vendedor' },
          { method: 'POST', route: '/faturas/enviar-vencidas', description: 'Reenvia por e-mail as faturas vencidas de um contrato.', access: 'admin · vendedor · cliente' },
        ],
      },
      {
        heading: 'Demonstrativos',
        items: [
          { method: 'GET', route: '/demonstrativos?contratoCodigo=...', description: 'Demonstrativos de pagamento (IR) de um contrato.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/demonstrativos/:codigo', description: 'Detalhe de um demonstrativo.', access: 'admin · vendedor · cliente' },
        ],
      },
      {
        heading: 'Comissões',
        items: [
          {
            method: 'GET',
            route: '/comissoes?status=emitido|pago',
            description: 'Recibos de comissão — vendedor só vê os próprios; admin consulta qualquer um informando vendedorId.',
            access: 'admin · vendedor',
          },
          { method: 'GET', route: '/comissoes/:codigo', description: 'Detalhe de um recibo de comissão, com os lançamentos.', access: 'admin · vendedor' },
        ],
      },
    ],
  },
  {
    title: 'CRM',
    prefix: '/api/v1/t/:tenantSlug/crm',
    controllerRef: 'crmController',
    summary:
      'Funil de vendas. Diferente de contratos e financeiro, aqui a Annetec é a fonte da verdade — a Digital Saúde não conhece leads. Vendedor enxerga só a própria carteira; admin enxerga a do inquilino inteiro.',
    sections: [
      {
        heading: 'Leads',
        items: [
          { method: 'GET', route: '/leads', description: 'Funil de leads, com filtro por status e vendedor.', access: 'admin · vendedor' },
          { method: 'POST', route: '/leads', description: 'Cria um lead.', access: 'admin · vendedor' },
          { method: 'GET', route: '/leads/:id', description: 'Detalhe de um lead, com histórico de interações.', access: 'admin · vendedor' },
          { method: 'PATCH', route: '/leads/:id', description: 'Atualiza status, dados ou vendedor responsável.', access: 'admin · vendedor' },
          { method: 'DELETE', route: '/leads/:id', description: 'Remove um lead.', access: 'admin' },
          { method: 'POST', route: '/leads/:id/interacoes', description: 'Registra uma interação (ligação, e-mail, reunião, nota) com o lead.', access: 'admin · vendedor' },
        ],
      },
      {
        heading: 'Vendas e Metas',
        items: [
          { method: 'GET', route: '/vendas', description: 'Vendas fechadas, com filtro por vendedor e período.', access: 'admin · vendedor' },
          { method: 'POST', route: '/vendas', description: 'Registra uma venda — a comissão é calculada e congelada pela taxa vigente do vendedor.', access: 'admin · vendedor' },
          { method: 'PATCH', route: '/vendas/:id', description: 'Atualiza a situação ou os dados de uma venda registrada.', access: 'admin · vendedor' },
          { method: 'GET', route: '/metas?ano=...&mes=...', description: 'Metas por vendedor/mês, com o realizado somado das vendas confirmadas do período.', access: 'admin · vendedor' },
          { method: 'PUT', route: '/metas', description: 'Define a meta e a taxa de comissão de um vendedor no mês.', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Rede e Benefícios',
    prefix: '/api/v1/t/:tenantSlug/rede',
    controllerRef: 'networkController',
    summary: 'Rede credenciada e clube de benefícios — conteúdo 100% Annetec, sem equivalente na Digital Saúde. Leitura liberada a qualquer papel; escrita só para admin.',
    sections: [
      {
        heading: 'Parceiros',
        items: [
          { method: 'GET', route: '/parceiros', description: 'Rede credenciada do inquilino, com filtro por categoria.', access: 'admin · vendedor · cliente' },
          { method: 'POST', route: '/parceiros', description: 'Cadastra um parceiro.', access: 'admin' },
          { method: 'PATCH', route: '/parceiros/:id', description: 'Atualiza um parceiro.', access: 'admin' },
          { method: 'DELETE', route: '/parceiros/:id', description: 'Remove um parceiro da rede.', access: 'admin' },
        ],
      },
      {
        heading: 'Clube de Benefícios',
        items: [
          { method: 'GET', route: '/beneficios', description: 'Benefícios do clube do inquilino.', access: 'admin · vendedor · cliente' },
          { method: 'POST', route: '/beneficios', description: 'Cadastra um benefício.', access: 'admin' },
          { method: 'PATCH', route: '/beneficios/:id', description: 'Edita um benefício do clube.', access: 'admin' },
          { method: 'DELETE', route: '/beneficios/:id', description: 'Remove um benefício.', access: 'admin' },
        ],
      },
      {
        heading: 'Planos do clube',
        items: [
          { method: 'GET', route: '/planos', description: 'Planos que o clube vende aos associados (preço, dependentes, coberturas e regulamento).', access: 'admin · vendedor · cliente' },
          { method: 'POST', route: '/planos', description: 'Cria um plano do clube.', access: 'admin' },
          { method: 'PATCH', route: '/planos/:id', description: 'Edita um plano do clube (preço, vitrine, coberturas, regulamento).', access: 'admin' },
          { method: 'DELETE', route: '/planos/:id', description: 'Remove um plano sem assinaturas.', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Inquilino Público',
    prefix: '/api/v1/t/:tenantSlug/public',
    controllerRef: 'tenantPublicController',
    summary:
      'Marca e identidade do inquilino antes de qualquer login — é o que pinta a página institucional /[tenant] e a tela de entrada com as cores do clube. Inquilino cancelado não resolve aqui.',
    sections: [
      {
        heading: 'Identidade',
        items: [
          { method: 'GET', route: '/', description: 'Nome, slug, marca e cores do inquilino. Sem sessão.', access: 'público' },
          { method: 'GET', route: '/parceiros', description: 'Rede credenciada exibida na vitrine do clube.', access: 'público' },
          { method: 'GET', route: '/beneficios', description: 'Benefícios exibidos na vitrine do clube.', access: 'público' },
          { method: 'GET', route: '/planos', description: 'Planos ativos do clube para a vitrine (preço e coberturas).', access: 'público' },
          { method: 'POST', route: '/leads', description: '"Quero ser associado" / "Proposta para empresas" da vitrine: grava o lead no funil do inquilino sem devolvê-lo.', access: 'público' },
        ],
      },
    ],
  },
  {
    title: 'Clube — Checkout público',
    prefix: '/api/v1/t/:tenantSlug/public/checkout',
    controllerRef: 'clubCheckoutController',
    summary:
      'Assinatura do Clube de Benefícios sem login: planos com preço por dependente, cobrança no gateway (simulado ou Asaas) e acompanhamento do pagamento. As rotas por assinatura exigem ?chave= (HMAC devolvido no checkout); chave errada responde 404.',
    sections: [
      {
        heading: 'Checkout',
        items: [
          { method: 'GET', route: '/contexto', description: 'Planos ativos (com preço por dependente e teto), meios habilitados, gateway e regras da simulação.', access: 'público' },
          { method: 'POST', route: '/', description: 'Cria conta (se o e-mail for novo), assinatura, dependentes e a 1ª cobrança. Cartão recusado também responde 201 com a cobrança recusada.', access: 'público' },
          { method: 'GET', route: '/:subscriptionId?chave=', description: 'Situação da assinatura e da cobrança corrente; sincroniza com o gateway (máx. 1×/3 s).', access: 'público (com chave)' },
          { method: 'POST', route: '/:subscriptionId/pagamento?chave=', description: 'Nova tentativa ou troca de método enquanto aguarda pagamento.', access: 'público (com chave)' },
          { method: 'POST', route: '/:subscriptionId/simular-pagamento?chave=', description: 'Confirma o pagamento no modo simulado/sandbox (422 fora dele).', access: 'público (com chave)' },
          { method: 'GET', route: '/:subscriptionId/cobrancas/:chargeId?chave=', description: 'Dados da página imprimível do boleto.', access: 'público (com chave)' },
        ],
      },
    ],
  },
  {
    title: 'Clube — Faturamento e Cadastros',
    prefix: '/api/v1/t/:tenantSlug/faturamento',
    controllerRef: 'clubBillingAdminController',
    summary:
      'Motor de cobrança próprio do clube: assinaturas, cobranças, régua e inadimplência vivem no nosso banco; o gateway só processa. Tudo auditado.',
    sections: [
      {
        heading: 'Painel',
        items: [
          { method: 'GET', route: '/resumo', description: 'MRR, assinaturas por situação, inadimplência, recebido e os últimos 6 meses.', access: 'admin' },
          { method: 'GET', route: '/planos/estatisticas', description: 'Assinaturas, vidas e receita por plano do clube.', access: 'admin' },
          { method: 'GET', route: '/eventos', description: 'Linha do tempo de pagamentos (webhook, automação, checkout, manual, simulação).', access: 'admin' },
          { method: 'POST', route: '/automacao/executar', description: 'Roda a automação de cobrança agora, só para este inquilino.', access: 'admin' },
          { method: 'GET', route: '/configuracoes', description: 'Régua de cobrança e gateway efetivo.', access: 'admin' },
          { method: 'PATCH', route: '/configuracoes', description: 'Altera a régua (meios, prazos, retentativas, multa/juros, gateway).', access: 'admin' },
        ],
      },
      {
        heading: 'Cobranças',
        items: [
          { method: 'GET', route: '/cobrancas', description: 'Cobranças por vencimento, com filtros de situação, método, período e busca.', access: 'admin' },
          { method: 'GET', route: '/cobrancas/:id', description: 'Cobrança com a assinatura e a linha do tempo.', access: 'admin' },
          { method: 'POST', route: '/cobrancas/:id/segunda-via', description: 'Novo vencimento (e troca Pix↔boleto) na mesma cobrança.', access: 'admin' },
          { method: 'POST', route: '/cobrancas/:id/baixa-manual', description: 'Registra pagamento recebido fora do gateway.', access: 'admin' },
          { method: 'POST', route: '/cobrancas/:id/cancelar', description: 'Cancela cobrança em aberto.', access: 'admin' },
          { method: 'POST', route: '/cobrancas/:id/simular-pagamento', description: 'Confirma o pagamento no modo simulado/sandbox.', access: 'admin' },
        ],
      },
      {
        heading: 'Assinaturas (Cadastros)',
        items: [
          { method: 'GET', route: '/assinaturas', description: 'Assinaturas com titular e dependentes; busca por nome, e-mail, CPF ou carteirinha.', access: 'admin' },
          { method: 'GET', route: '/assinaturas/:id', description: 'Assinatura com cobranças e linha do tempo.', access: 'admin' },
          { method: 'GET', route: '/assinaturas/:id/cobrancas/previa', description: '"Gerar cobrança": próximo período e valor do adiantamento, preferência do associado, métodos do clube e cartão salvo mascarado.', access: 'admin' },
          { method: 'POST', route: '/assinaturas/:id/cobrancas', description: 'Adianta a próxima mensalidade ou lança cobrança avulsa (Pix/boleto/cartão salvo/link) e avisa o associado; só ativa/em atraso (422).', access: 'admin' },
          { method: 'POST', route: '/assinaturas/:id/cancelar', description: 'Cancela a assinatura e as cobranças em aberto.', access: 'admin' },
          { method: 'POST', route: '/assinaturas/:id/reativar', description: 'Reabre assinatura cancelada (nova cobrança) ou reativa em atraso/suspensa.', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Clube — Área do associado',
    prefix: '/api/v1/t/:tenantSlug/cliente',
    controllerRef: 'clubPortalController',
    summary: 'O associado vê a própria assinatura, carteirinhas e cobranças; tudo filtrado pelo usuário da sessão.',
    sections: [
      {
        heading: 'Assinatura',
        items: [
          { method: 'GET', route: '/assinatura', description: 'Assinatura, carteirinhas (titular + dependentes) e cobranças em aberto; null sem assinatura.', access: 'cliente' },
          { method: 'GET', route: '/cobrancas', description: 'Histórico de cobranças do associado.', access: 'cliente' },
          { method: 'POST', route: '/cobrancas/:id/segunda-via', description: 'Segunda via de Pix/boleto.', access: 'cliente' },
          { method: 'POST', route: '/cobrancas/:id/pagar', description: 'Paga a cobrança com outro cartão ou método.', access: 'cliente' },
        ],
      },
    ],
  },
  {
    title: 'Webhooks de pagamento',
    prefix: '/api/v1/webhooks',
    controllerRef: 'webhooksController',
    summary: 'Notificações do Asaas (header asaas-access-token). Token certo → sempre 200; o processamento é o handler único de eventos.',
    sections: [
      {
        heading: 'Asaas',
        items: [
          { method: 'POST', route: '/asaas', description: 'Eventos PAYMENT_* do Asaas, com dedupe pelo id do evento.', access: 'Asaas (token)' },
          { method: 'POST', route: '/asaas-plataforma', description: 'Eventos PAYMENT_* das cobranças da ANNETEC aos inquilinos (externalReference plt_…); o handler do clube ignora essas referências.', access: 'Asaas (token)' },
        ],
      },
    ],
  },
  {
    title: 'Atendimento',
    prefix: '/api/v1/t/:tenantSlug/atendimentos',
    controllerRef: 'supportController',
    summary:
      'Mesa de atendimento do clube: o chamado nasce e vive no nosso banco (protocolo da Digital Saúde guardado junto quando existir). Admin e vendedor veem a fila; o associado, só os próprios chamados, sem nota interna.',
    sections: [
      {
        heading: 'Chamados',
        items: [
          { method: 'GET', route: '/', description: 'Fila de chamados com a thread de mensagens.', access: 'admin · vendedor · cliente (só os seus)' },
          { method: 'POST', route: '/', description: 'Abre um chamado.', access: 'admin · vendedor · cliente' },
          { method: 'GET', route: '/:id', description: 'Chamado com a thread.', access: 'admin · vendedor · cliente (só os seus)' },
          { method: 'PATCH', route: '/:id', description: 'Atualiza situação, responsável ou prioridade.', access: 'admin · vendedor' },
          { method: 'POST', route: '/:id/mensagens', description: 'Responde na thread (nota interna só para a equipe).', access: 'admin · vendedor · cliente' },
          { method: 'DELETE', route: '/:id', description: 'Remove um chamado.', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Contratação da plataforma (público)',
    prefix: '/api/v1/public/contratacao',
    controllerRef: 'onboardingPublicController',
    summary:
      'Jornada B2B de uma suboperadora no site: plano por vidas, dados cadastrais com a Receita, pessoas, documentos (KYB), marca, contrato e pagamento. O candidato não tem conta: as rotas por proposta exigem ?chave= (HMAC da proposta); chave errada responde 404.',
    sections: [
      {
        heading: 'Início',
        items: [
          { method: 'GET', route: '/planos', description: 'Planos ANNETEC visíveis na vitrine, com preço completo (adesão, vida extra, split).', access: 'público' },
          { method: 'GET', route: '/cnpj/:cnpj', description: 'Consulta a Receita (BrasilAPI ou simulada); indisponível não é erro — o formulário segue manual.', access: 'público (30/min/IP)' },
          { method: 'GET', route: '/slug-disponivel?slug=', description: 'Endereço do site livre? Com motivo e sugestões.', access: 'público' },
          { method: 'POST', route: '/propostas', description: 'Cria a proposta e devolve o link de acompanhamento com a chave (409 se o CNPJ já tem proposta aberta ou já é inquilino).', access: 'público (5/h/IP)' },
          { method: 'POST', route: '/propostas/recuperar-acesso', description: 'Reenvia o link de acompanhamento por e-mail; responde sempre { sent: true }.', access: 'público' },
        ],
      },
      {
        heading: 'Proposta',
        items: [
          { method: 'GET', route: '/propostas/:id?chave=', description: 'Visão do candidato (wizard e acompanhamento); sincroniza a cobrança de ativação.', access: 'público (com chave)' },
          { method: 'PUT', route: '/propostas/:id/plano?chave=', description: 'Plano e vidas previstas.', access: 'público (com chave)' },
          { method: 'PUT', route: '/propostas/:id/empresa?chave=', description: 'Dados cadastrais e contatos.', access: 'público (com chave)' },
          { method: 'PUT', route: '/propostas/:id/pessoas?chave=', description: 'Representantes, sócios e beneficiários finais (substitui a lista).', access: 'público (com chave)' },
          { method: 'PUT', route: '/propostas/:id/marca?chave=', description: 'Nome do clube, endereço do site, cores, logo e administrador.', access: 'público (com chave)' },
          { method: 'PUT', route: '/propostas/:id/pagamento?chave=', description: 'Forma de pagamento da ativação e da recorrência.', access: 'público (com chave)' },
          { method: 'POST', route: '/propostas/:id/documentos?chave=', description: 'Upload multipart de documento KYB (PDF/JPEG/PNG até 4 MB, validado por magic bytes).', access: 'público (com chave)' },
          { method: 'DELETE', route: '/propostas/:id/documentos/:docId?chave=', description: 'Remove documento enviado ou recusado.', access: 'público (com chave)' },
          { method: 'GET', route: '/propostas/:id/documentos/:docId/arquivo?chave=', description: 'Arquivo do documento, inline.', access: 'público (com chave)' },
          { method: 'POST', route: '/propostas/:id/logo?chave=', description: 'Logo PNG/JPEG até 1 MB, servido depois em /public/arquivos.', access: 'público (com chave)' },
          { method: 'POST', route: '/propostas/:id/aceite?chave=', description: 'Aceite eletrônico dos termos e do DPA (hash, IP e user-agent).', access: 'público (com chave)' },
          { method: 'POST', route: '/propostas/:id/enviar?chave=', description: 'Envia para análise e roda as pré-checagens (422 com o que falta).', access: 'público (com chave)' },
          { method: 'POST', route: '/propostas/:id/cancelar?chave=', description: 'Desistência do candidato.', access: 'público (com chave)' },
        ],
      },
    ],
  },
  {
    title: 'Arquivos públicos',
    prefix: '/api/v1/public/arquivos',
    controllerRef: 'publicFilesController',
    summary: 'Arquivos marcados como públicos (logos das marcas), com cache de 1 dia. Documentos KYB nunca passam por aqui.',
    sections: [
      {
        heading: 'Arquivos',
        items: [
          { method: 'GET', route: '/:fileId', description: 'Binário do arquivo público.', access: 'público' },
        ],
      },
    ],
  },
  {
    title: 'Plataforma — Compliance (contratação)',
    prefix: '/api/v1/platform/onboarding',
    controllerRef: 'onboardingPlatformController',
    summary:
      'Console de análise cadastral (KYB): fila com SLA de 48 h, pré-checagens automáticas, checklist, revisão de documentos, pendências e decisão. Aprovar emite a cobrança de ativação; o pagamento provisiona o clube sozinho.',
    sections: [
      {
        heading: 'Fila',
        items: [
          { method: 'GET', route: '/propostas', description: 'Propostas por grupo, situação, pré-checagem, responsável e tipo; busca por nome, CNPJ ou protocolo.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/propostas/resumo', description: 'Contagens da fila: por situação, sem responsável, SLA estourado, aguardando pagamento, ativadas no mês.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/propostas/:id', description: 'Detalhe completo: pré-checagens, checklist, documentos, eventos internos e e-mails.', access: 'superadmin · platform_admin' },
        ],
      },
      {
        heading: 'Análise e decisão',
        items: [
          { method: 'POST', route: '/propostas/:id/assumir', description: 'O analista assume a proposta (submitted → in_review).', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/prechecagens', description: 'Reexecuta as pré-checagens automáticas.', access: 'superadmin · platform_admin' },
          { method: 'PATCH', route: '/propostas/:id/checklist', description: 'Marca/desmarca itens do checklist de compliance, com nota.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/documentos/:docId/revisao', description: 'Aprova ou recusa (com motivo) um documento.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/propostas/:id/documentos/:docId/arquivo', description: 'Arquivo do documento para o visualizador (a web repassa por proxy, sem expor o token).', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/pendencias', description: 'Pede pendência com itens; a proposta volta para o contratante e ele recebe e-mail.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/aprovar', description: 'Aprova (422 com bloqueante/checklist incompleto, salvo override com motivo) e emite a cobrança de ativação.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/reprovar', description: 'Reprova com motivo (final).', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/cancelar', description: 'Cancela proposta não final; cobrança de ativação aberta é cancelada.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/notas', description: 'Nota interna na linha do tempo.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/cobranca-ativacao', description: 'Emite (de novo) a cobrança de ativação quando o gateway falhou na aprovação.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/propostas/:id/provisionar', description: 'Provisiona manualmente: retentativa após falha ou ativação isenta com justificativa.', access: 'superadmin' },
        ],
      },
    ],
  },
  {
    title: 'Plataforma — Caixa de saída',
    prefix: '/api/v1/platform/emails',
    controllerRef: 'platformEmailsController',
    summary:
      'Todo e-mail transacional da plataforma é gravado aqui. Com EMAIL_PROVIDER=outbox (padrão da demonstração) é o único canal; com Resend/SendGrid, segredos saem mascarados.',
    sections: [
      {
        heading: 'E-mails',
        items: [
          { method: 'GET', route: '/', description: 'Lista com filtro por modelo, situação, proposta e inquilino; busca por destinatário e assunto.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/:id', description: 'E-mail completo (texto e HTML).', access: 'superadmin · platform_admin' },
        ],
      },
    ],
  },
  {
    title: 'Plataforma — Faturamento',
    prefix: '/api/v1/platform/billing',
    controllerRef: 'platformBillingController',
    summary:
      'Cobrança da ANNETEC aos inquilinos gerenciados: assinaturas de plataforma, faturas (ativação e mensal com excedente), régua que restringe e bloqueia o painel da equipe (nunca os associados) e automação.',
    sections: [
      {
        heading: 'Painel e régua',
        items: [
          { method: 'GET', route: '/resumo', description: 'MRR, recebido e a receber no mês, inadimplência, carteira pela régua e 6 meses.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/eventos', description: 'Linha do tempo de eventos (webhook, automação, contratação, manual, simulação, inquilino).', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/configuracoes', description: 'Régua da plataforma, gateway efetivo, automação e ferramentas de demonstração.', access: 'superadmin · platform_admin' },
          { method: 'PATCH', route: '/configuracoes', description: 'Altera a régua (valida restrição < suspensão < cancelamento).', access: 'superadmin' },
          { method: 'POST', route: '/automacao/executar', description: 'Roda a automação agora e devolve o relatório.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/precos', description: 'Planos ANNETEC com o preço comercial completo.', access: 'superadmin · platform_admin' },
          { method: 'PUT', route: '/precos/:planId', description: 'Adesão, vida extra, split e vitrine de um plano.', access: 'superadmin' },
        ],
      },
      {
        heading: 'Assinaturas de plataforma',
        items: [
          { method: 'GET', route: '/assinaturas', description: 'Uma por inquilino gerenciado, com vidas, uso, em aberto e acesso efetivo.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/assinaturas/:id', description: 'Assinatura com faturas e linha do tempo.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/assinaturas/:id/plano', description: 'Upgrade na hora (proporcional na próxima fatura) ou downgrade agendado.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/assinaturas/:id/reativar', description: 'Reabre assinatura cancelada.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/assinaturas/:id/cancelar', description: 'Cancela a assinatura (o inquilino nunca é cancelado automaticamente).', access: 'superadmin' },
          { method: 'POST', route: '/assinaturas/:id/demo/avancar-dias', description: 'Demonstração: recua as datas N dias e roda a automação (422 sem as ferramentas de demo).', access: 'superadmin' },
        ],
      },
      {
        heading: 'Faturas',
        items: [
          { method: 'GET', route: '/faturas', description: 'Faturas com filtro por situação, tipo, forma, vencimento, inquilino e assinatura.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/faturas/:id', description: 'Fatura com itens, assinatura e linha do tempo.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/faturas/:id/segunda-via', description: 'Novo vencimento (e troca Pix↔boleto).', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/faturas/:id/baixa-manual', description: 'Registra pagamento recebido fora do gateway.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/faturas/:id/cancelar', description: 'Cancela fatura em aberto.', access: 'superadmin · platform_admin' },
          { method: 'POST', route: '/faturas/:id/simular-pagamento', description: 'Confirma o pagamento no gateway simulado/sandbox.', access: 'superadmin · platform_admin' },
        ],
      },
    ],
  },
  {
    title: 'Plataforma — Holding',
    prefix: '/api/v1/platform/holding',
    controllerRef: 'holdingController',
    summary:
      'Visão consolidada de todos os inquilinos, calculada na leitura (cache de 60 s; ?fresh=1 ignora): receita da plataforma, GMV, vidas, churn e inadimplência em 2 níveis, saúde, alertas, coortes e controle do ciclo de vida.',
    sections: [
      {
        heading: 'Inteligência',
        items: [
          { method: 'GET', route: '/visao-geral?meses=&fresh=', description: 'KPIs, séries mensais, distribuição de saúde e principais alertas.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/inquilinos', description: 'Inquilinos com nota de saúde, uso, tendência e alertas; filtros e ordenação.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/inquilinos/:orgId', description: 'Detalhe do inquilino: séries, fatores da nota, alertas, assinatura e auditoria recente.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/alertas', description: 'Alertas ativos (limite de vidas, inadimplência, queda de vendas, propostas paradas).', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/coortes?nivel=', description: 'Retenção por coorte de inquilinos ou de associados.', access: 'superadmin · platform_admin' },
          { method: 'GET', route: '/auditoria', description: 'Trilha de auditoria com filtros.', access: 'superadmin · platform_admin' },
        ],
      },
      {
        heading: 'Controle',
        items: [
          { method: 'POST', route: '/inquilinos/:orgId/ciclo-de-vida', description: 'Restringir, suspender, reativar (com prazo) ou voltar à régua; 422 para inquilino não gerenciado.', access: 'superadmin' },
        ],
      },
    ],
  },
  {
    title: 'Fatura ANNETEC (pública)',
    prefix: '/api/v1/public/faturas-annetec',
    controllerRef: 'platformPublicInvoiceController',
    summary:
      'Página pública de pagamento das faturas da plataforma (ativação e mensalidades) — o link dos e-mails. Exige ?chave= (HMAC da cobrança) e funciona com o painel do inquilino bloqueado.',
    sections: [
      {
        heading: 'Fatura',
        items: [
          { method: 'GET', route: '/:chargeId?chave=', description: 'Fatura com Pix/boleto/cartão; sincroniza com o gateway antes.', access: 'público (com chave)' },
          { method: 'POST', route: '/:chargeId/pagar?chave=', description: 'Paga com o método escolhido (cartão digitado aqui).', access: 'público (com chave)' },
          { method: 'POST', route: '/:chargeId/simular?chave=', description: 'Simula o pagamento (422 fora do simulado/sandbox).', access: 'público (com chave)' },
        ],
      },
    ],
  },
  {
    title: 'Minha assinatura ANNETEC',
    prefix: '/api/v1/t/:tenantSlug/assinatura-annetec',
    controllerRef: 'tenantPlatformSubscriptionController',
    summary:
      'O que o inquilino vê da própria assinatura de plataforma. Passa sempre pelo guard de restrição — é o caminho para pagar e sair do bloqueio. Inquilino não gerenciado recebe managed: false.',
    sections: [
      {
        heading: 'Assinatura',
        items: [
          { method: 'GET', route: '/', description: 'Plano, uso de vidas, próxima fatura, abertas, histórico e opções de upgrade.', access: 'admin' },
          { method: 'GET', route: '/acesso', description: 'Nível de acesso do painel e a frase do banner (atraso, somente leitura, bloqueio).', access: 'admin · vendedor' },
          { method: 'GET', route: '/faturas', description: 'Faturas da ANNETEC para o inquilino.', access: 'admin' },
          { method: 'GET', route: '/faturas/:chargeId', description: 'Fatura com itens e linha do tempo.', access: 'admin' },
          { method: 'POST', route: '/faturas/:chargeId/segunda-via', description: 'Segunda via de Pix/boleto.', access: 'admin' },
          { method: 'POST', route: '/plano', description: 'Troca de plano pelo próprio inquilino (422 se o acesso não é completo).', access: 'admin' },
        ],
      },
    ],
  },
  {
    title: 'Infraestrutura',
    prefix: '/',
    controllerRef: 'healthController',
    summary: 'Sondas de saúde do processo — o que o balanceador usa para decidir se manda tráfego.',
    sections: [
      {
        heading: 'Sondas',
        items: [
          { method: 'GET', route: '/healthz', description: 'Liveness — não toca em nada, só confirma que o processo está de pé.', access: 'público' },
          { method: 'GET', route: '/readyz', description: 'Readiness — confirma que o banco responde, com a latência da checagem.', access: 'público' },
        ],
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Digital Saúde — API do ERP externo (digitalsaude.com.br/api/v2)
//
// Autenticação por dois headers (token + senhaApi), um par por inquilino.
// Toda resposta de sucesso é um array, mesmo em busca por chave única.
// ---------------------------------------------------------------------------
export const digitalSaudeModules: ApiModule[] = [
  {
    title: 'Contrato e Adesão',
    prefix: '/contrato',
    summary:
      'O recurso central do ERP. É de onde vem a adesão, o status do associado e a validação de identidade do portal do cliente — a Annetec nunca guarda senha do associado, valida o CPF+e-mail aqui a cada login.',
    sections: [
      {
        heading: 'Consulta',
        items: [
          {
            method: 'GET',
            route: '/procurarPorClientePortal',
            description: 'Contratos por CPF + e-mail. Base do login do portal do associado — validado ao vivo, sem senha local.',
            access: 'adaptável',
          },
          {
            method: 'GET',
            route: '/procurarPorCpfTitular',
            description: 'Contratos só por CPF. O próprio Swagger marca como uso de central telefônica — restrito a admin.',
            access: 'adaptável',
          },
          { method: 'GET', route: '/{codigoContrato}', description: 'Detalhe de um contrato — atualiza o espelho local sob demanda.', access: 'adaptável' },
        ],
      },
      {
        heading: 'Ciclo de vida',
        items: [
          { method: 'POST', route: '/', description: 'Cria a adesão com status Produzido — grupo/filial/convênio vêm da configuração do inquilino.', access: 'adaptável' },
          { method: 'GET', route: '/retornarContratoParaProduzido', description: 'Muda o status de Pendente para Produzido.', access: 'reutilizável' },
          { method: 'GET', route: '/enviarCarteiraPorContrato', description: 'Dispara e-mail com o link da carteirinha provisória.', access: 'reutilizável' },
        ],
      },
    ],
  },
  {
    title: 'Documentos e Saúde',
    prefix: '/',
    summary: 'Anexos, declaração de saúde e pendências — expostos quase 1:1, só reempacotados no envelope padrão da API.',
    sections: [
      {
        heading: 'Recursos',
        items: [
          { method: 'POST', route: '/anexo/', description: 'Anexa um documento (URL pública) a um contrato existente.', access: 'reutilizável' },
          { method: 'POST', route: '/patologia/', description: 'Registra declaração de saúde / CID de um beneficiário (questionário de carência).', access: 'reutilizável' },
          { method: 'POST', route: '/pendencia/', description: 'Abre uma pendência documental ou cadastral vinculada a um contrato.', access: 'reutilizável' },
        ],
      },
    ],
  },
  {
    title: 'Catálogo (Convênio, Plano, Carência, Tabela, Cálculo)',
    prefix: '/',
    summary: 'Dados comerciais que alimentam a tela de vendas. Convênios, planos, carências e tabelas mudam pouco — cacheados em upstream_cache; cotação nunca.',
    sections: [
      {
        heading: 'Convênios e Planos',
        items: [
          { method: 'GET', route: '/convenio/', description: 'Convênios ativos da administradora.', access: 'reutilizável' },
          { method: 'GET', route: '/convenio/{codigoConvenio}', description: 'Detalhe de um convênio, com taxa de cadastro e filiais.', access: 'reutilizável' },
          { method: 'GET', route: '/plano/procurarPorProduto', description: 'Planos de saúde de um produto.', access: 'reutilizável' },
          { method: 'GET', route: '/plano/{codigoPlano}', description: 'Detalhe de um plano (produto, operadora, acomodação).', access: 'reutilizável' },
        ],
      },
      {
        heading: 'Carências e Tabelas de Preço',
        items: [
          { method: 'GET', route: '/carencia/procurarPorConvenio', description: 'Carências aplicáveis a um convênio.', access: 'reutilizável' },
          { method: 'GET', route: '/carencia/{codigoCarencia}', description: 'Detalhe de uma carência específica.', access: 'disponível' },
          { method: 'GET', route: '/tabela/procurarPorConvenio', description: 'Tabelas de preço de um convênio.', access: 'reutilizável' },
          { method: 'GET', route: '/tabela/{codigoTabela}', description: 'Detalhe de uma tabela de preço por faixa etária.', access: 'reutilizável' },
        ],
      },
      {
        heading: 'Cotação',
        items: [
          {
            method: 'POST',
            route: '/calculo/',
            description: 'Simula preço por idade e UF — base da cotação do vendedor. Nunca cacheado: preço velho é preço errado.',
            access: 'adaptável',
          },
        ],
      },
    ],
  },
  {
    title: 'Financeiro (Fatura, Demonstrativo, Recibo)',
    prefix: '/',
    summary: 'Nada aqui é persistido pela Annetec — sempre lido do ERP na hora. O recibo de comissão exige login+senha do produtor em query string; a Annetec nunca expõe isso ao cliente.',
    sections: [
      {
        heading: 'Faturas',
        items: [
          {
            method: 'GET',
            route: '/fatura/procurarPorContrato',
            description: 'Faturas de um contrato por status — a Annetec varre os status conhecidos quando não recebe um id específico.',
            access: 'adaptável',
          },
          { method: 'GET', route: '/fatura/{codigoFatura}', description: 'Detalhe de uma fatura, com linha digitável e link do boleto.', access: 'reutilizável' },
          { method: 'GET', route: '/fatura/procurarPorVencida', description: 'Faturas vencidas de toda a carteira — visão de cobrança do admin.', access: 'adaptável' },
          { method: 'GET', route: '/fatura/enviarFaturaVencidaPorContrato', description: 'Dispara e-mail de cobrança das faturas vencidas.', access: 'reutilizável' },
        ],
      },
      {
        heading: 'Demonstrativos e Recibos',
        items: [
          { method: 'GET', route: '/demonstrativoPagamento/procurarPorContrato', description: 'Demonstrativos de pagamento (IR) de um contrato.', access: 'reutilizável' },
          { method: 'GET', route: '/demonstrativoPagamento/{codigo}', description: 'Detalhe de um demonstrativo.', access: 'reutilizável' },
          {
            method: 'GET',
            route: '/recibo/procurarPorEmitido',
            description: 'Recibos de comissão emitidos. Exige login+senha do produtor — credenciais cifradas no perfil do vendedor.',
            access: 'adaptável',
          },
          { method: 'GET', route: '/recibo/procurarPorPago', description: 'Recibos de comissão pagos. Mesma exigência de credencial.', access: 'adaptável' },
          { method: 'GET', route: '/recibo/{codigoRecibo}', description: 'Detalhe de um recibo, com os lançamentos.', access: 'reutilizável' },
        ],
      },
    ],
  },
  {
    title: 'Produtor (Vendedor no ERP)',
    prefix: '/produtor',
    summary: 'Cadastro do vendedor dentro do ERP — é o que o comissionamento e a adesão referenciam pelo código.',
    sections: [
      {
        heading: 'Recursos',
        items: [
          { method: 'GET', route: '/{codigoProdutor}', description: 'Confere um produtor antes de vincular a um vendedor Annetec.', access: 'adaptável' },
          { method: 'POST', route: '/', description: 'Cria o produtor no ERP e já vincula ao vendedor da plataforma.', access: 'adaptável' },
          { method: 'GET', route: '/procurarPorNumeroDocumento', description: 'Busca produtor por CPF/CNPJ.', access: 'disponível' },
          { method: 'GET', route: '/procurarPorLogin', description: 'Busca produtor pelo login cadastrado no ERP.', access: 'disponível' },
        ],
      },
    ],
  },
  {
    title: 'Atendimento e Notificação',
    prefix: '/',
    summary: 'Teleorientação e mensageria do ERP. Mapeados e disponíveis; ainda não consumidos por nenhuma tela — entram quando o módulo de suporte usar o ERP diretamente.',
    sections: [
      {
        heading: 'Recursos',
        items: [
          { method: 'GET', route: '/atendimento/procurarPorContrato', description: 'Atendimentos/teleorientação de um contrato por tipo.', access: 'disponível' },
          { method: 'GET', route: '/atendimento/{protocolo}', description: 'Detalhe de um atendimento pelo protocolo.', access: 'disponível' },
          { method: 'POST', route: '/notificacao/', description: 'Envia notificação para um usuário do sistema do ERP.', access: 'disponível' },
        ],
      },
    ],
  },
]
