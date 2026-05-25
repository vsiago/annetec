import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const alt = 'Annetec | Plano de Assistência Familiar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  const logoPath = join(process.cwd(), 'public', 'annetec-light.svg')
  const logoData = readFileSync(logoPath, 'utf8')
  const logoDataUri = `data:image/svg+xml;base64,${Buffer.from(logoData).toString('base64')}`

  return new ImageResponse(
    (
      <div
        style={{
          background: '#e84364',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <img src={logoDataUri} width="700" alt="Annetec Logo" />
      </div>
    ),
    { ...size }
  )
}
