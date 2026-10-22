'use client'

/**
 * Arquivos de EXEMPLO gerados no navegador para o modo demonstração: um PDF
 * mínimo válido (a API confere os bytes `%PDF-`) e um logo PNG com as
 * iniciais do clube. Só carregados por `import()` em ambiente de demonstração (`isDemoMode`).
 */

function ascii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1')
}

export function buildSamplePdf(title: string, lines: string[], fileName: string): File {
  const ops: string[] = ['BT', '/F1 16 Tf', '56 780 Td', `(${ascii(title)}) Tj`, 'ET']
  let y = 748
  for (const line of lines) {
    ops.push('BT', '/F1 11 Tf', `56 ${y} Td`, `(${ascii(line)}) Tj`, 'ET')
    y -= 18
  }
  ops.push('BT', '/F1 9 Tf', '56 60 Td', `(${ascii('Documento FICTICIO gerado para demonstracao - sem valor legal.')}) Tj`, 'ET')
  const stream = ops.join('\n')
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(pdf.length)
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return new File([pdf], fileName, { type: 'application/pdf' })
}

function initialsOf(name: string): string {
  const words = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 || /^[A-Z0-9]+$/.test(word))
  const pick = words.length >= 2 ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}` : (words[0] ?? 'C').slice(0, 2)
  return pick.toUpperCase()
}

export async function buildSampleLogo(clubName: string, primary: string, secondary: string): Promise<File | null> {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const gradient = ctx.createLinearGradient(0, 0, size, size)
  gradient.addColorStop(0, primary)
  gradient.addColorStop(1, secondary)
  ctx.fillStyle = gradient
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath()
    ctx.roundRect(16, 16, size - 32, size - 32, 112)
    ctx.fill()
  } else {
    ctx.fillRect(16, 16, size - 32, size - 32)
  }
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 200px system-ui, -apple-system, Segoe UI, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(initialsOf(clubName), size / 2, size / 2 + 12)
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'))
  return blob ? new File([blob], 'logo-exemplo.png', { type: 'image/png' }) : null
}
