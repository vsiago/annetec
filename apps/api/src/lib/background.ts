const pending = new Set<Promise<unknown>>()

/**
 * Encerramento (SIGTERM): espera o trabalho solto em curso (e-mails, sinos…)
 * terminar, até `maxWaitMs`. `false` = sobrou trabalho quando o prazo acabou.
 */
export async function waitForBackgroundWork(maxWaitMs = 10_000): Promise<boolean> {
  if (pending.size === 0) return true
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<false>(resolve => {
    timer = setTimeout(() => resolve(false), maxWaitMs)
  })
  const done = Promise.allSettled([...pending]).then(() => true as const)
  const result = await Promise.race([done, timeout])
  clearTimeout(timer)
  return result
}

/**
 * Roda uma promise "solta" — dispara e não espera a resposta atual, mas sem
 * perder o trabalho se o processo for congelado logo depois de responder,
 * como pode acontecer numa Serverless Function da Vercel.
 *
 * - Servidor persistente (Railway, `tsx watch` local): o processo continua
 *   vivo depois da resposta, então basta não esperar (`void`).
 * - Vercel: a função pode ser suspensa assim que a resposta é enviada —
 *   `waitUntil` (de `@vercel/functions`) estende a execução até a promise
 *   terminar. Só é chamado quando `VERCEL` está no ambiente (setado pela
 *   própria plataforma), pra não custar nada nos outros hosts.
 */
export function runInBackground(work: Promise<unknown>, onError: (error: unknown) => void): void {
  const settled = work.catch(onError)
  pending.add(settled)
  void settled.finally(() => pending.delete(settled)).catch(() => {})

  if (process.env.VERCEL) {
    void import('@vercel/functions').then(({ waitUntil }) => waitUntil(settled))
  }
}
