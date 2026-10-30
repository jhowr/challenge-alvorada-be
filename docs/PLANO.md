# Plano de execução — Caso 02

Referência de requisitos: [PRD.md](PRD.md). Orçamento: **cerca de 4h** de código, testes e docs. Cada fase termina com testes verdes e um commit.

## Convenções

- **Folder by feature**: cada feature é um módulo Nest com subpastas `controllers/`, `services/` e `repositories/` (esta só quando houver persistência).
- **Tudo em inglês** no código: variáveis, tipos, rotas, campos, códigos de erro, comentários, mensagens de commit.
- **Testes unitários** ficam ao lado do arquivo testado (`*.spec.ts`). **E2E** e **integração** ficam em `test/`.

## Stack e decisões iniciais

| Escolha | Motivo |
|---|---|
| Node 22, TypeScript strict, pnpm | Stack da vaga. |
| NestJS 11 (adapter Express) | Requisito da vaga. A lógica de regra fica nos services e em funções puras, sem depender do HTTP. |
| `pg` puro, SQL em arquivo de migration | Ranges e `EXCLUDE` não são bem suportados por ORMs (Prisma ou TypeORM). Mostra domínio de SQL. |
| Vitest (+ `unplugin-swc` para os decorators do Nest) | Rápido e com boa DX. Alternativa: Jest, padrão do Nest CLI. |
| Testcontainers (`@testcontainers/postgresql`) | `pnpm test:pg` sobe o próprio banco e não depende de estado local. |
| `zod` para validar as entradas da API | Converte query string em número e produz `details` por campo. |
| Repository como interface + token de injeção | Implementações `InMemory*` e `Postgres*`, escolhidas por `DB_DRIVER`. |

## Estrutura alvo

```
src/
  main.ts
  app.module.ts
  modules/
    resources/
      resources.module.ts
      controllers/
        resources.controller.ts              # GET /resources
      services/
        resources.service.ts
        resources.service.spec.ts
      repositories/
        resources.repository.ts              # interface + RESOURCES_REPOSITORY token
        in-memory-resources.repository.ts
        postgres-resources.repository.ts
    bookings/
      bookings.module.ts
      booking.types.ts                       # Booking, BookingStatus, BookingError
      controllers/
        bookings.controller.ts               # /bookings, /bookings/:id, /bookings/:id/cancellation
        availability.controller.ts           # GET /resources/:resourceId/availability
      services/
        bookings.service.ts
        bookings.service.spec.ts
        availability.service.ts
        availability.service.spec.ts
        booking-validator.ts                 # BR1, BR2 → validation_error
        booking-validator.spec.ts
        period.ts                            # overlaps(a, b) — [start, end)
        period.spec.ts
      repositories/
        bookings.repository.ts               # interface + BOOKINGS_REPOSITORY token
        in-memory-bookings.repository.ts
        postgres-bookings.repository.ts
      dto/
        create-booking.schema.ts             # zod
        list-bookings.query.ts
        availability.query.ts
  shared/
    result.ts                                # Result<T, E>, ok(), err()
    compare-ids.ts                           # code-unit ordering (BR13)
    compare-ids.spec.ts
    http/
      domain-error.filter.ts                 # error code → HTTP status + message
      zod-validation.pipe.ts
    database/
      database.module.ts                     # pg Pool provider (only when DB_DRIVER=postgres)
      migrate.ts
      migrations/001_initial.sql
test/
  e2e/
    bookings.e2e-spec.ts                     # supertest, in-memory
    resources.e2e-spec.ts
  integration/
    bookings-repository.contract.ts          # shared suite: (makeRepos) => describe(...)
    in-memory-bookings.repository.int-spec.ts
    postgres-bookings.repository.int-spec.ts # + concurrency test
  helpers/
    postgres-container.ts
scripts/
  demo.ts                                    # reproducible scenario via HTTP
requests.http
docker-compose.yml, .env.example, README.md
docs/PRD.md, docs/PLANO.md, docs/DECISIONS.md
```

**Notas da estrutura:**
- `availability.controller.ts` mora em `bookings/`, mesmo atendendo uma rota em `/resources/...`, porque disponibilidade é uma consulta sobre reservas. Assim `resources` não depende de `bookings`, só o contrário (`BookingsModule` importa `ResourcesModule`).
- Os **unit tests dos services** usam os repositories `InMemory*` reais, sem mocks. É mais simples e testa comportamento, não chamadas.
- O **contrato de repository** (`test/integration/`) é a mesma suíte rodando contra `InMemory*` e `Postgres*`, o que prova que as duas implementações se comportam igual. O teste de concorrência só existe na versão Postgres.

---

## Fase 0 — Setup (≈20 min)

- [ ] `git init`, `.gitignore`, `pnpm init`, `tsconfig` strict (`noUncheckedIndexedAccess`).
- [ ] Dependências: `@nestjs/{core,common,platform-express}`, `reflect-metadata`, `rxjs`, `pg`, `zod`. Dev: `typescript`, `vitest`, `unplugin-swc`, `@swc/core`, `supertest`, `@testcontainers/postgresql`, `tsx`, `@types/*`.
- [ ] Vitest com três projetos ou configs: `unit` (`src/**/*.spec.ts`), `e2e` (`test/e2e/**/*.e2e-spec.ts`) e `integration` (`test/integration/**/*.int-spec.ts`).
- [ ] Scripts: `dev`, `build`, `start`, `test`, `test:e2e`, `test:pg`, `test:all`, `demo`, `db:migrate`, `typecheck`.
- [ ] `docker-compose.yml` com `postgres:16-alpine` e um healthcheck.
- **Pronto quando:** `pnpm test` roda (0 testes) e `docker compose up -d` sobe o banco.

## Fase 1 — Regras + in-memory (≈60 min) — *o núcleo*

Abordagem test-first, na ordem abaixo. Os testes citam a regra no nome (`BR3 — adjacent bookings do not conflict`).

- [ ] `shared/result.ts` e `shared/compare-ids.ts` (+ spec: `["9","10","B","a"]` ordena como `["10","9","B","a"]`).
- [ ] `bookings/services/period.ts`: `overlaps` com a tabela de casos: adjacente nos dois lados, contido, contém, idêntico, parcial à esquerda e à direita.
- [ ] `bookings/services/booking-validator.ts`: tipos errados, `NaN`, `Infinity`, decimal, `start == end`, `start > end`, fora do int32, `id` vazio ou só espaços ou com mais de 64 caracteres. Devolve todos os campos inválidos em `details`.
- [ ] `resources`: interface do repository, `InMemoryResourcesRepository` (seed fixo), `ResourcesService`.
- [ ] `bookings/repositories/bookings.repository.ts` (interface): `findById`, `list(filter)`, `findActiveConflicts(resourceId, start, end)`, `insert`, `markCancelled`.
- [ ] `InMemoryBookingsRepository`: um `Map<string, Booking>`. Retornar **cópias** para que ninguém de fora altere o estado.
- [ ] `BookingsService` e `AvailabilityService`, com a ordem de validação do PRD §4.
- [ ] `bookings.service.spec.ts` e `availability.service.spec.ts` cobrem:
  - o exemplo do enunciado (aceitação);
  - BR3 (limites `[10,20)` e `[20,30)`, e `[19,21)` conflitando com os dois);
  - BR4 (outro recurso no mesmo horário; reserva cancelada não conflita);
  - BR5 (id rejeitado por conflito, por recurso e por dados fica livre);
  - BR6 (id cancelado continua em uso);
  - BR7–BR9 (cancelar, cancelar de novo, inexistente; `already_cancelled` não altera nada: snapshot antes e depois);
  - BR10–BR11 (a consulta não muda os dados: snapshot antes e depois; conflitos ordenados);
  - BR12 (filtros);
  - BR13 (ordem dos conflitos com ids `"10"` e `"9"`);
  - a ordem de validação (recurso inexistente **e** id em uso retorna `resource_not_found`).
- **Pronto quando:** `pnpm test` verde. Commit.

## Fase 2 — Camada HTTP (≈40 min)

- [ ] Módulos com providers `BOOKINGS_REPOSITORY` e `RESOURCES_REPOSITORY` escolhidos por `DB_DRIVER` (`memory` por padrão).
- [ ] Controllers finos: `ZodValidationPipe`, chamada ao service e conversão do `Result` para resposta. `DomainErrorFilter` (ou um mapper) traduz `code` em status HTTP e mensagem (tabela do PRD §6).
- [ ] Query string: `start` e `end` chegam como string. Usar `z.coerce.number().int()` e rejeitar `""`, que `Number("")` converte em 0.
- [ ] `test/e2e/*.e2e-spec.ts` (supertest, in-memory): um caso feliz por rota, um caso por código de erro e o JSON malformado (400 `validation_error`, não 500).
- **Pronto quando:** `pnpm test:e2e` verde e `pnpm dev` responde no curl. Commit.

## Fase 3 — Postgres (≈60 min) — *o diferencial*

- [ ] `shared/database/migrations/001_initial.sql` (PRD §7) e um seed dos recursos. `migrate.ts` aplica tudo em ordem e é idempotente (tabela `_migrations`).
- [ ] `PostgresResourcesRepository` e `PostgresBookingsRepository`:
  - `insert`: `INSERT ... VALUES ($1,$2,int4range($3,$4,'[)'),'active')` com o mapeamento `23P01`/`23505`/`23503` (PRD §7);
  - `findActiveConflicts`: `&&` com `ORDER BY id`. A coluna já é `COLLATE "C"`;
  - `markCancelled`: o `UPDATE ... WHERE status='active' RETURNING`, com fallback de leitura para distinguir `already_cancelled` de `booking_not_found`;
  - ler `lower(period) AS start, upper(period) AS "end"` no SELECT, sem parsear a string `"[10,20)"`.
- [ ] `test/integration/bookings-repository.contract.ts`: a suíte compartilhada, rodando em `in-memory-*.int-spec.ts` e `postgres-*.int-spec.ts` (Testcontainers, migrate, `TRUNCATE bookings` antes de cada teste).
- [ ] Teste de concorrência (só Postgres): 10 `BookingsService.create` simultâneos e sobrepostos com ids distintos, via `Promise.all` com o pool. Esperado: exatamente 1 `ok` e 9 `conflict`. Esse teste só passa por causa do `EXCLUDE`, já que o pré-check do service sofre corrida.
- [ ] Teste do constraint direto no SQL: um `INSERT` manual sobreposto falha mesmo ignorando a aplicação.
- **Pronto quando:** `pnpm test:pg` verde. Commit.

## Fase 4 — Demo reproduzível (≈20 min)

Cenário **diferente do enunciado**: sala de reunião e projetor em um dia de trabalho.

- [ ] `scripts/demo.ts`: chama a API e imprime, para cada passo, `expected` e `actual` com ✔/✘. Sai com código ≠ 0 se algo divergir.
  1. `ROOM-A`: `daily` `[900,915)` aceita; `retro` `[915,1000)` aceita (adjacente).
  2. `planning` `[930,1030)` em `ROOM-A` é recusada por conflito com `retro` (e só `retro`).
  3. `planning` em `PROJECTOR-1` no mesmo horário é aceita (id não ocupado pela tentativa anterior).
  4. Availability de `ROOM-A` `[850,1000)` retorna os conflitos `daily` e `retro`, nessa ordem.
  5. Cancelar `retro` dá `cancelled`; cancelar de novo dá `already_cancelled`.
  6. Recriar `retro` em outro horário gera `id_already_used`.
  7. Listar com `status=cancelled` retorna `[retro]`.
- [ ] Um `requests.http` (REST Client) espelhando o cenário, para exploração manual no vídeo.

## Fase 5 — Documentação (≈30 min)

- [ ] `README.md`: caso 02, foco (back-end e modelagem), tempo gasto, pré-requisitos, instalar, rodar (memória e Postgres), testar, demo, tabela de endpoints, glossário enunciado → código (`ja_cancelada` → `already_cancelled`) e link para o vídeo.
- [ ] **3 testes destacados** (o enunciado pede até três):
  1. **Limite `[10,20)` + `[20,30)`**: aceita. Encontra o erro de usar `<=` no lugar de `<` em `overlaps`.
  2. **Interação entre cancelamento e identificador**: cancelar libera o horário mas não o id. Encontra o erro de implementar o cancelamento como remoção, ou de filtrar `status='active'` na checagem de id.
  3. **Concorrência no Postgres**: 10 inserts simultâneos resultam em 1 aceito. Encontra corridas de check-then-insert que nenhum teste sequencial pega.
- [ ] `docs/DECISIONS.md`, com **2 decisões investigadas** no formato "o que eu queria conferir, como investiguei, o que concluí". Candidatas:
  - **Ordem de ids e collation**: verificar que `ORDER BY id` com collation `en_US.UTF-8` ordena diferente do JS e provar isso com um teste que falha sem `COLLATE "C"`.
  - **Constraint no banco vs. só no service**: mostrar o teste de concorrência falhando sem o `EXCLUDE` (removê-lo temporariamente) e passando com ele.
  - Alternativa ligada à IA: uma sugestão da IA que foi verificada e ajustada (por exemplo, a IA propôs `tsrange` ou ORM, e eu mantive `int4range` + `pg` pelos motivos X).
- [ ] Seção **Uso de IA**: o que foi gerado, o que mudei e como verifiquei (testes primeiro, revisão linha a linha do SQL, experimentos de remover o constraint).
- [ ] Seção **Pendências e limites**: int32, sem paginação, sem auth, recursos como lista fixa, decimais não suportados (alternativa: `numrange`).

## Fase 6 — Vídeo (fora do orçamento de código, ≈30 min de gravação)

Roteiro de 15 a 25 minutos:
1. (2 min) O problema e o foco escolhido.
2. (5 min) `pnpm demo`: narrar o resultado **esperado** antes de cada passo e comparar com o obtido.
3. (5 min) Arquitetura: folder by feature, os services com regras puras, o repository com duas implementações e a suíte de contrato.
4. (6 min) Mostrar o teste de concorrência e o `EXCLUDE` que ele confere. Ao vivo: comentar o constraint, ver o teste falhar e restaurar.
5. (3 min) Alternativas consideradas (ORM, lock pessimista com `SELECT ... FOR UPDATE`, `tsrange`), limites e pendências.
6. (2 min) Como usei IA e como verifiquei.

## Fase 7 — Bônus, só se sobrar tempo

- [ ] Swagger (`@nestjs/swagger`) em `/docs`.
- [ ] Uma tela Next.js mínima: uma timeline por recurso, um formulário de reserva e um botão de cancelar.
- [ ] CI no GitHub Actions rodando `test`, `test:e2e` e `test:pg`.

---

## Checklist de entrega

- [ ] Repositório público ou privado (pedir os usuários de leitura) e o **hash completo** do commit avaliado.
- [ ] Link do vídeo, acessível sem senha.
- [ ] Caso 02, foco e tempo aproximado na mensagem.
- [ ] Clonar em uma pasta limpa e seguir o README do zero, para confirmar que funciona.
