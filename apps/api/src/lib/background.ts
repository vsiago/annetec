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

  if (process.env.VERCEL) {
    void import('@vercel/functions').then(({ waitUntil }) => waitUntil(settled))
  }
}
