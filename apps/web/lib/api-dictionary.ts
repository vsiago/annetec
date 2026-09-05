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
              'Autentica por e-mail e senha. Sem tenantSlug, autentica a equipe Annetec (scope platform); com tenantSlug, autentica admin ou vendedor daquele inquilino.',
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
