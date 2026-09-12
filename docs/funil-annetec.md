# Funil Annetec

Dois funis encaixados: **a Annetec vende o clube, o clube vende o plano.**

- **Funil do clube**: uma administradora contrata a Annetec e ganha o próprio clube de benefícios (vira inquilina da plataforma).
- **Funil do associado**: dentro de cada clube, uma pessoa se cadastra, escolhe o plano e vira associada. A venda direta da Annetec usa esse mesmo funil — a própria Annetec funciona como um clube.

Legenda das cores: **coral** = momento em que vira cliente · **amarelo tracejado** = vaza hoje · **cinza tracejado** = manual, fora do sistema.

Para editar e compartilhar: cole qualquer bloco abaixo em <https://mermaid.live> (grátis, sem login). O botão **Share** gera um link que já carrega o código. O GitHub também desenha estes blocos direto no arquivo `.md`.

## Fluxo

```mermaid
flowchart TD
  subgraph SITE["Site da Annetec · portas de entrada"]
    P1["Crie seu cartão"]
    P2["Para você"]
    P3["Para entidades"]
  end

  subgraph FA["Funil do clube · administradora vira inquilina"]
    A1["Atração<br/>pede contato no site"]
    A2["Diagnóstico<br/>reunião com a Annetec"]
    A3["Proposta<br/>escolhe o plano de assinatura"]
    A4["Clube criado<br/>30 dias de teste"]
    A5["Integração<br/>conecta o ERP Digital Saúde"]
    A6["Montagem<br/>vendedores, parceiros e planos"]
    A7(["Clube no ar<br/>VIRA CLIENTE"])
    A8["Crescimento<br/>upgrade ou cancelamento"]
    A1 --> A2 --> A3 --> A4 --> A5 --> A6 --> A7 --> A8
  end

  subgraph FB["Funil do associado · pessoa vira associada"]
    B1["Visita<br/>site do clube"]
    B2["Cadastro<br/>vira lead"]
    B3["Atendimento<br/>vendedor entra em contato"]
    B4["Escolha<br/>convênio e plano"]
    B5(["Adesão<br/>VIRA CLIENTE"])
    B6["Ativação<br/>contrato ativo e carteirinha"]
    B7["Primeiro acesso<br/>entra no portal"]
    B8["Uso<br/>carteirinha, dependentes, benefícios"]
    B9["Mensalidade<br/>paga a fatura"]
    B10["Retenção<br/>fica, suspende ou cancela"]
    B1 --> B2 --> B3 --> B4 --> B5 --> B6 --> B7 --> B8 --> B9 --> B10
    B9 -. todo mês .-> B8
  end

  P1 --> A1
  P2 -->|Annetec é o clube| B1
  P3 -->|convênio| B2
  A7 ==>|abre o funil do associado| B1

  classDef win fill:#e84364,stroke:#e84364,color:#ffffff,font-weight:bold
  classDef gap fill:#fdf3e1,stroke:#b06a00,stroke-dasharray:5 4
  classDef manual fill:#ffffff,stroke:#68748d,stroke-dasharray:5 4
  class A7,B5 win
  class A1,B4 gap
  class A2,A3 manual
```

## Mapa mental

```mermaid
mindmap
  root((Funil Annetec))
    Portas de entrada
      Crie seu cartão → funil do clube
      Para você → funil do associado
      Para entidades → funil do associado por convênio
    Funil do clube
      Atração · pede contato no site
      Diagnóstico · reunião com a Annetec
      Proposta · escolhe o plano de assinatura
      Clube criado · 30 dias de teste
      Integração · conecta o ERP Digital Saúde
      Montagem · vendedores, parceiros e planos
      Clube no ar · VIRA CLIENTE
      Crescimento · upgrade ou cancelamento
    Funil do associado
      Visita ao site do clube
      Cadastro · vira lead
      Atendimento · vendedor entra em contato
      Escolha · convênio e plano
      Adesão · VIRA CLIENTE
      Ativação · contrato ativo e carteirinha
      Primeiro acesso ao portal
      Uso · carteirinha, dependentes, benefícios
      Mensalidade · paga a fatura
      Retenção · fica, suspende ou cancela
    Dinheiro
      Associado paga mensalidade ao clube
      Clube paga assinatura à Annetec
      Clube paga comissão ao vendedor
    Vazamentos hoje
      Site da Annetec não grava cadastros
      Venda do clube não tem funil
      Cotação automática bloqueada
      Ninguém contrata sozinho
      Candidato a vendedor vira lead comum
      Carteira antiga entra aos poucos
```
