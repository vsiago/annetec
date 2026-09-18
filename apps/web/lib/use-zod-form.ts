'use client'

import { useCallback, useState } from 'react'
import type { z } from 'zod'

/**
 * Formulário controlado validado por um schema Zod.
 *
 * Os formulários do painel são pequenos e vivem dentro de diálogos que abrem
 * já preenchidos (editar) ou vazios (criar). Um estado controlado simples
 * cobre isso com menos cerimônia que o react-hook-form, e a validação sai do
 * MESMO schema que a API usa — os primitivos de `@annetec/contracts` (CPF,
 * CNPJ, e-mail, telefone) já validam dígito verificador, então a tela recusa
 * o que o backend recusaria.
 */
export function useZodForm<Schema extends z.ZodType>(
  schema: Schema,
  initialValues: Record<string, string>,
) {
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const setField = useCallback((field: string, value: string) => {
    setValues(prev => ({ ...prev, [field]: value }))
    // Limpa o erro do campo assim que a pessoa mexe nele: manter a mensagem
    // enquanto ela corrige é o que faz um formulário parecer que briga.
    setErrors(prev => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }, [])

  const reset = useCallback((next: Record<string, string> = initialValues) => {
    setValues(next)
    setErrors({})
  }, [initialValues])

  /** Devolve os dados já transformados pelo schema, ou null se houver erro. */
  const validate = useCallback((): z.output<Schema> | null => {
    const result = schema.safeParse(values)
    if (result.success) {
      setErrors({})
      return result.data
    }

    const fieldErrors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const path = String(issue.path[0] ?? '_')
      if (!fieldErrors[path]) fieldErrors[path] = issue.message
    }
    setErrors(fieldErrors)
    return null
  }, [schema, values])

  return { values, errors, setField, setErrors, reset, validate }
}
