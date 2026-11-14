'use client'

import { BarChart3, FileCheck2, Handshake, KeyRound, UserPlus, Wallet, type LucideIcon } from 'lucide-react'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { cn } from '@/lib/utils'
import type { Escopo } from './escopo'
import { StartForm } from './start-form'

const VANTAGENS: { icon: LucideIcon; titulo: string; texto: string }[] = [
  {
    icon: Wallet,
    titulo: 'Comissão por venda',
    texto: 'Comissão sobre as primeiras mensalidades de cada venda, acompanhada no seu painel.',
  },
  {
    icon: BarChart3,
    titulo: 'Painel completo',
    texto: 'Painel com funil, carteira e resultados, para você saber o que está vendendo e o que falta fechar.',
  },
  {
    icon: Handshake,
    titulo: 'Sem vínculo empregatício',
    texto: 'Atue como pessoa física ou jurídica, no seu ritmo e com seus próprios horários.',
  },
]

const PASSOS: { icon: LucideIcon; titulo: string; texto: string }[] = [
  { icon: UserPlus, titulo: 'Cadastre-se', texto: 'Informe seus dados básicos e escolha como quer atuar.' },
  { icon: FileCheck2, titulo: 'Envie documentos', texto: 'Complete o cadastro, anexe os documentos e aceite o termo de parceria.' },
  { icon: KeyRound, titulo: 'Aprovação e acesso', texto: 'Nossa equipe analisa e, aprovado, você recebe o acesso ao painel por e-mail.' },
]

const FAQ = [
  {
    pergunta: 'Preciso ter CNPJ?',
    resposta: 'Não. Você pode se candidatar como pessoa física. Apenas a atuação como corretora parceira exige pessoa jurídica.',
  },
  {
    pergunta: 'Quanto tempo leva a análise?',
    resposta: 'Depois que você envia a candidatura completa, nossa equipe analisa e responde por e-mail. Você acompanha o andamento pelo seu link.',
  },
  {
    pergunta: 'Como funciona a comissão?',
    resposta: 'Segue as regras comerciais vigentes, calculada sobre os pagamentos efetivamente recebidos. Os detalhes aparecem no termo de parceria, antes do envio.',
  },
  {
    pergunta: 'Posso continuar a candidatura depois?',
    resposta: 'Sim. Seu rascunho fica salvo no link de acompanhamento. Se perder o link, use "Recuperar acesso" com o e-mail cadastrado.',
  },
]

/** Página "Seja um parceiro comercial": vantagens, passos, formulário de início e dúvidas. */
export function Landing({ escopo, marca }: { escopo: Escopo; marca: string }) {
  const platform = escopo.kind === 'platform'
  return (
    <>
      <section className="relative overflow-hidden bg-gradient-to-b from-accent to-white">
        <div className={cn('mx-auto w-full max-w-6xl px-4 pb-12 sm:px-6 sm:pb-16 lg:px-8', platform ? 'pt-32 lg:pt-40' : 'pt-12 sm:pt-16')}>
          <div className="max-w-3xl">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-primary">Rede comercial</p>
            <h1 className="text-balance text-4xl font-bold leading-tight text-foreground sm:text-5xl">
              Seja um parceiro comercial {marca}
            </h1>
            <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
              Venda planos e benefícios {marca}, acompanhe suas vendas em um painel próprio e seja remunerado por cada
              cliente que você trouxer. Candidate-se em poucos minutos.
            </p>
          </div>
          <ul className="mt-10 grid gap-4 md:grid-cols-3">
            {VANTAGENS.map(item => (
              <li key={item.titulo} className="rounded-2xl border bg-card p-5 shadow-sm">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="size-5" aria-hidden />
                </span>
                <h2 className="mt-3 text-base font-semibold text-foreground">{item.titulo}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{item.texto}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="bg-white py-14 sm:py-16">
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
          <h2 id="como-funciona" className="text-2xl font-bold text-foreground sm:text-3xl">
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-6 md:grid-cols-3">
            {PASSOS.map((passo, index) => (
              <li key={passo.titulo} className="flex gap-4">
                <span
                  className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-base font-bold text-primary-foreground"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="flex items-center gap-2 font-semibold text-foreground">
                    <passo.icon className="size-4 text-primary" aria-hidden />
                    {passo.titulo}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{passo.texto}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="candidatar" aria-labelledby="candidatar-titulo" className="scroll-mt-20 bg-accent/50 py-14 sm:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 id="candidatar-titulo" className="text-2xl font-bold text-foreground sm:text-3xl">
            Comece sua candidatura
          </h2>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            São só os dados iniciais. Endereço, documentos e aceite do termo ficam para a próxima etapa.
          </p>
          <div className="mt-6 rounded-3xl border bg-card p-5 shadow-sm sm:p-8">
            <StartForm escopo={escopo} variant="page" />
          </div>
        </div>
      </section>

      <section aria-labelledby="parceiro-faq" className="bg-white py-14 sm:py-16">
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
          <h2 id="parceiro-faq" className="text-2xl font-bold text-foreground sm:text-3xl">
            Dúvidas frequentes
          </h2>
          <Accordion type="single" collapsible className="mt-6 rounded-2xl bg-white px-5 ring-1 ring-border/60">
            {FAQ.map((item, index) => (
              <AccordionItem key={item.pergunta} value={`faq-${index}`}>
                <AccordionTrigger className="py-4 text-left text-base font-semibold hover:no-underline">
                  {item.pergunta}
                </AccordionTrigger>
                <AccordionContent className="pb-4 text-[15px] leading-relaxed text-muted-foreground">
                  {item.resposta}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </>
  )
}
