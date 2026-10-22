import {
  Building2,
  ClipboardList,
  CreditCard,
  FlaskConical,
  HandCoins,
  Headset,
  HeartHandshake,
  IdCard,
  LockKeyhole,
  Pill,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  TrendingUp,
  UserRoundCheck,
  Users,
  type LucideIcon,
} from 'lucide-react'

/**
 * Todo o texto da vitrine do inquilino, num lugar só.
 *
 * O padrão vale para qualquer inquilino: o nome e os contatos dele entram por
 * interpolação, e números (desconto, parceiros, cidades, preço) vêm SEMPRE dos
 * dados reais — este arquivo não contém nenhum. Para ajustar a copy de um
 * inquilino específico sem mexer no padrão, use `CONTENT_OVERRIDES` no fim do
 * arquivo (chave = slug).
 *
 * Regras de copy: nunca apresentar o clube como plano de saúde nem prometer
 * cobertura; nada de avaliação, contador ou escassez inventados.
 */

export interface ContentContext {
  /** Nome comercial do inquilino ("MapCard"). */
  nome: string
  telefone?: string
  email?: string
  /** O clube tem teleorientação/telemedicina entre os benefícios cadastrados. */
  temTeleorientacao: boolean
}

export interface IconItem {
  icon: LucideIcon
  title: string
  text: string
}

export interface FaqItem {
  question: string
  answer: string
}

export interface Testimonial {
  name: string
  context: string
  quote: string
}

/** Liga/desliga seções inteiras da vitrine. */
export const SITE_FLAGS = {
  /**
   * Depoimentos reais (ver `testimonials` abaixo). Só ligue com `true` depois
   * de o inquilino enviar depoimentos, com autorização de quem falou.
   */
  showTestimonials: false,
  showSavingsSimulator: true,
}

export function buildSiteContent(ctx: ContentContext) {
  const { nome } = ctx
  const extras = ctx.temTeleorientacao ? ', teleorientação' : ''
  const contato = [ctx.telefone && `telefone ${ctx.telefone}`, ctx.email && `e-mail ${ctx.email}`]
    .filter(Boolean)
    .join(' ou ')

  return {
    whatsappMessage: `Olá! Vim pelo site do ${nome} e quero saber mais sobre o clube de benefícios.`,
    whatsappBusinessMessage: `Olá! Quero uma proposta do ${nome} para os colaboradores da minha empresa.`,

    hero: {
      eyebrow: `Clube de Benefícios ${nome}`,
      title: 'Mais saúde para a sua família,',
      titleHighlight: 'menos peso no orçamento.',
      /** `categorias` e `desconto` vêm da rede credenciada real. */
      subtitle: (categorias: string, desconto: string | null) =>
        `${desconto ? `Descontos de até ${desconto}` : 'Descontos'} ${
          categorias ? `em ${categorias}` : 'na rede credenciada'
        }. ${
          ctx.temTeleorientacao ? 'Teleorientação e carteirinha digital' : 'Carteirinha digital'
        } para você e seus dependentes.`,
      primaryCta: 'Quero meu cartão',
      secondaryCta: 'Ver planos e preços',
      trust: [
        'Adesão 100% online em poucos minutos',
        'Pix, boleto ou cartão',
        'Carteirinha digital na hora',
      ],
    },

    pain: {
      eyebrow: 'Por que existe',
      title: 'Cuidar da saúde não deveria apertar o orçamento',
      description:
        'Quem paga tudo no particular conhece a conta: ela chega justamente quando a família mais precisa.',
      items: [
        {
          icon: Stethoscope,
          title: 'Consulta particular cara',
          text: 'Sem desconto, uma consulta fora de hora desequilibra o mês inteiro.',
        },
        {
          icon: FlaskConical,
          title: 'Exames que pesam no bolso',
          text: 'Check-up, laboratório e imagem somam rápido quando a família toda precisa.',
        },
        {
          icon: Pill,
          title: 'Farmácia todo mês',
          text: 'Remédio de uso contínuo vira uma conta fixa que não para de crescer.',
        },
      ] satisfies IconItem[],
      solutionTitle: `O ${nome} resolve isso`,
      solutionText: `Com uma mensalidade que cabe no orçamento, você tem descontos na rede credenciada${extras} e carteirinha digital para toda a família.`,
      solutionBullets: [
        'Desconto direto no atendimento do parceiro',
        'Carteirinha digital para você e cada dependente',
        'Adesão online, sem papelada',
      ],
    },

    howItWorks: {
      eyebrow: 'Como funciona',
      title: 'Em três passos você já está usando',
      steps: [
        {
          icon: ClipboardList,
          title: 'Escolha o plano',
          text: 'Compare os planos e fique com o que cabe no seu bolso.',
        },
        {
          icon: Users,
          title: 'Cadastre você e sua família',
          text: 'Adesão 100% online: seus dados, seus dependentes e o pagamento por Pix, boleto ou cartão.',
        },
        {
          icon: Smartphone,
          title: 'Use a carteirinha digital',
          text: 'Pagamento confirmado, carteirinha no celular. É só apresentar no parceiro e pagar menos.',
        },
      ] satisfies IconItem[],
    },

    benefits: {
      eyebrow: 'Benefícios',
      title: 'Tudo o que você ganha ao se associar',
      description: `Vantagens do ${nome} para você e para quem você ama.`,
      /** Usado quando o inquilino ainda não cadastrou benefícios nem parceiros. */
      fallback: [
        {
          icon: HandCoins,
          title: 'Descontos na rede credenciada',
          text: 'Pague menos em consultas, exames, farmácias e bem-estar nos parceiros do clube.',
        },
        {
          icon: IdCard,
          title: 'Carteirinha digital',
          text: 'Sempre no celular, para você e cada dependente, sem esperar cartão físico.',
        },
        {
          icon: HeartHandshake,
          title: 'Família incluída',
          text: 'Cadastre seus dependentes na adesão e cuide de todos com um único plano.',
        },
      ] satisfies IconItem[],
    },

    simulator: {
      eyebrow: 'Simulador',
      title: 'Quanto a sua família pode economizar?',
      description: 'Informe quanto vocês gastam por mês com saúde e farmácia e veja uma estimativa.',
      inputLabel: 'Gasto mensal com saúde e farmácia',
      cta: 'Quero economizar',
      disclaimer: (media: string) =>
        `Estimativa calculada com o desconto médio de ${media} dos parceiros ativos da rede credenciada. A economia real depende dos serviços e parceiros que você usar — não é garantia de desconto.`,
    },

    plans: {
      eyebrow: 'Planos',
      title: 'Escolha o plano ideal para você',
      description: 'Mensalidade sem surpresa. Assine online em poucos minutos.',
      highlightLabel: 'Mais escolhido',
      cta: 'Assinar agora',
      compareCta: 'Comparar coberturas e regras',
      emptyTitle: 'Planos em atualização',
      emptyText: 'Nossa equipe monta a melhor opção para você. Fale com um consultor e receba os valores.',
      emptyCta: 'Falar com um consultor',
    },

    network: {
      eyebrow: 'Rede credenciada',
      title: 'Parceiros perto de você',
      description: 'Apresente a carteirinha digital e o desconto é aplicado no atendimento.',
      cta: 'Ver rede credenciada completa',
      directoryCta: 'Assine para usar os descontos',
      conditions:
        'Descontos válidos para associados ativos, mediante apresentação da carteirinha digital. As condições de cada parceiro podem variar.',
    },

    testimonials: {
      eyebrow: 'Quem usa, aprova',
      title: 'Histórias de quem já economiza',
      /**
       * Exibido enquanto os depoimentos forem os de exemplo abaixo. Quando o
       * inquilino mandar depoimentos reais, troque `items` e zere este texto.
       */
      illustrativeNote: '',
      // Só depoimentos reais, com autorização por escrito. Nunca inventar nota ou estrelas.
      items: [] as Testimonial[],
    },

    guarantees: {
      eyebrow: 'Segurança',
      title: 'Contrate com tranquilidade',
      items: [
        {
          icon: ShieldCheck,
          title: 'Pagamento seguro',
          text: 'Pix, boleto ou cartão processados em ambiente seguro e criptografado.',
        },
        {
          icon: LockKeyhole,
          title: 'Dados protegidos',
          text: 'Seus dados são tratados conforme a LGPD, só para prestar o serviço contratado.',
        },
        {
          icon: RotateCcw,
          title: 'Cancelamento simples',
          text: 'Mudou de ideia? Fale com a nossa equipe e cancelamos sem burocracia.',
        },
        {
          icon: Headset,
          title: 'Atendimento de verdade',
          text: 'Gente de verdade para tirar suas dúvidas por telefone, e-mail ou WhatsApp.',
        },
      ] satisfies IconItem[],
    },

    faq: {
      eyebrow: 'Dúvidas',
      title: 'Perguntas frequentes',
      items: [
        {
          question: `O que é o ${nome}?`,
          answer: `É um clube de benefícios. Com uma mensalidade, você e sua família têm descontos na rede credenciada${extras} e carteirinha digital, além dos benefícios incluídos no plano escolhido.`,
        },
        {
          question: 'É plano de saúde?',
          answer: `Não. O ${nome} é um clube de benefícios com descontos na rede credenciada. Não é plano de saúde: não oferece cobertura de procedimentos nem reembolso e não é regulado pela ANS. Você paga o atendimento direto ao parceiro, já com o desconto do clube.`,
        },
        {
          question: 'Como uso a carteirinha?',
          answer:
            'Depois da adesão, a carteirinha digital fica disponível na Área do cliente. Apresente-a no parceiro credenciado, pelo celular mesmo, e o desconto é aplicado no atendimento.',
        },
        {
          question: 'Posso incluir dependentes?',
          answer:
            'Sim. Você cadastra seus dependentes durante a adesão e cada um recebe a própria carteirinha digital. Cada plano informa quantos dependentes inclui e se há valor adicional por dependente.',
        },
        {
          question: 'Quais são as formas de pagamento?',
          answer: 'Cartão de crédito, Pix ou boleto bancário, conforme as formas aceitas em cada plano. Você escolhe na hora da adesão.',
        },
        {
          question: 'Quando começo a usar?',
          answer:
            'A carteirinha digital sai assim que o pagamento é confirmado: no cartão e no Pix, costuma levar minutos; no boleto, depois da compensação bancária, que pode levar até 3 dias úteis. Algumas coberturas têm carência, contada da ativação e informada em cada plano.',
        },
        {
          question: 'Como cancelo?',
          answer: `Quando quiser, pelos nossos canais de atendimento${contato ? `: ${contato}` : ''}, sem burocracia. Se o plano tiver fidelidade, as condições aparecem nele antes da contratação.`,
        },
      ] satisfies FaqItem[],
    },

    billingFaq: {
      title: 'Dúvidas sobre cobrança',
      items: [
        {
          question: 'Quais são as formas de pagamento?',
          answer: 'Cartão de crédito, Pix ou boleto bancário, conforme as formas aceitas em cada plano. Você escolhe na hora da adesão.',
        },
        {
          question: 'Quando vence a mensalidade?',
          answer:
            'A mensalidade é cobrada todo mês, com vencimento definido na adesão. No cartão de crédito a cobrança é automática; no Pix e no boleto, você paga a cada mês até a data de vencimento.',
        },
        {
          question: 'Como funcionam os dependentes?',
          answer:
            'Você cadastra os dependentes na adesão. Cada plano mostra se eles estão inclusos na mensalidade ou se há valor adicional por dependente, e se existe limite de dependentes.',
        },
        {
          question: 'Posso trocar de plano?',
          answer: 'Pode. Fale com a nossa equipe e ajudamos você a mudar para o plano que fizer mais sentido.',
        },
        {
          question: 'Como cancelo?',
          answer: `Quando quiser, pelos nossos canais de atendimento${contato ? `: ${contato}` : ''}, sem burocracia. Se o plano tiver fidelidade, as condições aparecem nele antes da contratação.`,
        },
      ] satisfies FaqItem[],
    },

    finalCta: {
      title: 'Comece hoje a pagar menos pela saúde da sua família',
      text: 'A adesão leva poucos minutos e, com o pagamento confirmado, a carteirinha digital já está no seu celular. Quanto antes você entra, antes a economia começa.',
      primary: 'Quero meu cartão',
      secondary: 'Falar com um consultor',
    },

    about: {
      eyebrow: 'Sobre nós',
      title: `Conheça o ${nome}`,
      description: `O ${nome} é um clube de benefícios que aproxima famílias de uma rede credenciada de saúde e bem-estar, com descontos reais e tudo na palma da mão.`,
      mission: `Tornar o cuidado com a saúde acessível para as famílias, com descontos reais em uma rede credenciada de confiança.`,
      values: [
        {
          icon: ShieldCheck,
          title: 'Transparência',
          text: 'Preço claro e regras simples. Você sabe exatamente o que está contratando.',
        },
        {
          icon: HeartHandshake,
          title: 'Cuidado',
          text: 'Atendimento próximo, de quem entende o que a sua família precisa.',
        },
        {
          icon: HandCoins,
          title: 'Acessibilidade',
          text: 'Benefícios que cabem no orçamento, para a família inteira.',
        },
        {
          icon: LockKeyhole,
          title: 'Segurança',
          text: 'Dados protegidos e pagamento em ambiente seguro.',
        },
      ] satisfies IconItem[],
      security: [
        {
          icon: LockKeyhole,
          title: 'Dados usados só para o serviço',
          text: 'Coletamos o necessário para a adesão, a carteirinha e o atendimento — nada além disso.',
        },
        {
          icon: CreditCard,
          title: 'Pagamento em ambiente seguro',
          text: 'As transações são processadas em ambiente criptografado.',
        },
        {
          icon: UserRoundCheck,
          title: 'Seus direitos pela LGPD',
          text: 'Peça acesso, correção ou exclusão dos seus dados pelos nossos canais de atendimento.',
        },
      ] satisfies IconItem[],
    },

    business: {
      eyebrow: 'Para empresas',
      title: 'Benefício de saúde que seus colaboradores usam de verdade',
      description: `Ofereça o ${nome} para a sua equipe: descontos na rede credenciada${extras} e carteirinha digital para o colaborador e a família, com custo por vida que cabe no orçamento do RH.`,
      primaryCta: 'Quero uma proposta',
      secondaryCta: 'Falar no WhatsApp',
      pains: [
        {
          icon: TrendingUp,
          title: 'Benefício caro',
          text: 'O custo por vida dos benefícios de saúde sobe todo ano e nem toda empresa consegue acompanhar.',
        },
        {
          icon: Users,
          title: 'Benefício que ninguém percebe',
          text: 'Vantagem que o colaborador não usa não ajuda a atrair nem a manter a equipe.',
        },
        {
          icon: ClipboardList,
          title: 'Gestão trabalhosa',
          text: 'Planilhas, inclusões e exclusões manuais tomam o tempo do RH.',
        },
      ] satisfies IconItem[],
      solutionTitle: `Com o ${nome}, o benefício aparece no dia a dia`,
      solutionBullets: [
        'Custo por vida acessível e previsível todo mês',
        'Carteirinha digital para o colaborador e os dependentes',
        'Descontos que a equipe usa em consultas, exames e farmácia',
        'Adesão online e atendimento dedicado ao RH',
      ],
      steps: [
        {
          icon: Building2,
          title: 'Conte sobre a empresa',
          text: 'Preencha o formulário com o número de colaboradores.',
        },
        {
          icon: ClipboardList,
          title: 'Receba a proposta',
          text: 'Um consultor monta a proposta pelo número de vidas.',
        },
        {
          icon: Users,
          title: 'Cadastre a equipe',
          text: 'Os colaboradores entram de forma online, com os dependentes.',
        },
        {
          icon: IdCard,
          title: 'Benefício em uso',
          text: 'Cada um recebe a carteirinha digital e já usa a rede credenciada.',
        },
      ] satisfies IconItem[],
      pricingTitle: 'Preço por vida sob consulta',
      pricingText:
        'O valor depende do número de colaboradores e do plano escolhido. Envie seus dados e receba uma proposta sem compromisso.',
      formTitle: 'Peça uma proposta para a sua empresa',
      formDescription: 'Um consultor retorna com a proposta. Sem compromisso.',
    },

    signup: {
      title: 'Fale com um consultor',
      description: `Deixe seus dados e a equipe do ${nome} entra em contato para tirar suas dúvidas e ajudar na escolha do plano.`,
      subjects: [
        'Quero me associar',
        'Quero ajuda para escolher um plano',
        'Quero incluir dependentes',
        'Quero ser afiliado ou consultor de vendas',
        'Outro assunto',
      ],
      submit: 'Quero ser contatado',
      successTitle: 'Recebemos seus dados!',
      successText: `A equipe do ${nome} vai entrar em contato em breve. Enquanto isso, conheça os planos.`,
      promises: [
        'Retorno da equipe em horário comercial.',
        'Seus dados são usados só para este atendimento, conforme a LGPD.',
      ],
    },

    legal: {
      disclaimer: 'Não é plano de saúde. Clube de benefícios com descontos na rede credenciada.',
      privacyNote: 'Ao enviar, você concorda em ser contatado sobre o clube. Seus dados são tratados conforme a LGPD.',
    },
  }
}

export type SiteContent = ReturnType<typeof buildSiteContent>

/**
 * Ajustes por inquilino, sem mexer no texto padrão. A chave é o slug; cada
 * seção informada substitui a padrão por inteiro. Exemplo:
 *
 *   mapcard2: { legal: { ...padrão, disclaimer: 'Texto aprovado pelo jurídico' } }
 */
export const CONTENT_OVERRIDES: Record<string, (base: SiteContent) => Partial<SiteContent>> = {}

export function siteContentFor(slug: string, ctx: ContentContext): SiteContent {
  const base = buildSiteContent(ctx)
  const override = CONTENT_OVERRIDES[slug]
  return override ? { ...base, ...override(base) } : base
}
