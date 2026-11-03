# PRD — Caso 02: Reservas sem conflito

> Desafio técnico Alvorada (vaga Senior/Staff Full Stack, Finch).
> Enunciado: https://github.com/Alvorada-Dev/desafios-tecnicos/blob/main/casos/02-reservas-de-recursos.md
>
> Estado: implementado. Este documento foi atualizado para refletir o código final.
>
> Convenção: a prosa dos documentos é em pt-BR; **código, rotas, campos, códigos de erro e comentários são em inglês**.

## 1. Objetivo

Um serviço que responde se um recurso compartilhado (sala ou equipamento) pode ser reservado em um período, cria e cancela reservas e permite consultá-las, **sem nunca aceitar duas reservas ativas sobrepostas no mesmo recurso**.

**Foco escolhido:** back-end e modelagem de dados. A regra de não sobreposição é garantida em três camadas:

1. Na aplicação em TypeScript: os DTOs validam a entrada e o service checa recurso, id e sobreposição, explicando cada recusa.
2. No repositório: um `SELECT … FOR NO KEY UPDATE` na linha do recurso serializa as escritas de cada recurso, e a checagem de conflito roda dentro desse lock.
3. No PostgreSQL, com `EXCLUDE USING gist` sobre `int4range`, que mantém a regra mesmo com acesso concorrente. O desafio dispensa concorrência, mas produção não.

## 2. Fora de escopo

Pagamento, recorrência, autenticação, fuso horário e calendário. Front-end também fica de fora: uma tela em Next.js é bônus opcional e fica num repositório separado (`alvorada-web`).

## 3. Glossário (enunciado → código)

| Enunciado | Código | Definição |
|---|---|---|
| recurso | `resource` | Item reservável de uma lista fixa (inserida por migration): `PROJECTOR-1`, `R1`, `R2`, `ROOM-A`, `ROOM-B`. |
| reserva | `booking` | `{ id, resourceId, start, end, status }`. |
| `inicio` / `fim` | `start` / `end` | Período semiaberto `[start, end)`, que ocupa `start` e libera em `end`. |
| ativa / cancelada | `active` / `cancelled` | Status da reserva. |
| conflito | `conflict` | Reserva **ativa** do **mesmo** recurso com `a.start < b.end && b.start < a.end`. |
| `ja_cancelada` | `already_cancelled` | Resultado de cancelar uma reserva que já estava cancelada. O mapeamento fica documentado no README. |

## 4. Regras de negócio (fonte de verdade para os testes)

| # | Regra |
|---|---|
| BR1 | `start` e `end` são **inteiros** (dentro do int32) e `start < end`. Intervalo vazio ou invertido gera `validation_error`. |
| BR2 | `id` é uma string não vazia (sem trim implícito: `" "` é inválido) com no máximo 64 unidades UTF-16. `id` e `resourceId` não podem ter caracteres de controle nem UTF-16 malformado. |
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
| BR13 | A **ordem crescente de id** é a ordem dos bytes UTF-8 (`"10" < "9"`, `"B" < "a"`). No Postgres: `COLLATE "C"`. Esta é uma decisão explícita, coberta por teste (ver DECISIONS.md). |
| BR14 | Uma reserva recusada por conflito informa **quais** reservas conflitam (ids em ordem crescente). |

### Ordem de validação (determinística)

Quando houver mais de um problema, retorna-se **o primeiro** desta ordem:

1. `validation_error` (formato e tipos, checados pelos DTOs antes do service; lista de campos com problema em `details`)
2. `resource_not_found`
3. `id_already_used`
4. `conflict` (com `conflictingIds: string[]`)

## 5. Contrato do service

```ts
type BookingStatus = 'active' | 'cancelled';
interface Booking { id: string; resourceId: string; start: number; end: number; status: BookingStatus }

// Inputs arrive already validated by the request DTOs (BR1, BR2, BR11).
// Expected errors are thrown as DomainError subclasses (booking.errors.ts):
//   ResourceNotFoundError { code: 'resource_not_found'; resourceId }   → 404
//   BookingNotFoundError  { code: 'booking_not_found'; id }            → 404
//   IdAlreadyUsedError    { code: 'id_already_used'; id }              → 409
//   ConflictError         { code: 'conflict'; conflictingIds }         → 409

BookingsService.create(booking: { id; resourceId; start; end }): Promise<Booking>
                                // throws ResourceNotFound, IdAlreadyUsed or Conflict
BookingsService.cancel(id):     Promise<{ outcome: 'cancelled' | 'already_cancelled'; booking: Booking }>
                                // throws BookingNotFound
BookingsService.list(filter: { status?: BookingStatus; resourceId?: string }): Promise<Booking[]>  // ascending id
BookingsService.findById(id):   Promise<Booking>  // throws BookingNotFound
AvailabilityService.check({ resourceId, start, end }):
                                Promise<{ resourceId; start; end; available: boolean; conflicts: Booking[] }>
                                // throws ResourceNotFound
ResourcesService.list():        Promise<string[]>
ResourcesService.exists(id):    Promise<boolean>
```

Os erros esperados são classes de domínio (`DomainError`) lançadas pelos services, e um filtro global as traduz em 404 ou 409 com o corpo `{ code, message, ...dados }`. Qualquer outra exceção, como o banco fora do ar, vira 500 `internal_error`. O `validation_error` vem do `ValidationPipe`, antes de o service ser chamado, no formato `{ code, message, details }`.

## 6. API HTTP (NestJS)

| Método e rota | Sucesso | Erros |
|---|---|---|
| `GET /resources` | 200 `string[]` | — |
| `GET /resources/:resourceId/availability?start=&end=` | 200 `{ resourceId, start, end, available, conflicts }` | 400 `validation_error`, 404 `resource_not_found` |
| `POST /bookings` `{ id, resourceId, start, end }` | 201 `Booking` | 400, 404, 409 `id_already_used`, 409 `conflict` |
| `GET /bookings?status=&resourceId=` | 200 `Booking[]` | 400 (filtro inválido) |
| `GET /bookings/:id` | 200 `Booking` | 400 `validation_error`, 404 `booking_not_found` |
| `POST /bookings/:id/cancellation` | 200 `{ outcome: 'cancelled' \| 'already_cancelled', booking }` | 400 `validation_error`, 404 `booking_not_found` |
| `GET /health` | 200 `{ status: 'ok' }` | 503 `database_unavailable` |

Corpo de erro: `{ "code": "...", "message": "human readable (en)", ...campos do erro }`. Erros do framework seguem o mesmo formato: JSON ou URL malformados (400 `validation_error`), 413 `payload_too_large`, 415 `unsupported_media_type`, 404 `route_not_found`, 500 `internal_error`.

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

Este é um resumo. A versão aplicada, com os nomes de todos os constraints, está em [1793318400000-InitialSchema.ts](../src/migrations/1793318400000-InitialSchema.ts).

- Conflitos: `WHERE resource_id = $1 AND status = 'active' AND period && int4range($2,$3) ORDER BY id`. O índice GiST do constraint atende essa consulta.
- Inserção: numa transação, `SELECT 1 FROM resources WHERE id = $1 FOR NO KEY UPDATE` serializa as escritas do recurso, a checagem de conflito roda dentro do lock e só então vem o `INSERT`. Sem o lock, inserts concorrentes sobrepostos entram em deadlock na checagem do `EXCLUDE` (ver DECISIONS.md).
- Mapeamento de erros do driver: `23505` (PK, mesmo id em outro recurso ao mesmo tempo) vira `id_already_used`; `23P01` vira `conflict`, como defesa caso o lock deixe de existir.
- Cancelamento: `UPDATE ... SET status='cancelled', cancelled_at=now() WHERE id=$1 AND status='active' RETURNING` com as colunas da reserva. Se não retornar linha, distinguir entre `already_cancelled` e `booking_not_found`.
- Limite conhecido: `int4range` só aceita inteiros de 32 bits. Os DTOs validam esse limite, e a troca para `int8range` é trivial.

## 8. Requisitos não funcionais

- `pnpm install && pnpm test` roda os testes unitários **sem Docker** (services com mocks dos repositórios e DTOs).
- `pnpm test:e2e` roda a API HTTP inteira contra um Postgres descartável (Testcontainers).
- `pnpm test:pg` roda os testes do repositório, das constraints e de concorrência contra o Postgres (Testcontainers).
- `pnpm db:up && pnpm start:dev` sobe a API contra o Postgres do `docker compose`. Sem `DATABASE_URL`, ou com o banco fora do ar, a API não sobe.
- `pnpm load:race` e `pnpm load:bench` rodam os testes de race conditions e de carga.
- Robustez: config validada no boot, timeouts de statement e de transação ociosa, e a API sobrevive a conexões derrubadas pelo banco.
- `pnpm demo` executa um cenário reproduzível (diferente do exemplo do enunciado) contra a API e imprime esperado e obtido.
- Sem credenciais reais: o `.env` versionado traz apenas os valores locais do compose. Ajustes pessoais vão no `.env.local`, que não é versionado.

## 9. Critérios de aceite

- [x] O exemplo do enunciado (A, B, C em R1 e R2) passa como teste de aceitação.
- [x] Todas as BR1–BR14 têm ao menos um teste nomeado pela regra.
- [x] O repositório Postgres tem testes próprios para cada regra que depende dele (BR3, BR4, BR6, BR7, BR10, BR12, BR13).
- [x] Teste de concorrência no Postgres: N inserts simultâneos sobrepostos resultam em exatamente 1 aceito.
- [ ] README com: caso, foco, tempo gasto (falta preencher), como instalar, rodar, testar e demonstrar, os 3 testes destacados, as decisões investigadas (as 2 pedidas pelo enunciado são a 1 e a 2), o uso de IA e as pendências.
- [ ] Vídeo de até 30 minutos com um cenário próprio, um teste importante e o trecho de código que ele confere.
