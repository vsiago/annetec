/** Id da zona "Venda fechada" do quadro (e do chip Encerrados no celular): alvo da celebração. */
export const ID_ZONA_VENDA = 'funil-zona-venda'

export function preferePoucoMovimento(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
}

const CORES = ['#079455', '#F79009', '#1570EF', '#E84364', '#7A5AF8']

/**
 * Micro-animação curta (≈ 1 s) ao fechar uma venda: anel verde que se expande e poucos confetes que
 * sobem e somem. Sem som. Com `prefers-reduced-motion` não anima nada (o toast continua dizendo tudo).
 */
export function celebrarVenda(alvo?: HTMLElement | null): void {
  if (typeof document === 'undefined' || preferePoucoMovimento()) return
  const el = alvo ?? document.getElementById(ID_ZONA_VENDA) ?? document.querySelector<HTMLElement>('[data-zona-venda]')
  if (!el || typeof el.animate !== 'function') return

  el.animate(
    [
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(7,148,85,0.45)' },
      { transform: 'scale(1.04)', boxShadow: '0 0 0 10px rgba(7,148,85,0)', offset: 0.6 },
      { transform: 'scale(1)', boxShadow: '0 0 0 0 rgba(7,148,85,0)' },
    ],
    { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  )

  const caixa = el.getBoundingClientRect()
  const camada = document.createElement('div')
  camada.setAttribute('aria-hidden', 'true')
  Object.assign(camada.style, {
    position: 'fixed',
    left: `${caixa.left + caixa.width / 2}px`,
    top: `${caixa.top + caixa.height / 2}px`,
    width: '0',
    height: '0',
    pointerEvents: 'none',
    zIndex: '130',
  })
  document.body.appendChild(camada)
  const bolinhas = 14
  for (let i = 0; i < bolinhas; i++) {
    const p = document.createElement('span')
    const tamanho = 5 + (i % 3) * 2
    Object.assign(p.style, {
      position: 'absolute',
      left: '0',
      top: '0',
      width: `${tamanho}px`,
      height: `${tamanho}px`,
      borderRadius: i % 2 ? '50%' : '2px',
      background: CORES[i % CORES.length],
    })
    camada.appendChild(p)
    const angulo = (Math.PI * 2 * i) / bolinhas + (i % 2 ? 0.2 : -0.2)
    const alcance = 46 + (i % 4) * 14
    p.animate(
      [
        { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 1 },
        {
          transform: `translate(calc(-50% + ${Math.cos(angulo) * alcance}px), calc(-50% + ${Math.sin(angulo) * alcance - 18}px)) scale(1) rotate(${i * 40}deg)`,
          opacity: 1,
          offset: 0.55,
        },
        {
          transform: `translate(calc(-50% + ${Math.cos(angulo) * alcance * 1.15}px), calc(-50% + ${Math.sin(angulo) * alcance + 14}px)) scale(0.8)`,
          opacity: 0,
        },
      ],
      { duration: 1000, easing: 'ease-out', fill: 'forwards' },
    )
  }
  window.setTimeout(() => camada.remove(), 1100)
}
