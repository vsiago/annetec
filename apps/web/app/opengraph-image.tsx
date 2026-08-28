import { ImageResponse } from 'next/og'
import { readFileSync } from 'fs'
import { join } from 'path'

export const alt = 'Annetec | Plano de Assistência Familiar'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  const logoPath = join(process.cwd(), 'public', 'annetec-light.svg')
  let logoData = readFileSync(logoPath, 'utf8')
  
  // Fix SVG for Satori/resvg by ensuring width and height are present
  if (!logoData.includes('width=')) {
    logoData = logoData.replace('<svg ', '<svg width="3558" height="982" ')
  }
  
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
        <img src={logoDataUri} style={{ width: 700 }} alt="Annetec Logo" />
      </div>
    ),
    { ...size }
  )
}
