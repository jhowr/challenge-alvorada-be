# Reservas sem conflito — Caso 02

Solução do [Caso 02 — Reservas sem conflito](https://github.com/Alvorada-Dev/desafios-tecnicos/blob/main/casos/02-reservas-de-recursos.md) do desafio técnico da Alvorada.

| | |
|---|---|
| **Caso** | 02 — Reservas sem conflito |
| **Foco** | Back-end e modelagem de dados: API NestJS + PostgreSQL |
| **Tempo dedicado** | 4 horas |
| **Vídeo** | https://drive.google.com/file/d/19kcGUp7vjl_D6j2Y_OWLZGzwmFC9ZXd3/view?usp=sharing |

Uma API que diz se um recurso (sala ou equipamento) pode ser reservado em um período, cria e cancela reservas e permite consultá-las.

Os dados ficam no PostgreSQL, e **duas reservas ativas do mesmo recurso nunca se sobrepõem**, mesmo com várias instâncias da API e requisições concorrentes. A regra é garantida em três camadas:

1. **Os DTOs e o service** validam a entrada e explicam cada recusa (qual campo está inválido, quais reservas conflitam).
2. **Um lock na linha do recurso** serializa as escritas de cada recurso. Sem ele, a contenção vira deadlock (ver [Decisões](#decisões)).
3. **Um `EXCLUDE USING gist` sobre `int4range`** garante a regra para qualquer escritor, inclusive SQL direto.

O enunciado permite que tudo rode em memória. Optei por exigir o banco: a API só sobe com um Postgres acessível (ver [DECISIONS.md §5](docs/DECISIONS.md#5-dtos-na-borda-http-e-só-postgres)).

## Como rodar

### Só com Docker

```bash
docker compose up --build        # Postgres + API em http://localhost:3000
```

As migrations (schema e recursos) rodam quando a API sobe. Para conferir o exemplo do enunciado:

```bash
curl -X POST localhost:3000/bookings -H 'content-type: application/json' -d '{"id":"A","resourceId":"R1","start":10,"end":20}'   # 201
curl -X POST localhost:3000/bookings -H 'content-type: application/json' -d '{"id":"B","resourceId":"R1","start":20,"end":30}'   # 201
curl -X POST localhost:3000/bookings -H 'content-type: application/json' -d '{"id":"C","resourceId":"R1","start":19,"end":21}'   # 409 conflict: A, B
curl -X POST localhost:3000/bookings -H 'content-type: application/json' -d '{"id":"C","resourceId":"R2","start":19,"end":21}'   # 201
curl 'localhost:3000/resources/R1/availability?start=19&end=21'                                                                  # conflitos A e B
curl -X POST localhost:3000/bookings/A/cancellation                                                                             # cancelled
curl 'localhost:3000/resources/R1/availability?start=10&end=20'                                                                  # available: true
curl -X POST localhost:3000/bookings -H 'content-type: application/json' -d '{"id":"A","resourceId":"R1","start":10,"end":20}'   # 409 id_already_used
```

O [requests.http](requests.http) tem as mesmas chamadas e outras, prontas para o REST Client (VS Code) ou o HTTP Client do JetBrains. `docker compose down -v` apaga tudo.

### Com Node (testes, demo e carga)

Pré-requisitos: **Node 24** (22.13+ é o mínimo das dependências), **pnpm 10+** e **Docker**. Se a API do Docker estiver no ar, pare-a antes (`docker compose stop api`), porque o `start:dev` usa a mesma porta 3000.

```bash
pnpm install

pnpm test          # unitários: services (com mocks) e DTOs (sem Docker)
pnpm test:e2e      # API HTTP inteira contra um Postgres descartável (Testcontainers)
pnpm test:pg       # repositório e concorrência no Postgres (Testcontainers)
pnpm test:all      # os três
```

### Demo reproduzível

```bash
pnpm db:up         # Postgres do docker compose (porta 54329)
pnpm demo          # migra, apaga as reservas, sobe a API numa porta livre e roda o cenário
```

A demo usa um cenário diferente do enunciado (uma sala e um projetor num dia de trabalho) e imprime, a cada passo, o resultado **esperado** e o **obtido**. Ela termina com código ≠ 0 se algum passo divergir. A API só vê inteiros; na demo, `900` é lido como 9:00 apenas para facilitar a leitura.

```
3. ROOM-A: "planning" for [930, 1030) overlaps retro only
   POST /bookings {"id":"planning","resourceId":"ROOM-A","start":930,"end":1030}
   expected: 409 ["conflict",["retro"]]
   actual:   409 ["conflict",["retro"]]  ✔
...
14/14 steps matched the expectation.
```

### Subir a API em modo dev

```bash
pnpm db:up && pnpm start:dev     # http://localhost:3000; as migrations (schema e recursos) rodam no boot
```

Configuração por variáveis de ambiente, validada no boot ([env.config.ts](src/config/env.config.ts)). A conexão e o pool ficam em [database.config.ts](src/config/database.config.ts).

| Variável | Obrigatória | No [`.env`](.env) |
|---|---|---|
| `PORT` | não (padrão `3000`) | `3000` |
| `DATABASE_URL` | **sim**: sem ela a API não sobe | o banco do `docker-compose.yml` |

O `.env` é versionado com os valores de desenvolvimento, que não têm segredo nenhum, e o `.env.local` (ignorado pelo git) sobrescreve o que for pessoal. A precedência é: variável de ambiente real > `.env.local` > `.env`. A API, os scripts e os testes de carga leem os dois arquivos pelo mesmo `loadConfig()`.

### Painel web (opcional)

Há um painel em Next.js + shadcn/ui, num repositório separado (`alvorada-web`), para ver a regra funcionando: uma agenda do dia em que se arrasta um período, em passos de 15 minutos, e a API responde na hora se está livre ou com quais reservas conflita. Ele é um complemento e não faz parte da entrega. As duas decisões que o ligam a esta API estão em [DECISIONS.md §3](docs/DECISIONS.md#3-painel-web-login-só-no-next-e-cada-inteiro-como-um-minuto): o login fica só no Next, e cada inteiro é lido como um minuto.

## API

| Método e rota | Sucesso | Erros |
|---|---|---|
| `GET /resources` | 200 lista de ids | — |
| `GET /resources/:resourceId/availability?start=&end=` | 200 `{ resourceId, start, end, available, conflicts }` | 400 `validation_error`, 404 `resource_not_found` |
| `POST /bookings` `{ id, resourceId, start, end }` | 201 reserva criada | 400 `validation_error`, 404 `resource_not_found`, 409 `id_already_used`, 409 `conflict` |
| `GET /bookings?status=&resourceId=` | 200 lista em ordem crescente de id | 400 `validation_error` |
| `GET /bookings/:id` | 200 reserva | 400 `validation_error`, 404 `booking_not_found` |
| `POST /bookings/:id/cancellation` | 200 `{ outcome: "cancelled" \| "already_cancelled", booking }` | 400 `validation_error`, 404 `booking_not_found` |
| `GET /health` | 200 `{ status: "ok" }` | 503 `database_unavailable` |

Todo erro, inclusive os do próprio framework (JSON malformado, 413, 415, rota inexistente), tem o formato `{ "code": "...", "message": "...", ...detalhes }`. Campos ou parâmetros que a rota não declara são recusados com 400 (`"reason": "is not allowed"`), e as respostas trazem só os campos declarados nos DTOs. O cancelamento é um `POST` em um sub-recurso, e não `DELETE`, porque a reserva continua existindo com status `cancelled`.

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
- **Ordem crescente de id = ordem de bytes** (`"10" < "9" < "B" < "a"`), com `COLLATE "C"` no Postgres. É determinística e não depende de locale (ver [Decisões](#decisões)).
- **Uma tentativa recusada** não grava nada, então o id continua livre. **Uma reserva criada** guarda o id para sempre, mesmo cancelada.
- **Identificadores** não podem ter caracteres de controle nem UTF-16 malformado. Sem essa regra, o Postgres rejeitaria um `NUL` com 500 e trocaria um surrogate solto por U+FFFD, gravando algo diferente do que foi enviado. O limite de 64 caracteres do id é contado em unidades UTF-16.

| Enunciado | Código |
|---|---|
| reserva, recurso | `booking`, `resource` |
| `inicio`, `fim` | `start`, `end` |
| ativa, cancelada | `active`, `cancelled` |
| `ja_cancelada` | `already_cancelled` |

## Arquitetura

```
src/
  config/          env validado (zod) e conexão TypeORM: pool, timeouts, migrations no boot
  migrations/      schema do Postgres e a lista fixa de recursos (escritas à mão)
  modules/
    resources/     controllers/ services/ repositories/ entities/        lista fixa de recursos
    bookings/      controllers/ dto/ services/ repositories/ entities/   reservas e disponibilidade
    health/        controllers/ dto/
  shared/          DomainError, validadores e ValidationPipe, filtro de erros HTTP
test/
  e2e/             API HTTP inteira (supertest) contra um Postgres descartável
  integration/     repositório Postgres, constraints e concorrência
load/              harness de race conditions e benchmark (autocannon)
scripts/           demo e migrate
```

- **Folder by feature**: cada feature é um módulo Nest com `controllers/`, `services/`, `repositories/` e, quando precisa, `dto/` e `entities/`.
- **DTOs por controller**: um arquivo em `dto/` por controller, com as classes `*Request` (validadas pelo class-validator num `ValidationPipe` global) e `*Response` (montadas pelo `ClassSerializerInterceptor` do Nest, a partir do `@SerializeOptions({ type })` de cada rota, só com os campos marcados com `@Expose()`). Os controllers só chamam o service e devolvem o que ele retorna: não têm nenhum `unknown`, e os services recebem tipos já validados.
- **Erros esperados são classes de domínio** que os services lançam (`booking.errors.ts`), filhas de `DomainError`. Cada uma tem `code`, mensagem, os dados do erro e um `kind` (`not_found` ou `conflict`). O filtro global de erros traduz o `kind` em 404 ou 409, então nem services nem controllers conhecem HTTP.
- **Um repositório por entidade** (`BookingsRepository`, `ResourcesRepository`), com as queries dentro. Ele recebe o `Repository<Entity>` do TypeORM por `@InjectRepository`, e os services o injetam direto. Os testes unitários dos services usam mocks dele.
- **TypeORM, com o núcleo em SQL explícito**: o TypeORM cuida da conexão, das migrations e das consultas simples. A regra central (lock do recurso, checagem de conflito sobre `int4range` e a constraint `EXCLUDE`) continua escrita à mão no repositório e na [migration](src/migrations/1793318400000-InitialSchema.ts). Ver [DECISIONS.md](docs/DECISIONS.md#4-typeorm-entrou-depois-pensando-no-crescimento).

## Testes

139 testes: 72 unitários (ao lado de cada service e DTO), 50 e2e e 17 de integração, os dois últimos contra o Postgres.

### Três testes que ajudam a entender a solução

1. **Limite do período semiaberto**: "BR3 — accepts adjacent periods and rejects overlaps" em [bookings.repository.int-spec.ts](test/integration/bookings.repository.int-spec.ts) e "accepts the example from the challenge statement" em [bookings.e2e-spec.ts](test/e2e/bookings.e2e-spec.ts).
   `[10,20)` e `[20,30)` convivem; `[19,21)` conflita com as duas. **Pega** o erro de fechar o intervalo. Ao trocar o `'[)'` da consulta de conflitos por `'[]'`, 5 testes falham, inclusive o exemplo do enunciado.

2. **Interação entre cancelamento e identificador**: "BR6 — an id is never reused, even by a cancelled booking" em [bookings.service.spec.ts](src/modules/bookings/services/bookings.service.spec.ts) e "BR5 — an attempt rejected by … does not take the id" em [bookings.e2e-spec.ts](test/e2e/bookings.e2e-spec.ts).
   Cancelar libera o **horário** mas não o **id**, e uma tentativa recusada não ocupa o id. **Pega** dois erros opostos: implementar o cancelamento como remoção da linha (o id ficaria livre) e gravar antes de validar (uma tentativa recusada ocuparia o id).

3. **Concorrência no Postgres**: "accepts exactly one of many concurrent overlapping bookings" em [bookings.repository.int-spec.ts](test/integration/bookings.repository.int-spec.ts). Precisa de Docker.
   Dez requisições sobrepostas são forçadas a passar todas pelas pré-checagens do service antes de qualquer escrita. Exatamente uma é aceita, e as nove outras recebem `conflict` apontando para a reserva vencedora. **Pega** a corrida "checa e depois insere", que nenhum teste sequencial enxerga. Os testes vizinhos fixam cada camada: um falha sem o lock por recurso e outro falha sem o `EXCLUDE`.

## Testes de carga e race conditions

Usam o Postgres do compose (`pnpm db:up`): migram o banco e **apagam as reservas** antes de rodar.

```bash
pnpm load:race     # 3 instâncias da API compartilhando o banco
pnpm load:bench    # throughput e latência, com 100 mil reservas no banco
```

**[load/race.ts](load/race.ts)** dispara cenários concorrentes, com 200 requisições simultâneas cada, distribuídas entre as instâncias. No fim, confere os invariantes pela API e por SQL: nenhuma sobreposição ativa, nenhum id aceito perdido ou duplicado, nenhum 5xx, conflitos sempre listados e ordenados. Resultado com 3 instâncias no Postgres:

| Cenário | Resultado |
|---|---|
| 200 ids diferentes no mesmo horário | 1 aceita, 199 `conflict` |
| 200 períodos em escada, cada um sobrepondo os vizinhos | conjunto aceito sem sobreposição |
| 200 requisições com o mesmo id em horários livres | 1 aceita, 199 `id_already_used` |
| 200 cancelamentos da mesma reserva | 1 `cancelled`, 199 `already_cancelled` |
| Cancelar uma reserva enquanto 200 tentam o mesmo horário | no máximo 1 nova aceita |
| Caos: 50 workers × 10 s de create, cancel e availability | ~31 mil requisições, 0 violações, 0 5xx |
| Derrubar todas as conexões do banco sob carga | as instâncias sobrevivem e voltam a atender |

**[load/bench.ts](load/bench.ts)** usa o autocannon com 50 conexões, uma instância e o gerador de carga na mesma máquina (8 núcleos). Os números servem para comparar cenários entre si, não como capacidade absoluta.

| Cenário (100 mil reservas no banco) | req/s (p99) |
|---|---|
| Availability, período livre | 5.436 (17 ms) |
| Availability com 50 conflitos | 679 (99 ms) |
| Reserva por id | 10.047 (8 ms) |
| POST sem contenção | 1.447 (64 ms) |
| POST disputando o mesmo horário (409) | 3.825 (25 ms) |

Dois custos medidos estão em [DECISIONS.md](docs/DECISIONS.md): o TypeORM custa de 7% a 17% de req/s (§4), e montar a resposta com o class-transformer custa cerca de dois terços do cenário de availability com 50 conflitos (§5 e §6).

## Decisões

O detalhamento, com o que eu queria conferir, como investiguei e o que concluí, está em [docs/DECISIONS.md](docs/DECISIONS.md). As duas decisões pedidas pelo enunciado são a 1 e a 2; as outras são complementares.

1. **Concorrência: do teste que não provava nada ao lock por recurso.** O primeiro teste de concorrência passava mesmo sem o constraint. Depois de corrigido, ele revelou deadlocks. O retry não aguentou o teste de carga (19 erros 500 e 10 s virando 90 s), e a solução foi serializar as escritas por recurso, mantendo o `EXCLUDE` como garantia final.
2. **Ordem de ids com `COLLATE "C"` e imagem Debian nos testes.** Na imagem Alpine, o teste de ordenação passaria mesmo sem o `COLLATE "C"`.
3. **Painel web: login só no Next e cada inteiro como um minuto.** O painel é opcional e fica em outro repositório; a API continua sem autenticação.
4. **TypeORM para a infraestrutura, núcleo em SQL explícito.** O ORM entrou depois, pensando no crescimento, e cuida de conexão, pool e migrations. O lock por recurso, o `&&` sobre `int4range` e o `EXCLUDE` continuam escritos à mão, e um teste garante que as entities não divergem das migrations.
5. **DTOs na borda HTTP e só Postgres.** A validação saiu dos services para DTOs com class-validator, e o modo em memória foi removido: a API exige um banco configurado e acessível.
6. **Erros de domínio e serialização fora dos controllers.** Os services lançam erros de domínio que um filtro global traduz em 404 ou 409, e as responses saem pelo `ClassSerializerInterceptor` do Nest. Os controllers ficaram com uma linha por rota, ao custo medido de throughput em respostas com listas.

## Uso de IA

Usei o Claude Code em par durante todo o trabalho. Primeiro escrevemos um PRD e um plano, que eu revisei e ajustei: estrutura por feature, tudo em inglês, testes unitários ao lado dos services e e2e separados. Depois a implementação foi feita fase a fase. Na sequência, pedi revisões independentes com quatro focos (avaliação do desafio, Postgres, arquitetura NestJS e QA adversarial) e testes de carga. Muito do que mudou veio daí (ver [DECISIONS.md](docs/DECISIONS.md)).

Não confiei no código só porque os testes passavam. Como verifiquei:

- **Testes por regra**, com o nome da regra do PRD.
- **Mutações manuais** para provar que cada teste importante falha quando deve. Troquei `<` por `<=`, removi o `EXCLUDE`, removi o lock e removi o `COLLATE "C"`. Duas vezes um teste que passava não provava o que dizia, e foi corrigido.
- **Rodar tudo num clone limpo**, como quem avalia faria. Foi assim que apareceu o deadlock intermitente.
- **Testes de carga com verificação de invariantes no SQL.** Foi por eles que apareceram problemas que nenhum teste unitário mostraria: o retry insuficiente, o processo caindo com uma conexão derrubada e o vazamento de listeners de uma primeira correção.

## Limites e pendências

- O tempo é um inteiro de 32 bits (`int4range`). O painel lê cada inteiro como um minuto desde 1970-01-01 00:00 UTC (ver [DECISIONS.md](docs/DECISIONS.md)), o que cobre de ~2100 a.C. a ~6050 d.C. Para mais alcance, a troca seria para `int8range`; para decimais, `numrange`.
- Recursos são uma lista fixa, inserida por uma [migration](src/migrations/1793318400001-SeedResources.ts); não há cadastro.
- `GET /bookings` não tem paginação. Com volume, o próximo passo seria paginação por keyset sobre `id` e um índice `(resource_id, id)`.
- Escritas no mesmo recurso são serializadas. É o preço da garantia: recursos diferentes escalam em paralelo, mas um único recurso muito disputado vira fila.
- No shutdown, as conexões que ainda estavam na fila do sistema operacional são recusadas (`ECONNRESET`). As requisições já em andamento terminam, e conferi no banco que nenhuma escrita se perde.
- As migrations rodam no boot. Em produção, seriam um passo separado do deploy (`pnpm db:migrate` já existe).
- Fora do escopo: autenticação, recorrência, rate limiting e OpenAPI. O painel opcional tem um login simples só para a demo.
