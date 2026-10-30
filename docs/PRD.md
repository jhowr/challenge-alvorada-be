# PRD — Caso 02: Reservas sem conflito

> Desafio técnico Alvorada (vaga Senior/Staff Full Stack, Finch).
> Enunciado: https://github.com/Alvorada-Dev/desafios-tecnicos/blob/main/casos/02-reservas-de-recursos.md
>
> Convenção: a prosa dos documentos é em pt-BR; **código, rotas, campos, códigos de erro e comentários são em inglês**.

## 1. Objetivo

Um serviço que responde se um recurso compartilhado (sala ou equipamento) pode ser reservado em um período, cria e cancela reservas e permite consultá-las, **sem nunca aceitar duas reservas ativas sobrepostas no mesmo recurso**.

**Foco escolhido:** back-end e modelagem de dados. A regra de não sobreposição é garantida em duas camadas:

1. No service em TypeScript, que valida e explica os erros.
2. No PostgreSQL, com `EXCLUDE USING gist` sobre `int4range`, que mantém a regra mesmo com acesso concorrente. O desafio dispensa concorrência, mas produção não.

## 2. Fora de escopo

Pagamento, recorrência, autenticação, fuso horário e calendário. Front-end também fica de fora: uma tela em Next.js é bônus opcional (ver PLANO, fase 7).

## 3. Glossário (enunciado → código)

| Enunciado | Código | Definição |
|---|---|---|
| recurso | `resource` | Item reservável de uma lista fixa (seed): `R1`, `R2`, `ROOM-A`, `PROJECTOR-1`. |
| reserva | `booking` | `{ id, resourceId, start, end, status }`. |
| `inicio` / `fim` | `start` / `end` | Período semiaberto `[start, end)`, que ocupa `start` e libera em `end`. |
| ativa / cancelada | `active` / `cancelled` | Status da reserva. |
| conflito | `conflict` | Reserva **ativa** do **mesmo** recurso com `a.start < b.end && b.start < a.end`. |
| `ja_cancelada` | `already_cancelled` | Resultado de cancelar uma reserva que já estava cancelada. O mapeamento fica documentado no README. |

## 4. Regras de negócio (fonte de verdade para os testes)

| # | Regra |
|---|---|
| BR1 | `start` e `end` são **inteiros** (dentro do int32) e `start < end`. Intervalo vazio ou invertido gera `validation_error`. |
| BR2 | `id` é uma string não vazia (sem trim implícito: `" "` é inválido) com no máximo 64 caracteres. `resourceId` é uma string não vazia. |
| BR3 | O período é `[start, end)`: uma reserva `[10,20)` **não** conflita com `[20,30)`. |
| BR4 | A sobreposição só vale entre reservas **ativas** do **mesmo** recurso. |
| BR5 | Uma tentativa rejeitada (por qualquer motivo) **não** cria a reserva e **não** ocupa o `id`. |
| BR6 | O `id` de uma reserva criada nunca é reutilizado, mesmo depois do cancelamento (`id_already_used`). |
| BR7 | Cancelar uma reserva ativa a marca como `cancelled` e libera o horário. |
| BR8 | Cancelar uma reserva já cancelada retorna `already_cancelled` sem mudar nada. |
| BR9 | Cancelar um id inexistente gera `booking_not_found`. |
| BR10 | A consulta de disponibilidade (recurso e intervalo válidos) retorna `available` e a lista de reservas ativas em conflito, **em ordem crescente de id**. A consulta não muda os dados. |
| BR11 | Consultar um recurso inexistente ou um intervalo inválido retorna erro (mesmos códigos da criação). |
| BR12 | É possível listar as reservas (filtros opcionais por `status` e `resourceId`) e obter uma reserva por id, com o status visível. |
| BR13 | A **ordem crescente de id** é a ordem binária ou por code unit (`"10" < "9"`, `"B" < "a"`). Em memória: comparação `<` de string. No Postgres: `COLLATE "C"`. Esta é uma decisão explícita, coberta por teste. |
| BR14 | Uma reserva recusada por conflito informa **quais** reservas conflitam (ids em ordem crescente). |

### Ordem de validação (determinística)

Quando houver mais de um problema, retorna-se **o primeiro** desta ordem:

1. `validation_error` (formato e tipos; lista de campos com problema em `details`)
2. `resource_not_found`
3. `id_already_used`
4. `conflict` (com `conflictingIds: string[]`)

## 5. Contrato do service

```ts
type BookingStatus = 'active' | 'cancelled';
interface Booking { id: string; resourceId: string; start: number; end: number; status: BookingStatus }

type BookingError =
  | { code: 'validation_error'; details: { field: string; reason: string }[] }
  | { code: 'resource_not_found'; resourceId: string }
  | { code: 'id_already_used'; id: string }
  | { code: 'conflict'; conflictingIds: string[] };

type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

BookingsService.create(input):  Promise<Result<Booking, BookingError>>
BookingsService.cancel(id):     Promise<Result<{ outcome: 'cancelled' | 'already_cancelled'; booking: Booking },
                                               { code: 'booking_not_found'; id: string }>>
BookingsService.list(filter?: { status?: BookingStatus; resourceId?: string }): Promise<Booking[]>  // ascending id
BookingsService.findById(id):   Promise<Booking | null>
AvailabilityService.check(resourceId, start, end):
                                Promise<Result<{ available: boolean; conflicts: Booking[] }, BookingError>>
ResourcesService.list():        Promise<string[]>
ResourcesService.exists(id):    Promise<boolean>
```

Os erros esperados são valores (`Result`), não exceções. Exceções ficam para falhas inesperadas, como o banco fora do ar.

## 6. API HTTP (NestJS)

| Método e rota | Sucesso | Erros |
|---|---|---|
| `GET /resources` | 200 `string[]` | — |
| `GET /resources/:resourceId/availability?start=&end=` | 200 `{ available, conflicts }` | 400 `validation_error`, 404 `resource_not_found` |
| `POST /bookings` `{ id, resourceId, start, end }` | 201 `Booking` | 400, 404, 409 `id_already_used`, 409 `conflict` |
| `GET /bookings?status=&resourceId=` | 200 `Booking[]` | 400 (filtro inválido) |
| `GET /bookings/:id` | 200 `Booking` | 404 `booking_not_found` |
| `POST /bookings/:id/cancellation` | 200 `{ outcome: 'cancelled' \| 'already_cancelled', booking }` | 404 `booking_not_found` |

Corpo de erro: `{ "code": "...", "message": "human readable (en)", ...campos do erro }`.

O cancelamento é um `POST` em um sub-recurso, e não `DELETE`, porque a reserva continua existindo com status `cancelled`.

## 7. Modelo de dados (PostgreSQL 16)

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE resources (id text COLLATE "C" PRIMARY KEY);

CREATE TABLE bookings (
  id           text COLLATE "C" PRIMARY KEY,
  resource_id  text COLLATE "C" NOT NULL REFERENCES resources(id),
  period       int4range NOT NULL,                     -- canonicalized as '[)'
  status       text NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  CHECK (NOT isempty(period)),
  CONSTRAINT bookings_no_overlap
    EXCLUDE USING gist (resource_id WITH =, period WITH &&) WHERE (status = 'active')
);
```

- Conflitos: `WHERE resource_id = $1 AND status = 'active' AND period && int4range($2,$3) ORDER BY id`. O índice GiST do constraint atende essa consulta.
- Mapeamento de erros do driver: `23P01` (exclusion) vira `conflict` (re-consultando os conflitos), `23505` (PK) vira `id_already_used` e `23503` (FK) vira `resource_not_found`. Em operação sequencial o service já pré-checa tudo; esses mapeamentos cobrem a corrida.
- Cancelamento: `UPDATE ... SET status='cancelled', cancelled_at=now() WHERE id=$1 AND status='active' RETURNING *`. Se não retornar linha, distinguir entre `already_cancelled` e `booking_not_found`.
- Limite conhecido: `int4range` só aceita inteiros de 32 bits. O service valida esse limite, e a troca para `int8range` é trivial.

## 8. Requisitos não funcionais

- `pnpm install && pnpm test` roda os testes unitários **sem Docker**.
- `pnpm test:e2e` roda os testes e2e da API em memória (sem Docker).
- `pnpm test:pg` roda a suíte de contrato dos repositories e o teste de concorrência contra o Postgres (Testcontainers).
- `pnpm dev` sobe a API com os repositories em memória (padrão). `DB_DRIVER=postgres pnpm dev` usa o Postgres do `docker compose up`.
- `pnpm demo` executa um cenário reproduzível (diferente do exemplo do enunciado) contra a API e imprime esperado e obtido.
- Sem credenciais reais: o `.env.example` traz apenas os valores locais do compose.

## 9. Critérios de aceite

- [ ] O exemplo do enunciado (A, B, C em R1 e R2) passa como teste de aceitação.
- [ ] Todas as BR1–BR14 têm ao menos um teste nomeado pela regra.
- [ ] A suíte de contrato dos repositories passa nas duas implementações (memória e Postgres).
- [ ] Teste de concorrência no Postgres: N inserts simultâneos sobrepostos resultam em exatamente 1 aceito.
- [ ] README com: caso, foco, tempo gasto, como instalar, rodar, testar e demonstrar, os 3 testes destacados, as 2 decisões investigadas, o uso de IA e as pendências.
- [ ] Vídeo de até 30 minutos com um cenário próprio, um teste importante e o trecho de código que ele confere.
