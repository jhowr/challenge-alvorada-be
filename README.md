# Reservas sem conflito — Caso 02

Solução do [Caso 02 — Reservas sem conflito](https://github.com/Alvorada-Dev/desafios-tecnicos/blob/main/casos/02-reservas-de-recursos.md) do desafio técnico da Alvorada.

| | |
|---|---|
| **Caso** | 02 — Reservas sem conflito |
| **Foco** | Back-end e modelagem de dados: API NestJS + PostgreSQL |
| **Tempo dedicado** | _preencher_ |
| **Vídeo** | _link do vídeo_ |

Uma API que diz se um recurso (sala ou equipamento) pode ser reservado em um período, cria e cancela reservas e permite consultá-las. A regra central, de que **duas reservas ativas do mesmo recurso nunca se sobrepõem**, é garantida em duas camadas:

1. **No service**, que valida a entrada e explica cada recusa (qual campo está inválido, quais reservas conflitam).
2. **No PostgreSQL**, com um `EXCLUDE USING gist` sobre `int4range`, que mantém a regra mesmo com requisições concorrentes. O desafio dispensa concorrência, mas um teste prova que ela está coberta.

## Como rodar

Pré-requisitos: **Node 22+**, **pnpm 10+** e, só para o modo Postgres, **Docker**.

```bash
pnpm install

# Testes unitários e e2e (não precisam de Docker)
pnpm test          # regras de negócio (services, validator, período, ordenação)
pnpm test:e2e      # API HTTP com repositórios em memória

# Testes de integração com Postgres (sobe um container via Testcontainers)
pnpm test:pg

pnpm test:all      # os três acima
```

### Demo reproduzível

```bash
pnpm demo                         # compila, sobe a API em memória numa porta livre e roda o cenário
```

A demo usa um cenário diferente do enunciado (uma sala e um projetor num dia de trabalho) e imprime, a cada passo, o resultado **esperado** e o **obtido**. Ela termina com código ≠ 0 se algum passo divergir.

```
3. ROOM-A: "planning" for [930, 1030) overlaps retro only
   POST /bookings {"id":"planning","resourceId":"ROOM-A","start":930,"end":1030}
   expected: 409 ["conflict",["retro"]]
   actual:   409 ["conflict",["retro"]]  ✔
...
14/14 steps matched the expectation.
```

Para rodar o mesmo cenário contra o Postgres:

```bash
pnpm db:reset                     # docker compose com banco limpo (porta 54329)
DB_DRIVER=postgres pnpm demo
```

### Subir a API

```bash
pnpm start:dev                            # em memória, http://localhost:3000
pnpm db:up && DB_DRIVER=postgres pnpm start:dev   # Postgres; migrations e seed rodam no boot
```

O [requests.http](requests.http) tem as chamadas prontas para o REST Client (VS Code) ou o HTTP Client do JetBrains.

Variáveis de ambiente (ver [.env.example](.env.example)): `PORT` (3000), `DB_DRIVER` (`memory` ou `postgres`) e `DATABASE_URL` (por padrão aponta para o banco do `docker-compose.yml`).

## API

| Método e rota | Sucesso | Erros |
|---|---|---|
| `GET /resources` | 200 lista de ids | — |
| `GET /resources/:resourceId/availability?start=&end=` | 200 `{ available, conflicts }` | 400 `validation_error`, 404 `resource_not_found` |
| `POST /bookings` `{ id, resourceId, start, end }` | 201 reserva criada | 400 `validation_error`, 404 `resource_not_found`, 409 `id_already_used`, 409 `conflict` |
| `GET /bookings?status=&resourceId=` | 200 lista em ordem crescente de id | 400 `validation_error` |
| `GET /bookings/:id` | 200 reserva | 404 `booking_not_found` |
| `POST /bookings/:id/cancellation` | 200 `{ outcome: "cancelled" \| "already_cancelled", booking }` | 404 `booking_not_found` |

Todo erro tem o formato `{ "code": "...", "message": "...", ...detalhes }`. O cancelamento é um `POST` em um sub-recurso, e não `DELETE`, porque a reserva continua existindo com status `cancelled`.

### Termos do enunciado no código

O código está todo em inglês. A correspondência com o enunciado:

| Enunciado | Código |
|---|---|
| reserva, recurso | `booking`, `resource` |
| `inicio`, `fim` | `start`, `end` |
| ativa, cancelada | `active`, `cancelled` |
| `ja_cancelada` | `already_cancelled` |

## Regras implementadas

As regras do enunciado estão numeradas em [docs/PRD.md](docs/PRD.md) (BR1 a BR14), e os testes citam a regra no nome. Os pontos de interpretação:

- **Período `[start, end)`** com inteiros de 32 bits. `start < end`; um período vazio ou invertido é inválido.
- **Ordem de validação**: quando há mais de um problema, vence o primeiro desta ordem: dados inválidos, recurso inexistente, id em uso, conflito. A resposta de dados inválidos lista todos os campos com problema de uma vez.
- **Ordem crescente de id** é a ordem de bytes (`"10" < "9" < "B" < "a"`), igual em memória e no Postgres (ver [docs/DECISIONS.md](docs/DECISIONS.md)).
- **Uma tentativa recusada** não grava nada, então o id continua livre. **Uma reserva criada** guarda o id para sempre, mesmo cancelada.

## Arquitetura

```
src/
  modules/
    resources/     controllers/ services/ repositories/   lista fixa de recursos
    bookings/      controllers/ services/ repositories/   reservas e disponibilidade
  shared/          Result<T, E>, ordenação de ids, filtro de erros HTTP, banco e migrations
test/
  e2e/             API HTTP (supertest, memória)
  integration/     suíte de contrato dos repositórios (memória e Postgres) e concorrência
scripts/           demo e migrate
```

- **Folder by feature**: cada feature é um módulo Nest com `controllers/`, `services/` e `repositories/`. O controller de disponibilidade fica em `bookings/`, mesmo respondendo em `/resources/...`, porque disponibilidade é uma pergunta sobre reservas. Assim só `bookings` depende de `resources`, nunca o contrário.
- **Erros esperados são valores** (`Result<T, E>`), não exceções. O compilador obriga cada chamador a tratar cada caso, e os controllers só traduzem `code` em status HTTP.
- **Repositório com duas implementações** (`InMemory*` e `Postgres*`), escolhidas por `DB_DRIVER`. A **mesma suíte de contrato** roda contra as duas, o que prova que a API se comporta igual com qualquer uma.
- **SQL puro com `pg`, sem ORM**: `int4range` e `EXCLUDE` não têm bom suporte em Prisma ou TypeORM, e o schema é o coração da solução ([001_initial.sql](src/shared/database/migrations/001_initial.sql)).

## Testes

110 testes: 65 unitários (ao lado de cada service), 21 e2e e 24 de integração.

### Três testes que ajudam a entender a solução

1. **Limite do período semiaberto**: [period.spec.ts](src/modules/bookings/services/period.spec.ts) e "BR3 — a booking may start exactly when another ends" em [bookings.service.spec.ts](src/modules/bookings/services/bookings.service.spec.ts).
   `[10,20)` e `[20,30)` convivem; `[19,21)` conflita com as duas. **Pega** o erro de usar `<=` em vez de `<` na comparação. Ao trocar o operador, 8 testes falham, inclusive o exemplo do enunciado.

2. **Interação entre cancelamento e identificador**: "BR6 — an id is never reused, even after cancellation" e "BR5 — an attempt rejected by … does not take the id".
   Cancelar libera o **horário** mas não o **id**, e uma tentativa recusada não ocupa o id. **Pega** dois erros opostos: implementar o cancelamento como remoção da linha (o id voltaria a ficar livre) e gravar antes de validar (o id seria ocupado por uma tentativa recusada).

3. **Concorrência no Postgres**: "accepts exactly one of many concurrent overlapping bookings" em [postgres-bookings.repository.int-spec.ts](test/integration/postgres-bookings.repository.int-spec.ts).
   Dez requisições sobrepostas, forçadas a passar todas pelas pré-checagens do service antes de qualquer insert. Exatamente uma é aceita e nove recebem `conflict`. **Pega** a corrida "checa e depois insere", que nenhum teste sequencial enxerga: sem o `EXCLUDE`, as dez são aceitas.

## Decisões

O detalhamento, com como cada uma foi investigada, está em [docs/DECISIONS.md](docs/DECISIONS.md):

1. **O teste de concorrência precisava de uma barreira.** A primeira versão passava mesmo sem o constraint, ou seja, não provava nada. Depois de corrigido, o teste revelou deadlocks (`40P01`) entre inserts simultâneos, que viraram retry no repositório.
2. **Ordem de ids com `COLLATE "C"` e imagem Debian nos testes.** Na imagem Alpine, o teste de ordenação passaria mesmo sem o `COLLATE "C"`.

## Uso de IA

_Revisar e ajustar com a sua experiência._ A implementação foi feita em par com o Claude Code: primeiro um PRD e um plano revisados por mim (estrutura por feature, nomes em inglês, testes unitários ao lado dos services), depois a execução fase a fase. A verificação não dependeu de confiar no código gerado:

- **Testes por regra** escritos junto com o código, com o nome da regra do PRD.
- **Testes de mutação manuais**: trocar `<` por `<=` no `overlaps`, remover o `EXCLUDE` e remover o `COLLATE "C"`, e conferir que os testes certos falham. Dois desses experimentos mostraram que testes que passavam não provavam o que diziam (ver Decisões).
- **Rodar a suíte num clone limpo**, como quem avalia faria. Foi assim que apareceu o deadlock intermitente sob contenção.
- **Demo contra o servidor real** em memória e no Postgres, conferindo as linhas direto no banco com `psql`.

## Limites e pendências

- O tempo é um inteiro de 32 bits (`int4range`). Trocar para `int8range` é simples; para decimais seria `numrange`.
- Recursos são uma lista fixa ([resources.seed.ts](src/modules/resources/resources.seed.ts)); não há cadastro.
- Sem paginação na listagem, sem autenticação, sem recorrência (fora do escopo do enunciado).
- No Postgres, se uma reserva concorrente for aceita e cancelada entre o insert recusado e a releitura dos conflitos, o erro `conflict` pode vir com a lista vazia. A garantia de não sobreposição não é afetada.
- Uma tela em Next.js ficou de fora; o foco foi o back-end.
