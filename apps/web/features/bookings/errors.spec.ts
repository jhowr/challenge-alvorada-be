import { describeDetails, describeError, fieldErrors } from "./errors"

describe("describeError", () => {
  it("names a single conflicting booking", () => {
    expect(
      describeError({
        code: "conflict",
        message: "",
        conflictingIds: ["standup"],
      })
    ).toBe("O período conflita com a reserva ativa standup.")
  })

  it("lists every conflicting booking in the API's order", () => {
    expect(
      describeError({
        code: "conflict",
        message: "",
        conflictingIds: ["review", "standup"],
      })
    ).toBe("O período conflita com 2 reservas ativas: review, standup.")
  })

  it("explains that ids are never reused", () => {
    expect(
      describeError({ code: "id_already_used", message: "", id: "retro" })
    ).toContain("nem depois do cancelamento")
  })

  it("falls back to the API message for an unknown code", () => {
    expect(
      describeError({ code: "database_unavailable", message: "DB down" })
    ).toBe("DB down")
  })
})

describe("validation details", () => {
  const error = {
    code: "validation_error",
    message: "Invalid input",
    details: [
      { field: "id", reason: "must not be blank" },
      { field: "end", reason: "must be greater than start" },
      { field: "start", reason: "something new" },
    ],
  }

  it("keys translated reasons by field", () => {
    expect(fieldErrors(error)).toEqual({
      id: "não pode ser só espaços",
      end: "deve ser depois do início",
      start: "something new",
    })
  })

  it("labels each detail with the field name", () => {
    expect(describeDetails(error)).toEqual([
      "Id: não pode ser só espaços",
      "Fim: deve ser depois do início",
      "Início: something new",
    ])
  })
})
