# Reservas sem conflito — Caso 02

Solução do [Caso 02 — Reservas sem conflito](https://github.com/Alvorada-Dev/desafios-tecnicos/blob/main/casos/02-reservas-de-recursos.md) do desafio técnico da Alvorada.

| | |
|---|---|
| **Caso** | 02 — Reservas sem conflito |
| **Foco** | Back-end e modelagem de dados: API NestJS + PostgreSQL |
| **Tempo dedicado** | _preencher_ |
| **Vídeo** | _link do vídeo_ |

Uma API que diz se um recurso (sala ou equipamento) pode ser reservado em um período, cria e cancela reservas e permite consultá-las.

**A entrega tem duas partes:**
- **Modo em memória** (padrão): cumpre o enunciado e roda sem Docker.
- **Modo Postgres** (o diferencial): leva a regra central para o banco, de modo que **duas reservas ativas do mesmo recurso nunca se sobrepõem**, mesmo com várias instâncias da API e requisições concorrentes. A regra é garantida em três camadas:
  1. **O service** valida a entrada e explica cada recusa (qual campo está inválido, quais reservas conflitam).
  2. **Um lock na linha do recurso** serializa as escritas de cada recurso. Sem ele, a contenção vira deadlock (ver [Decisões](#decisões)).
  3. **Um `EXCLUDE USING gist` sobre `int4range`** garante a regra para qualquer escritor, inclusive SQL direto.

## Como rodar

Pré-requisitos: **Node 22+**, **pnpm 10+** e, só para o modo Postgres, **Docker**.

```bash
pnpm install

pnpm test          # unitários: regras, validator, período, ordenação (sem Docker)
pnpm test:e2e      # API HTTP com o driver em memória (sem Docker)
pnpm test:pg       # contrato dos repositórios, a mesma suíte HTTP e a concorrência
                   # no Postgres (sobe um container via Testcontainers)
pnpm test:all      # os três
pnpm test:web      # painel: convenção de horas, sessão e mensagens de erro
```

### Demo reproduzível

```bash
pnpm demo          # compila, sobe a API em memória numa porta livre e roda o cenário
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
pnpm dev:api                                      # em memória, http://localhost:3000
pnpm db:up && DB_DRIVER=postgres pnpm dev:api     # Postgres; migrations e seed rodam no boot
```

O [requests.http](apps/api/requests.http) tem as chamadas prontas para o REST Client (VS Code) ou o HTTP Client do JetBrains.

Configuração por variáveis de ambiente, validada no boot ([config.ts](apps/api/src/shared/config.ts)):

| Variável | Padrão |
|---|---|
| `PORT` | `3000` |
| `DB_DRIVER` | `memory` (ou `postgres`) |
| `DATABASE_URL` | o banco do `docker-compose.yml` |

### Painel web (opcional)

Um painel em Next.js + shadcn/ui ([apps/web](apps/web)) para ver a regra funcionando: uma agenda por hora em que se arrasta um período e a API responde na hora se está livre ou com quais reservas conflita, mais a lista de reservas com filtros e cancelamento.

```bash
pnpm dev           # API em http://localhost:3000 e painel em http://localhost:3001
```

Entre com `avaliador` / `alvorada` e clique em **Carregar cenário** para criar um dia de exemplo. O login existe só no Next (cookie httpOnly assinado); a API continua sem autenticação, como pede o enunciado. Cada inteiro de `start`/`end` é lido como uma hora desde 1970-01-01 00:00 UTC e mostrado no fuso do navegador, sempre com o inteiro cru ao lado ([DECISIONS.md §3](docs/DECISIONS.md)).

| Variável (painel) | Padrão |
|---|---|
| `API_URL` | `http://localhost:3000` |
| `PANEL_USER` / `PANEL_PASSWORD` | `avaliador` / `alvorada` |
| `SESSION_SECRET` | um segredo de desenvolvimento; obrigatório em produção |

Ver [apps/web/.env.example](apps/web/.env.example).

## API

| Método e rota | Sucesso | Erros |
|---|---|---|
| `GET /resources` | 200 lista de ids | — |
| `GET /resources/:resourceId/availability?start=&end=` | 200 `{ resourceId, start, end, available, conflicts }` | 400 `validation_error`, 404 `resource_not_found` |
| `POST /bookings` `{ id, resourceId, start, end }` | 201 reserva criada | 400 `validation_error`, 404 `resource_not_found`, 409 `id_already_used`, 409 `conflict` |
| `GET /bookings?status=&resourceId=` | 200 lista em ordem crescente de id | 400 `validation_error` |
| `GET /bookings/:id` | 200 reserva | 404 `booking_not_found` |
| `POST /bookings/:id/cancellation` | 200 `{ outcome: "cancelled" \| "already_cancelled", booking }` | 404 `booking_not_found` |
| `GET /health` | 200 `{ status, driver }` | 503 `database_unavailable` |

Todo erro, inclusive os do próprio framework (JSON malformado, 413, 415, rota inexistente), tem o formato `{ "code": "...", "message": "...", ...detalhes }`. O cancelamento é um `POST` em um sub-recurso, e não `DELETE`, porque a reserva continua existindo com status `cancelled`.

## Regras implementadas

As regras do enunciado estão numeradas em [docs/PRD.md](docs/PRD.md) (BR1 a BR14), e os testes citam a regra no nome. Onde o enunciado deixa margem, a escolha e o motivo:

- **Nomes em inglês, inclusive `already_cancelled` no lugar de `ja_cancelada`.** Foi uma decisão consciente: todo o código está em inglês, e o retorno mantém o significado pedido. A correspondência completa está abaixo.
- **Período `[start, end)` com inteiros de 32 bits.** `start < end`; um período vazio ou invertido é inválido. É o limite do `int4range`.
- **Ordem de validação**: quando há mais de um problema, vence o primeiro desta ordem:
  1. dados inválidos;
  2. recurso inexistente;
  3. id em uso;
  4. conflito.
  
  O motivo é responder sempre o erro mais útil. Sem dados válidos não há o que avaliar, e sem recurso não há id nem horário a discutir. O id em uso vem antes do conflito porque não se resolve trocando o horário, enquanto o conflito se resolve. A resposta de dados inválidos lista todos os campos com problema de uma vez.
- **Ordem crescente de id = ordem de bytes** (`"10" < "9" < "B" < "a"`), igual em memória e no Postgres. É determinística e não depende de locale (ver [Decisões](#decisões)).
- **Uma tentativa recusada** não grava nada, então o id continua livre. **Uma reserva criada** guarda o id para sempre, mesmo cancelada.
- **Identificadores** não podem ter caracteres de controle nem UTF-16 malformado. Sem essa regra, o Postgres rejeitaria um `NUL` com 500 e trocaria um surrogate solto por U+FFFD, e os dois modos divergiriam. O limite de 64 caracteres do id é contado em unidades UTF-16.

| Enunciado | Código |
|---|---|
| reserva, recurso | `booking`, `resource` |
| `inicio`, `fim` | `start`, `end` |
| ativa, cancelada | `active`, `cancelled` |
| `ja_cancelada` | `already_cancelled` |

## Arquitetura

```
src/
  modules/
    resources/     controllers/ services/ repositories/   lista fixa de recursos
    bookings/      controllers/ services/ repositories/   reservas e disponibilidade
    health/        controllers/
  shared/          Result<T, E>, config, ordenação de ids, filtro de erros HTTP, banco
test/
  e2e/             suíte HTTP (supertest); roda em memória aqui e no Postgres em integration/
  integration/     contrato dos repositórios, a suíte HTTP no Postgres e a concorrência
load/              harness de race conditions e benchmark (autocannon)
scripts/           demo e migrate
```

- **Folder by feature**: cada feature é um módulo Nest com `controllers/`, `services/` e `repositories/`.
- **Erros esperados são valores** (`Result<T, E>`), não exceções. O compilador obriga cada chamador a tratar cada caso, e os controllers só traduzem `code` em status HTTP.
- **A validação fica nos services**, e não em pipes, porque eles são a fronteira das regras BR1 e BR2 para qualquer chamador, não só o HTTP.
- **Repositório com duas implementações** (`InMemory*` e `Postgres*`), escolhidas por `DB_DRIVER`. A mesma suíte de contrato e a mesma suíte HTTP rodam contra as duas.
- **SQL puro com `pg`, sem ORM**: `int4range`, `EXCLUDE` e o lock de linha são o coração da solução, e não têm bom suporte em ORMs ([001_initial.sql](apps/api/src/shared/database/migrations/001_initial.sql)).

## Testes

175 testes na API: 70 unitários (ao lado de cada service), 41 e2e e 64 de integração no Postgres. O painel tem mais 42 unitários (`pnpm test:web`).

### Três testes que ajudam a entender a solução

1. **Limite do período semiaberto**: [booking-period.spec.ts](apps/api/src/modules/bookings/booking-period.spec.ts) e "BR3 — a booking may start exactly when another ends" em [bookings.service.spec.ts](apps/api/src/modules/bookings/services/bookings.service.spec.ts). Roda sem Docker.
   `[10,20)` e `[20,30)` convivem; `[19,21)` conflita com as duas. **Pega** o erro de usar `<=` em vez de `<`. Ao trocar o operador, 8 testes falham, inclusive o exemplo do enunciado.

2. **Interação entre cancelamento e identificador**: "BR6 — an id is never reused, even after cancellation" e "BR5 — an attempt rejected by … does not take the id". Roda sem Docker.
   Cancelar libera o **horário** mas não o **id**, e uma tentativa recusada não ocupa o id. **Pega** dois erros opostos: implementar o cancelamento como remoção da linha (o id ficaria livre) e gravar antes de validar (uma tentativa recusada ocuparia o id).

3. **Concorrência no Postgres**: "accepts exactly one of many concurrent overlapping bookings" em [postgres-bookings.repository.int-spec.ts](apps/api/test/integration/postgres-bookings.repository.int-spec.ts). Precisa de Docker.
   Dez requisições sobrepostas são forçadas a passar todas pelas pré-checagens do service antes de qualquer escrita. Exatamente uma é aceita, e as nove outras recebem `conflict` com a lista exata de conflitos. **Pega** a corrida "checa e depois insere", que nenhum teste sequencial enxerga. Os testes vizinhos fixam cada camada: um falha sem o lock por recurso e outro falha sem o `EXCLUDE`.

## Testes de carga e race conditions

Precisam do Postgres do compose (`pnpm db:up`).

```bash
pnpm load:race                       # em memória, 1 instância
DB_DRIVER=postgres pnpm load:race    # 3 instâncias da API compartilhando o banco
DB_DRIVER=postgres pnpm load:bench   # throughput e latência, com 100 mil reservas no banco
```

**[load/race.ts](apps/api/load/race.ts)** dispara cenários concorrentes, com 200 requisições simultâneas cada, distribuídas entre as instâncias. No fim, confere os invariantes pela API e por SQL: nenhuma sobreposição ativa, nenhum id aceito perdido ou duplicado, nenhum 5xx, conflitos sempre listados e ordenados. Resultado com 3 instâncias no Postgres:

| Cenário | Resultado |
|---|---|
| 200 ids diferentes no mesmo horário | 1 aceita, 199 `conflict` |
| 200 períodos em escada, cada um sobrepondo os vizinhos | conjunto aceito sem sobreposição |
| 200 requisições com o mesmo id em horários livres | 1 aceita, 199 `id_already_used` |
| 200 cancelamentos da mesma reserva | 1 `cancelled`, 199 `already_cancelled` |
| Cancelar uma reserva enquanto 200 tentam o mesmo horário | no máximo 1 nova aceita |
| Caos: 50 workers × 10 s de create, cancel e availability | ~32 mil requisições, 0 violações, 0 5xx |
| Derrubar todas as conexões do banco sob carga | as instâncias sobrevivem e voltam a atender |

**[load/bench.ts](apps/api/load/bench.ts)** usa o autocannon com 50 conexões, uma instância e o gerador de carga na mesma máquina (8 núcleos). Os números servem para comparar cenários entre si, não como capacidade absoluta.

| Cenário | Memória req/s (p99) | Postgres, 100 mil reservas, req/s (p99) |
|---|---|---|
| Availability, período livre | 31.360 (3 ms) | 6.690 (17 ms) |
| Availability com 50 conflitos | 32.203 (3 ms) | 2.762 (29 ms) |
| Reserva por id | 35.128 (2 ms) | 12.270 (8 ms) |
| POST sem contenção | 4.198 (32 ms) | 1.681 (44 ms) |
| POST disputando o mesmo horário (409) | 3.502 (28 ms) | 4.247 (25 ms) |

O POST em memória é mais lento que as leituras porque o repositório em memória varre todas as reservas a cada checagem de conflito (O(n)). Isso é aceitável para o modo de demonstração; no Postgres, a mesma consulta usa o índice GiST.

## Decisões

O detalhamento, com como cada uma foi investigada, está em [docs/DECISIONS.md](docs/DECISIONS.md):

1. **Concorrência: do teste que não provava nada ao lock por recurso.** O primeiro teste de concorrência passava mesmo sem o constraint. Depois de corrigido, ele revelou deadlocks. O retry não aguentou o teste de carga (19 erros 500 e 10 s virando 90 s), e a solução foi serializar as escritas por recurso, mantendo o `EXCLUDE` como garantia final.
2. **Ordem de ids com `COLLATE "C"` e imagem Debian nos testes.** Na imagem Alpine, o teste de ordenação passaria mesmo sem o `COLLATE "C"`.

## Uso de IA

Usei o Claude Code em par durante todo o trabalho. Primeiro escrevemos um PRD e um plano, que eu revisei e ajustei: estrutura por feature, tudo em inglês, testes unitários ao lado dos services e e2e separados. Depois a implementação foi feita fase a fase. Na sequência, pedi revisões independentes com quatro focos (avaliação do desafio, Postgres, arquitetura NestJS e QA adversarial) e testes de carga. Muito do que mudou veio daí (ver [DECISIONS.md](docs/DECISIONS.md)).

Não confiei no código só porque os testes passavam. Como verifiquei:

- **Testes por regra**, com o nome da regra do PRD.
- **Mutações manuais** para provar que cada teste importante falha quando deve. Troquei `<` por `<=`, removi o `EXCLUDE`, removi o lock e removi o `COLLATE "C"`. Duas vezes um teste que passava não provava o que dizia, e foi corrigido.
- **Rodar tudo num clone limpo**, como quem avalia faria. Foi assim que apareceu o deadlock intermitente.
- **Testes de carga com verificação de invariantes no SQL.** Foi por eles que apareceram problemas que nenhum teste unitário mostraria: o retry insuficiente, o processo caindo com uma conexão derrubada e o vazamento de listeners de uma primeira correção.

## Limites e pendências

- O tempo é um inteiro de 32 bits (`int4range`). O painel lê cada inteiro como uma hora desde 1970-01-01 00:00 UTC (ver [DECISIONS.md](docs/DECISIONS.md)), o que cobre qualquer ano de quatro dígitos. Para minutos, a troca seria para `int8range`; para decimais, `numrange`.
- Recursos são uma lista fixa ([resources.seed.ts](apps/api/src/modules/resources/resources.seed.ts)); não há cadastro.
- `GET /bookings` não tem paginação. Com volume, o próximo passo seria paginação por keyset sobre `id` e um índice `(resource_id, id)`.
- Escritas no mesmo recurso são serializadas. É o preço da garantia: recursos diferentes escalam em paralelo, mas um único recurso muito disputado vira fila.
- No shutdown, as conexões que ainda estavam na fila do sistema operacional são recusadas (`ECONNRESET`). As requisições já em andamento terminam, e conferi no banco que nenhuma escrita se perde.
- As migrations rodam no boot quando `DB_DRIVER=postgres`. Em produção, seriam um passo separado do deploy (`pnpm db:migrate` já existe).
- O painel supõe que o servidor Next e o navegador estão no mesmo fuso (o caso da demo local): o servidor recorta o dia pelo fuso dele, e o navegador formata pelo seu.
- Fora do escopo na API: autenticação, recorrência, rate limiting e OpenAPI. O painel tem um login simples só para a demo.
