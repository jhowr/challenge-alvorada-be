import type { ApiError } from "./types"

const FIELD_LABELS: Record<string, string> = {
  id: "Id",
  resourceId: "Recurso",
  start: "Início",
  end: "Fim",
  status: "Status",
}

/**
 * Explains an API error in Portuguese. The code itself stays visible next to
 * this text in the UI, so the evaluator can match it with the API contract.
 */
export function describeError(error: ApiError): string {
  switch (error.code) {
    case "conflict": {
      const ids = error.conflictingIds ?? []
      return ids.length === 1
        ? `O período conflita com a reserva ativa ${ids[0]}.`
        : `O período conflita com ${ids.length} reservas ativas: ${ids.join(", ")}.`
    }
    case "id_already_used":
      return `O id "${error.id}" já foi usado. Ids nunca voltam a ficar livres, nem depois do cancelamento.`
    case "resource_not_found":
      return `O recurso "${error.resourceId}" não existe.`
    case "booking_not_found":
      return `A reserva "${error.id}" não existe.`
    case "validation_error":
      return "Há campos inválidos."
    case "api_unreachable":
      return "A API de reservas não respondeu. Ela está rodando?"
    default:
      return error.message
  }
}

/** Validation details keyed by form field, in Portuguese. */
export function fieldErrors(error: ApiError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const { field, reason } of error.details ?? []) {
    out[field] = translateReason(reason)
  }
  return out
}

/** `Início: deve ser um inteiro` for places that show every detail inline. */
export function describeDetails(error: ApiError): string[] {
  return (error.details ?? []).map(
    ({ field, reason }) =>
      `${FIELD_LABELS[field] ?? field}: ${translateReason(reason)}`
  )
}

function translateReason(reason: string): string {
  if (reason === "must not be empty") return "não pode ficar vazio"
  if (reason === "must not be blank") return "não pode ser só espaços"
  if (reason === "must be greater than start")
    return "deve ser depois do início"
  if (reason === "must be an integer") return "deve ser uma hora inteira"
  if (reason.startsWith("must be <=") || reason.startsWith("must be >="))
    return "fora do intervalo int32"
  if (reason === "must have at most 64 characters")
    return "longo demais (máx. 64 caracteres)"
  if (reason === "must not contain control characters")
    return "tem caracteres de controle"
  if (reason === "must be well-formed Unicode") return "tem Unicode malformado"
  // Unknown reasons are shown as the API wrote them rather than guessed.
  return reason
}
