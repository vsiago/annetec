/**
 * Sons das notificações — gerados no navegador com Web Audio (nenhum arquivo
 * de áudio). Curtos (< 600 ms) e com volume moderado: o painel fica aberto o
 * dia inteiro, e o som tem que avisar sem assustar.
 *
 *  - `tenant-payment`: "cha-ching" — duas notas ascendentes brilhantes
 *    (Lá5 880 Hz → Mi6 1320 Hz, quinta justa) com um brilho agudo por cima;
 *  - `tenant-signup`: chime suave de uma nota (Mi5 660 Hz) com harmônicos e
 *    decaimento longo, tipo sininho de porta;
 *  - `platform-payment`: dois bipes curtos e discretos (Ré6 → Sol6);
 *  - `platform-signup`: um bipe só, mais grave (Lá5).
 *
 * Navegadores só liberam áudio depois de um gesto da pessoa: o contexto é
 * criado/retomado no primeiro clique ou tecla da página (`unlockAudioOnFirstGesture`).
 * Se ainda estiver bloqueado na hora do aviso, o som é simplesmente pulado
 * (o toast aparece do mesmo jeito).
 */

export type NotificationSound = 'tenant-payment' | 'tenant-signup' | 'platform-payment' | 'platform-signup'

const MASTER_VOLUME = 0.15

let context: AudioContext | null = null

function audioContextClass(): typeof AudioContext | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & { webkitAudioContext?: typeof AudioContext }
  return w.AudioContext ?? w.webkitAudioContext ?? null
}

function getContext(): AudioContext | null {
  if (context) return context
  const Ctor = audioContextClass()
  if (!Ctor) return null
  try {
    context = new Ctor()
  } catch {
    context = null
  }
  return context
}

/** Liga o áudio no primeiro gesto da pessoa. Devolve a função que remove os ouvintes. */
export function unlockAudioOnFirstGesture(): () => void {
  if (typeof window === 'undefined') return () => {}
  const unlock = () => {
    const ctx = getContext()
    if (!ctx) return
    if (ctx.state === 'running') return remove()
    void ctx
      .resume()
      .then(() => {
        if (ctx.state === 'running') remove()
      })
      .catch(() => undefined)
  }
  const remove = () => {
    window.removeEventListener('pointerdown', unlock)
    window.removeEventListener('keydown', unlock)
    window.removeEventListener('touchstart', unlock)
  }
  window.addEventListener('pointerdown', unlock)
  window.addEventListener('keydown', unlock)
  window.addEventListener('touchstart', unlock, { passive: true })
  return remove
}

export function isAudioUnlocked(): boolean {
  return context?.state === 'running'
}

interface Tone {
  freq: number
  /** Início, em segundos a partir de agora. */
  at: number
  /** Duração até o silêncio (decaimento exponencial). */
  duration: number
  gain: number
  type?: OscillatorType
  attack?: number
}

function playTones(ctx: AudioContext, tones: Tone[], volume: number) {
  const now = ctx.currentTime + 0.01
  const master = ctx.createGain()
  master.gain.value = volume
  // Corta o "clique" grave de alto-falante de notebook e deixa o som mais limpo.
  const highpass = ctx.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 220
  master.connect(highpass)
  highpass.connect(ctx.destination)

  let end = now
  for (const tone of tones) {
    const start = now + tone.at
    const stop = start + tone.duration
    const attack = tone.attack ?? 0.008
    const osc = ctx.createOscillator()
    const env = ctx.createGain()
    osc.type = tone.type ?? 'sine'
    osc.frequency.setValueAtTime(tone.freq, start)
    env.gain.setValueAtTime(0.0001, start)
    env.gain.exponentialRampToValueAtTime(tone.gain, start + attack)
    env.gain.exponentialRampToValueAtTime(0.0001, stop)
    osc.connect(env)
    env.connect(master)
    osc.start(start)
    osc.stop(stop + 0.02)
    end = Math.max(end, stop)
  }
  // Solta os nós quando o som acaba.
  window.setTimeout(() => {
    try {
      master.disconnect()
      highpass.disconnect()
    } catch {
      /* já desconectado */
    }
  }, Math.ceil((end - ctx.currentTime) * 1000) + 100)
}

/** Nota com corpo: fundamental + oitava suave (o "brilho"). */
function bright(freq: number, at: number, duration: number, gain: number): Tone[] {
  return [
    { freq, at, duration, gain, type: 'sine' },
    { freq: freq * 2, at, duration: duration * 0.6, gain: gain * 0.28, type: 'triangle' },
  ]
}

const RECIPES: Record<NotificationSound, { tones: Tone[]; volume: number }> = {
  'tenant-payment': {
    volume: MASTER_VOLUME,
    tones: [
      ...bright(880, 0, 0.16, 0.7),
      ...bright(1320, 0.085, 0.42, 0.85),
      // Brilho de moeda: dois pings agudos e rápidos por cima da 2ª nota.
      { freq: 2637, at: 0.1, duration: 0.18, gain: 0.12, type: 'sine' },
      { freq: 3520, at: 0.13, duration: 0.22, gain: 0.08, type: 'sine' },
    ],
  },
  'tenant-signup': {
    volume: MASTER_VOLUME,
    tones: [
      { freq: 660, at: 0, duration: 0.55, gain: 0.8, type: 'sine', attack: 0.012 },
      { freq: 1320, at: 0, duration: 0.38, gain: 0.22, type: 'sine', attack: 0.012 },
      { freq: 1980, at: 0, duration: 0.24, gain: 0.08, type: 'sine', attack: 0.012 },
    ],
  },
  'platform-payment': {
    volume: MASTER_VOLUME * 0.8,
    tones: [
      { freq: 1175, at: 0, duration: 0.07, gain: 0.6, type: 'sine', attack: 0.004 },
      { freq: 1568, at: 0.09, duration: 0.1, gain: 0.6, type: 'sine', attack: 0.004 },
    ],
  },
  'platform-signup': {
    volume: MASTER_VOLUME * 0.8,
    tones: [{ freq: 880, at: 0, duration: 0.12, gain: 0.6, type: 'sine', attack: 0.004 }],
  },
}

/** Toca o som. Devolve `false` quando o áudio ainda está bloqueado (sem gesto) ou indisponível. */
export function playNotificationSound(sound: NotificationSound): boolean {
  const ctx = getContext()
  if (!ctx || ctx.state !== 'running') return false
  try {
    const recipe = RECIPES[sound]
    playTones(ctx, recipe.tones, recipe.volume)
    return true
  } catch {
    return false
  }
}

const SOUND_PREF_KEY = 'annetec.notificacoes.som'

export function readSoundPreference(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== 'off'
  } catch {
    return true
  }
}

export function writeSoundPreference(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? 'on' : 'off')
  } catch {
    /* modo privado / armazenamento bloqueado: vale só nesta aba */
  }
}
