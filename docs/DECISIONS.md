# Decisões investigadas

## 1. Concorrência: do teste que não provava nada ao lock por recurso

**O que eu queria conferir.** Que nenhuma combinação de requisições simultâneas consegue criar duas reservas ativas sobrepostas, e que isso vale com várias instâncias da API compartilhando o mesmo banco. Nesse cenário as pré-checagens do service (`findById` e `findActiveConflicts` antes do `insert`) não ajudam, porque sofrem a corrida clássica de "checa e depois insere".

**Como investiguei, em quatro passos.**

1. **O primeiro teste dava falsa confiança.** Ele disparava 10 `create` sobrepostos com `Promise.all` e esperava 1 aceito. Passou, mas **continuou passando quando removi o `EXCLUDE`**: o primeiro insert terminava antes de as outras requisições checarem conflito. Criei [insert-barrier.repository.ts](../test/helpers/insert-barrier.repository.ts), que segura todos os inserts até as 10 requisições chegarem lá e força o pior intercalamento. Sem o constraint, o teste passou a falhar com 10 aceitas.

2. **O teste corrigido revelou deadlocks.** Num clone limpo, ele falhava uma vez a cada seis com `deadlock detected` (`40P01`). Com inserts sobrepostos simultâneos, a checagem do `EXCLUDE` faz cada transação esperar pela linha ainda não commitada da outra, e o ciclo só é detectado depois do `deadlock_timeout` (1 s). A primeira correção foi repetir o insert até 5 vezes.

3. **O retry não aguentou carga.** O harness [load/race.ts](../load/race.ts) roda 3 instâncias da API com 50 workers fazendo create, cancel e availability ao acaso. Ele mostrou **19 respostas 500** e **10 s de carga levando 90 s**, porque cada deadlock custava 1 s. Um revisor independente mediu o mesmo comportamento: com 8 inserts idênticos por rodada, o p99 chegou a 37 s e as falhas persistiram mesmo depois das 5 tentativas.

4. **A correção foi serializar as escritas por recurso.** O insert agora roda numa transação que começa com `SELECT … FROM resources WHERE id = $1 FOR NO KEY UPDATE`. Escritores do mesmo recurso fazem fila em vez de formar ciclos, e a checagem de conflito dentro da transação é exata. Isso também resolveu um caso em que um `conflict` podia vir com a lista de conflitos vazia: o revisor mediu isso em 7% das corridas entre insert e cancelamento.

| Mesma carga (3 instâncias, 50 workers) | Antes (retry) | Depois (lock por recurso) |
|---|---|---|
| Requisições em 10 s de caos | 15.786 (levando 90 s) | 32.021 (em 10 s) |
| Respostas 5xx | 19 | 0 |
| `conflict` com lista vazia | possível | 0 |

**O que concluí.** A garantia agora tem duas camadas, e cada uma é verificada por um teste diferente:

| Camada | O que garante | O que acontece se for removida |
|---|---|---|
| Lock da linha do recurso | Fila por recurso, erros exatos, sem deadlock | Os testes funcionais continuam passando; o harness mostra 500s e lentidão; o teste "queues inserts on the same resource behind its row lock" falha |
| `EXCLUDE USING gist` | Nenhuma sobreposição, para **qualquer** escritor, inclusive SQL direto | Os testes "rejects an overlapping INSERT that bypasses the application" e o do índice GiST falham |

A alternativa que considerei foi `pg_advisory_xact_lock(hashtext(resource_id))`, sugerida pelo revisor de Postgres. Preferi o lock na linha de `resources` porque ele também confirma que o recurso existe, e porque não há colisão de hash entre recursos diferentes. O custo dessa escolha é que, se a tabela de recursos crescer muito, o lock passa a competir com atualizações de outras colunas do recurso. Com `NO KEY UPDATE`, ele não bloqueia as checagens de foreign key.

## 2. Ordem de ids: `COLLATE "C"` e imagem Debian nos testes

**O que eu queria conferir.** O enunciado pede os conflitos "em ordem crescente de identificador". Os ids são texto, e eu queria a mesma ordem em memória e no Postgres. Em JS, `a < b` compara code units UTF-16; no Postgres, `ORDER BY id` segue a collation do banco.

**Por que ordem de bytes.** O enunciado não define a ordem para texto. A ordem de bytes é determinística, não depende de locale e é a mesma nas duas implementações. A ordem "natural" (`"9" < "10"`) seria mais amigável para ids numéricos, mas exige regras extras (`"a10"` vs `"a9"`, zeros à esquerda), e cada banco implementa de um jeito. Preferi uma regra simples e documentada.

**Como investiguei.** Comparei `ORDER BY id` com e sem `COLLATE "C"` nas duas imagens oficiais, usando os ids `a, B, 9, 10, b-2, b1`:

| Imagem | Collation padrão | `ORDER BY id` | `ORDER BY id COLLATE "C"` |
|---|---|---|---|
| `postgres:16-alpine` (musl) | `en_US.utf8` | `10 9 B a b-2 b1` | `10 9 B a b-2 b1` |
| `postgres:16` (Debian, glibc) | `en_US.utf8` | `10 9 a B b1 b-2` | `10 9 B a b-2 b1` |

A mesma collation, com o mesmo nome, ordena diferente conforme a libc da imagem. Na Alpine, ela já é efetivamente ordem de bytes.

**O que concluí.**
- As colunas de id usam `COLLATE "C"` explicitamente, então a ordem não depende do servidor.
- Em memória, [compare-ids.ts](../src/shared/compare-ids.ts) compara os **bytes UTF-8** (`Buffer.compare`), e não `a < b`. A comparação por UTF-16 diverge da ordem de bytes para caracteres fora do BMP, e há um teste para isso.
- Os testes de integração e o `docker-compose.yml` usam **`postgres:16` (Debian)**, e não Alpine. Com Alpine, o teste BR13 passaria mesmo sem o `COLLATE "C"`. Com Debian, remover o `COLLATE "C"` faz o teste falhar (`expected [ '10', '9', 'a', 'B' ] to deeply equal [ '10', '9', 'B', 'a' ]`).

## Outros achados da revisão e dos testes de carga

Depois da primeira versão, pedi quatro revisões independentes (avaliação do desafio, Postgres, arquitetura NestJS e QA adversarial) e rodei os testes de carga. O que mudou por causa disso:

- **Uma conexão derrubada matava o processo.** O pool não tinha listener de `'error'`, e um `pg_terminate_backend` (o mesmo efeito de um restart ou failover do banco) derrubava a API. Hoje há listeners no pool e em cada client, e o cenário "connection kill" do harness mata todas as conexões sob carga e confere que as 3 instâncias continuam respondendo. A primeira tentativa de correção registrava o listener a cada checkout e vazava listeners. O harness mostrou o `MaxListenersExceededWarning`, e o listener passou para o evento `connect` do pool.
- **Divergência entre memória e Postgres.** Um `NUL` no `resourceId` dava 404 em memória e **500** no Postgres; um surrogate solto no id era gravado como U+FFFD. Agora o validator rejeita caracteres de controle e UTF-16 malformado em todo identificador, e a suíte HTTP inteira roda contra os dois drivers.
- **Builds parciais.** Com `incremental: true`, o `.tsbuildinfo` sobrevivia ao `deleteOutDir` do `nest build`, e a partir do segundo build o `dist/` saía incompleto. Isso também quebraria um segundo `pnpm demo` de quem avaliasse. O build deixou de ser incremental.
- **Migração mais robusta.** Agora roda numa única transação, com `pg_advisory_xact_lock` e `lock_timeout`. Antes, uma conexão derrubada no meio vazava o client e travava o `pool.end()`.
- **Erros padronizados.** JSON malformado, corpo grande demais (413) e content-encoding desconhecido (415) agora seguem o formato `{ code, message }`. Filtros desconhecidos na listagem (`?status[]=x`) viram 400 em vez de serem ignorados em silêncio.

## Ajustes em relação ao plano

- **Nest 12 já gera o projeto com Vitest e ESM**, então não foi preciso o `unplugin-swc` previsto no plano.
- **A validação fica nos services** (`booking-validator.ts`, com zod), e não em DTOs com pipes. Os services recebem `unknown` e são a única fonte das regras BR1 e BR2, inclusive para quem os chama sem HTTP. O controller só converte a query string em número. O custo é não ter tipos de DTO para gerar OpenAPI.
- **A demo e os testes de carga sobem o `dist/main.js` compilado** em processos filhos. O `tsx` (esbuild) não emite `emitDecoratorMetadata`, do qual a injeção de dependências do Nest depende.
- **`AvailabilityController` fica em `bookings/`**, mesmo respondendo em `/resources/...`. Disponibilidade é uma pergunta sobre reservas, e assim `resources` não depende de `bookings`.
