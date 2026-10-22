/** Baixa um CSV (separador `;`, UTF-8 com BOM) gerado no navegador. */
export function downloadCsv(filename: string, rows: Array<Array<string | number | null | undefined>>) {
  const escape = (value: string | number | null | undefined) => {
    const text = value == null ? '' : String(value)
    return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  const csv = rows.map(row => row.map(escape).join(';')).join('\r\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
