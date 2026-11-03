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
- Em memória, o `compare-ids.ts` comparava os **bytes UTF-8** (`Buffer.compare`), e não `a < b`. A comparação por UTF-16 diverge da ordem de bytes para caracteres fora do BMP. O modo em memória foi removido depois (seção 5), e hoje a ordem vem só do `COLLATE "C"`.
- Os testes de integração e o `docker-compose.yml` usam **`postgres:16` (Debian)**, e não Alpine. Com Alpine, o teste BR13 passaria mesmo sem o `COLLATE "C"`. Com Debian, remover o `COLLATE "C"` faz o teste falhar (`expected [ '10', '9', 'a', 'B' ] to deeply equal [ '10', '9', 'B', 'a' ]`).

## 3. Painel web: login só no Next e cada inteiro como um minuto

O painel (Next.js + shadcn/ui, no repositório separado `alvorada-web`) é opcional no desafio. Duas decisões mantêm a API como foi entregue e testada:

1. **O login fica só no Next, e a API continua sem autenticação.** Autenticação não faz parte do Caso 02, e colocá-la na API mexeria no backend, nas suítes e2e e de integração e nos testes de carga, que hoje provam as regras de reserva. O painel tem um login de demonstração (credenciais por variável de ambiente) com sessão em cookie `httpOnly` assinado, e um middleware protege as rotas. O servidor do Next chama a API, de modo que o navegador nunca recebe a URL dela e não é preciso CORS. O limite fica explícito: quem alcança a API pela rede não passa pelo login. Em produção, o próximo passo seria a API validar a sessão (ou um token emitido pelo Next) e não ficar exposta fora da rede interna.
2. **Cada inteiro é um minuto desde 1970-01-01 00:00 UTC.** O enunciado e a API só exigem inteiros com `start < end` (BR1), e a conta de sobreposição é numérica. Por isso a convenção cabe inteira na UI, sem mudar a API: um único inteiro carrega o dia, a hora e o minuto, e uma reunião das 9h às 11h de 2 de novembro de 2026 em Brasília é `[29893680, 29893800)`. A API aceita qualquer minuto; o painel oferece horários de 15 em 15 minutos, e mudar esse passo não mexe na API nem nos dados. O int32 cobre de ~2100 a.C. a ~6050 d.C., o que sobra para salas e equipamentos; se não bastar, o caminho é `int8range`. A demo e os testes antigos continuam com valores como `900` e `1030`, que nessa leitura caem em 1970, e isso não muda nenhuma regra. Testes fixam a convenção. Em [bookings.e2e-spec.ts](../test/e2e/bookings.e2e-spec.ts), contra o `int4range` do Postgres, reuniões consecutivas não conflitam, a mesma hora em outro dia não conflita, um plantão que cruza a meia-noite conflita com a manhã seguinte, quartos de hora encostados não conflitam e um minuto de sobreposição já conflita. Em [bookings.dto.spec.ts](../src/modules/bookings/dto/bookings.dto.spec.ts), anos de 0001 a 6000 são aceitos, um minuto além do int32 e um timestamp em milissegundos são recusados.

   No começo, cada inteiro era uma hora, o que cobria qualquer ano de quatro dígitos, mas não permitia 9h30. A troca para minutos só mudou o painel, os testes e a documentação.

## 4. TypeORM entrou depois, pensando no crescimento

O plano original usava `pg` puro, sem ORM. O enunciado não restringe ferramentas ("Use a linguagem e as ferramentas com que se sente mais à vontade"), e a escolha tinha sido nossa: `int4range`, `EXCLUDE USING gist` e `SELECT … FOR NO KEY UPDATE` não têm bom suporte em ORMs.

Revendo a estrutura, decidi adotar o TypeORM. O núcleo do projeto não precisa dele, porque a regra central é basicamente uma consulta: travar o recurso, procurar sobreposição e inserir. Mas, se o sistema crescer (novas entidades, CRUDs, relações, migrations geradas a partir das entities), ter o ORM desde já deixa esse caminho mais simples. A divisão ficou assim:

- **O TypeORM cuida da infraestrutura.** O pool do `pg`, os listeners de erro de conexão e o fechamento no shutdown, que antes eram código nosso (`create-pool.ts`, `database.module.ts`), agora são do `TypeOrmModule`. A configuração fica centralizada em [`src/config/`](../src/config/): o env validado com zod e a conexão, com tamanho do pool, `statement_timeout` e `idle_in_transaction_session_timeout`. O `AppModule` só importa `databaseModule()`.
- **As consultas ficam nos repositórios.** `resources` usa a API do TypeORM direto (`find`, `existsBy`). Em `bookings`, as leituras usam o QueryBuilder com `lower(period)` e `upper(period)` para devolver inteiros, e o insert roda em `manager.transaction` com o lock `for_no_key_update` do próprio TypeORM. O operador `&&` sobre `int4range` e a constraint `EXCLUDE` continuam em SQL explícito.
- **O schema continua vindo só de migrations** (`synchronize: false`). A migration inicial é escrita à mão, e as entities espelham o schema, incluindo os nomes dos constraints (`@Exclusion`, `@Check`, `primaryKeyConstraintName`, `foreignKeyConstraintName`).

O que conferi:

- **As entities batem com as migrations.** Um teste novo pede ao TypeORM o SQL que o `migration:generate` emitiria contra o banco migrado e exige que ele venha vazio. Para provar que o teste pega o problema, tirei o `@Exclusion` da entity: o teste falhou com `ALTER TABLE "bookings" DROP CONSTRAINT "bookings_no_overlap"`. Esse é justamente o risco de um ORM neste projeto: um `migration:generate` descuidado apagaria a garantia central.
- **O TypeORM não serializa migrations entre instâncias.** O `MigrationExecutor` não usa lock, então o lock consultivo continua nosso (`runMigrations` em [database.config.ts](../src/config/database.config.ts)). A primeira versão segurava um lock de sessão numa conexão e deixava o TypeORM migrar em outra. A revisão apontou que, se a conexão do lock caísse no meio, outra instância entraria com a migration ainda aberta. Hoje a transação é aberta por nós, o `pg_advisory_xact_lock` é tomado dentro dela, e o executor roda nessa mesma conexão. Lock e DDL vivem e morrem juntos, como antes do TypeORM. Três instâncias subindo juntas contra um banco vazio aplicaram a migration uma vez só e todas responderam ao `/health`. O `CREATE EXTENSION` fica só na migration (`installExtensions: false`), e não roda fora do lock a cada boot.
- **Conexões derrubadas continuam sem matar o processo.** No código do driver, o TypeORM registra listener de `'error'` no pool e em cada client e libera com erro o client que caiu. O handler padrão do pool só loga em nível "warn", que fica mudo sem `logging`, então o `poolErrorHandler` loga pelo `Logger` do Nest, como antes. O cenário "connection kill" do `load:race` passou: derrubou todas as conexões sob carga, só as requisições em andamento falharam, e as 3 instâncias seguiram respondendo.
- **O boot continua falhando rápido.** Por padrão, o `@nestjs/typeorm` tenta conectar 10 vezes, a cada 3 s, e cada tentativa criava um `DataSource` novo sem destruir o anterior. Uma migration com erro levava cerca de 30 s para derrubar o boot e deixava pools órfãos. Com `retryAttempts: 0`, e com o `DataSource` destruído quando a migration falha, o boot falha na hora. Conferi três casos: banco inacessível (falha em 1 s), migration que quebra (falha na hora, sem conexão nem lock sobrando, e a tabela `migrations` volta no rollback) e o boot seguinte depois de corrigir o banco.
- Na época, as suítes passavam sem mudança de comportamento: 70 unitários, 41 e2e e 65 de integração no Postgres (os 64 de antes mais o teste de sincronia), além de todos os cenários do `load:race`.

Custos:

- **Throughput.** Medi o código anterior e o atual em sequência, na mesma máquina, com 100 mil reservas no banco. O TypeORM custa de 7% a 17% de req/s: availability com período livre de 5.982 para 5.554, com 50 conflitos de 2.525 para 2.099, reserva por id de 11.701 para 9.863, POST sem contenção de 1.533 para 1.319 e POST disputado de 4.260 para 3.533. Os p99 ficaram próximos, e não houve erro. A diferença vem de montar o QueryBuilder e o wrapper de transação a cada requisição. Para este projeto, aceito esse custo em troca de ter o caminho de crescimento.
- **Banco local.** A tabela de controle de migrations mudou de `_migrations` para a `migrations` do TypeORM. Um banco local criado antes disso precisa de `pnpm db:reset`.

## 5. DTOs na borda HTTP e só Postgres

Revendo o código, decidi duas mudanças de estrutura. Nenhuma vai contra o enunciado: ele não fala de validação, e diz que tudo "**pode** funcionar em memória", o que é uma permissão e não uma exigência. Ele também pede "uma forma local de demonstrar o funcionamento" quando há um serviço externo, e o `docker compose` cumpre isso.

**DTOs no lugar de `unknown`.** Os controllers recebiam `unknown`, e os services validavam com zod. Agora cada controller tem um arquivo em `dto/` com as classes `*Request` e `*Response`:

- **Os requests são validados por um `ValidationPipe` global** ([validation.pipe.ts](../src/shared/validation/validation.pipe.ts)), com class-validator. As regras e as mensagens são as mesmas de antes, compostas a partir dos decorators do próprio class-validator (`IsString`, `IsInt`, `Min`, `MaxLength`, `Matches`…) em [validators.ts](../src/shared/validation/validators.ts) (`IsIdentifier`, `IsInt32`, `IsGreaterThan`, `ToNumber`) e no DTO de reservas (`IsBookingId`). Só o UTF-16 bem formado e a comparação entre campos são escritos à mão. Como o pipe para na primeira falha de cada campo, a ordem das checagens define a mensagem, e um teste fixa a mensagem de cada uma. O formato `{ code: 'validation_error', message, details }` não mudou.
- **As responses são montadas pelo class-transformer**, só com os campos marcados com `@Expose()`. Uma coluna nova na entity, como `created_at`, nunca vaza para o cliente sem alguém declarar o campo.
- **Os services recebem tipos já validados** e não devolvem mais `validation_error`. O custo é que eles deixam de validar para quem os chame fora do HTTP. Hoje só o HTTP e os testes os chamam.

Mudanças de contrato que vieram junto:

- Um campo que o DTO não declara é recusado com 400 (`"reason": "is not allowed"`). Antes, `status` enviado na criação era ignorado em silêncio. A listagem já recusava filtros desconhecidos, e agora a regra vale para todas as rotas.
- Um body JSON que não é objeto (por exemplo `[]`) responde `(input)`: "must be a JSON object". Sem isso, o class-validator o trataria como um objeto sem nenhum campo.
- Na availability, o `resourceId` (path) e o período (query) são DTOs separados, e o Nest valida um parâmetro de cada vez. Se os dois estiverem inválidos, só o erro do path aparece.
- O `/health` responde só `{ status: 'ok' }`, porque o campo `driver` não tem mais o que dizer.

**Só Postgres.** O modo em memória existia para rodar sem Docker, mas obrigava cada regra a existir duas vezes (no SQL e em TypeScript) e a escolha de repositório a acontecer em runtime. Agora a API só tem a implementação Postgres e não sobe sem banco. A `DATABASE_URL` é obrigatória e não tem valor padrão no código. O `.env` versionado traz os valores do compose, e o `.env.local` (fora do git) sobrescreve o que for pessoal. A precedência é: variável real > `.env.local` > `.env`.

Consequências nos testes:

- **Os unitários dos services usam mocks** do repositório. Eles testam o que é do service: a ordem das checagens, que uma recusa não chega ao `insert`, e como cada resposta do repositório vira um resultado.
- **As regras que dependem do banco** (sobreposição, ordem de bytes, filtros, cancelamento) ficam nos testes do repositório e na suíte HTTP, as duas contra o Postgres. A suíte de contrato, que existia para comparar as duas implementações, virou o spec do repositório.
- **Um repositório por entidade, sem interface.** A interface com token de injeção e as classes `Postgres*Repository` só existiam para escolher a implementação em runtime. Com uma só, sobrou uma classe por entidade (`BookingsRepository`, `ResourcesRepository`), que recebe o `Repository<Entity>` do TypeORM por `@InjectRepository` e é injetada direto nos services.
- O `pnpm test:e2e` passou a precisar de Docker. Só o `pnpm test` roda sem.
- A demo e os testes de carga migram o banco e apagam as reservas sozinhos. A demo pode ser rodada várias vezes seguidas, inclusive depois do `load:bench`.

O que conferi:

- Todas as BR1–BR14 continuam com pelo menos um teste nomeado pela regra.
- Mutação do período semiaberto: trocar o `'[)'` da consulta de conflitos por `'[]'` derruba 5 testes, inclusive o exemplo do enunciado.
- Sem `DATABASE_URL`, a API sai com código 1 e `Invalid configuration: DATABASE_URL: Invalid input: expected string, received undefined`. Um `PORT` no `.env.local` vence o do `.env`, e uma variável real vence os dois.

Depois, uma revisão focada em simplicidade tirou o que sobrava:

- **Os recursos vêm de uma migration** ([SeedResources](../src/migrations/1793318400001-SeedResources.ts)), e não mais de um `seed()` no repositório chamado no boot do módulo. A lista é fixa e não tem endpoint, então é dado que acompanha o schema. Isso também corrigiu o `load:bench` num banco recém-criado: ele inseria reservas antes de qualquer instância da API ter semeado os recursos, e quebrava na foreign key.
- **O `AppModule` é estático.** O `ValidationPipe` e o filtro de erros entram como `APP_PIPE` e `APP_FILTER`, então o app de teste e o `main.ts` sobem o mesmo módulo, sem um `configureApp` compartilhado. O `main.ts` ainda valida o env antes de criar o app, para que um env inválido falhe com uma linha só.
- Saíram dependências que o scaffold deixou e nada usava (`source-map-support`, `@nestjs/mau` e o script `deploy`), e a demo reaproveita o `startServers` dos testes de carga.
- **O id na URL também passa por DTO** (`BookingParamsRequest`). Antes o service checava à mão se o id "podia existir" e respondia 404 sem ir ao banco, porque um `NUL` faria o Postgres dar 500. Agora um id com caractere de controle na URL responde 400, como já acontecia com o `resourceId` da availability. Um id só inexistente continua 404. A regra do id de criação (BR2) ficou no arquivo de DTO, o único que a usa.
- **Os erros esperados e seu status HTTP ficam juntos** em [booking.errors.ts](../src/modules/bookings/booking.errors.ts). Antes, os tipos ficavam em `booking.types.ts` e a tradução para HTTP num arquivo solto em `controllers/`.
- **Chaves com nome de método de `Object`** (`toString`, `valueOf`, `constructor`) passavam em silêncio: o class-transformer não as copia para o DTO, então o whitelist nunca as via. O pipe agora as recusa como qualquer campo desconhecido.

Resultado:

- 72 unitários, 50 e2e e 17 de integração passam, além da demo, do `load:race` (todos os invariantes) e do `load:bench` (0 erros).

Custo medido: **montar a resposta com o class-transformer é caro em listas.** No bench, availability com 50 conflitos caiu de cerca de 2.100 para cerca de 1.000 req/s. Para isolar a causa, rodei a mesma build duas vezes em sequência, mudando só o `return` desse controller: com o `serialize`, 1.021 req/s; devolvendo o objeto direto, 2.255 req/s. Os outros cenários não mudaram. Isolado, o `plainToInstance` com `excludeExtraneousValues` leva cerca de 113 µs para uma resposta com 50 reservas, contra 7 µs do `JSON.stringify` puro. Por ora aceito o custo pela garantia de não vazar campos. Se pesar, o caminho é manter as mesmas classes `*Response` e trocar o class-transformer por um mapeamento explícito campo a campo, que dá a mesma garantia.

## 6. Erros de domínio e serialização fora dos controllers

Cada rota fazia duas coisas além de chamar o service: `unwrap` (transformava o `Result` em resposta ou em `HttpException`) e `serialize` (montava a classe `*Response`). As duas são infraestrutura HTTP que o Nest já sabe fazer fora do controller, então saíram dali:

- **Os services lançam erros de domínio** em vez de devolver `Result`. Cada erro é uma classe em [booking.errors.ts](../src/modules/bookings/booking.errors.ts) (`ResourceNotFoundError`, `BookingNotFoundError`, `IdAlreadyUsedError`, `ConflictError`), filha de [`DomainError`](../src/shared/domain-error.ts), com `code`, mensagem, `details()` e um `kind` (`not_found` ou `conflict`). O [filtro global](../src/shared/http/http-error.filter.ts) traduz o `kind` em 404 ou 409. O domínio não conhece status HTTP, e o corpo das respostas de erro não mudou.
- **As responses saem pelo `ClassSerializerInterceptor`** do Nest, registrado como `APP_INTERCEPTOR` com `excludeExtraneousValues: true`. Cada rota declara a classe com `@SerializeOptions({ type: BookingResponse })`. Com `type`, o interceptor converte o objeto puro em instância da classe e só depois o serializa, então funciona com os objetos que o repositório devolve, inclusive listas e o `booking` aninhado do cancelamento. `/resources` devolve `string[]` e passa pelo interceptor sem mudança.
- **O que se perde:** com `Result`, o compilador obrigava o chamador a tratar cada erro. Agora isso depende de o filtro conhecer `DomainError`, e um erro esquecido vira resposta HTTP em vez de erro de compilação. Como só o HTTP chama os services, troquei essa garantia por controllers de uma linha.
- Ficaram assim os três controllers que tinham `unwrap` ou `serialize`: availability, bookings e health. O de resources já devolvia o service direto.

Custo medido: **o interceptor é mais caro que o `serialize` manual** em listas, porque faz duas passadas (`plainToInstance` e depois `instanceToPlain`) onde o `serialize` fazia uma. No mesmo build, rodando em sequência, availability com 50 conflitos fez cerca de 2.000 req/s sem o interceptor e de 620 a 680 req/s com ele (antes, com o `serialize`, era cerca de 1.000). Os outros cenários ficaram dentro do ruído entre execuções. Continua valendo a saída do §5: manter as classes `*Response` e trocar o class-transformer por um mapeamento explícito, se esse cenário importar.

Resultado: 72 unitários, 50 e2e e 17 de integração passam, além da demo e do `load:race`.

## Outros achados da revisão e dos testes de carga

Depois da primeira versão, pedi quatro revisões independentes (avaliação do desafio, Postgres, arquitetura NestJS e QA adversarial) e rodei os testes de carga. O que mudou por causa disso:

- **Uma conexão derrubada matava o processo.** O pool não tinha listener de `'error'`, e um `pg_terminate_backend` (o mesmo efeito de um restart ou failover do banco) derrubava a API. Hoje há listeners no pool e em cada client, e o cenário "connection kill" do harness mata todas as conexões sob carga e confere que as 3 instâncias continuam respondendo. A primeira tentativa de correção registrava o listener a cada checkout e vazava listeners. O harness mostrou o `MaxListenersExceededWarning`, e o listener passou para o evento `connect` do pool. Com a adoção do TypeORM (seção 4), esses listeners passaram a ser do driver dele, e o mesmo cenário continua passando.
- **Divergência entre memória e Postgres.** Um `NUL` no `resourceId` dava 404 em memória e **500** no Postgres; um surrogate solto no id era gravado como U+FFFD. Agora o validator rejeita caracteres de controle e UTF-16 malformado em todo identificador, e a suíte HTTP passou a rodar contra os dois drivers. Depois, com só o Postgres (seção 5), a regra continua, porque sem ela o banco gravaria algo diferente do que foi enviado.
- **Builds parciais.** Com `incremental: true`, o `.tsbuildinfo` sobrevivia ao `deleteOutDir` do `nest build`, e a partir do segundo build o `dist/` saía incompleto. Isso também quebraria um segundo `pnpm demo` de quem avaliasse. O build deixou de ser incremental.
- **Migração mais robusta.** Passou a rodar numa única transação, com lock consultivo e timeout. Antes, uma conexão derrubada no meio vazava o client e travava o `pool.end()`. Hoje as migrations rodam pelo TypeORM, numa única transação que começa com `pg_advisory_xact_lock`, na mesma conexão (seção 4). A espera pelo lock é limitada pelo `statement_timeout` (10 s).
- **Erros padronizados.** JSON malformado, corpo grande demais (413) e content-encoding desconhecido (415) agora seguem o formato `{ code, message }`. Filtros desconhecidos na listagem (`?status[]=x`) viram 400 em vez de serem ignorados em silêncio.

## Ajustes em relação ao plano

- **Nest 12 já gera o projeto com Vitest e ESM**, então não foi preciso o `unplugin-swc` previsto no plano.
- **Imports sem extensão.** Em ESM, o Node só resolve imports relativos com a extensão do arquivo emitido, e o projeto começou com `module: nodenext` e `import './x.js'` em todo lugar. Hoje o tsconfig usa `moduleResolution: bundler`, os imports não têm extensão, e o `nest build` compila com SWC (`builder: swc`, com type-check). O SWC acrescenta o `.js` só na saída em `dist/` (`resolveFully`, que precisa do `jsc.baseUrl` do [.swcrc](../.swcrc)). Em desenvolvimento, o tsx e o Vitest resolvem os imports sem extensão. Não dava para seguir o caminho do CommonJS, onde o `require` resolve sem extensão: o Nest 12 é publicado só em ESM.
- **A validação ficava nos services** (`booking-validator.ts`, com zod), e não em DTOs com pipes. Os services recebiam `unknown` e eram a única fonte das regras BR1 e BR2. Isso foi revisto depois: hoje a validação fica em DTOs (seção 5).
- **A demo e os testes de carga sobem o `dist/main.js` compilado** em processos filhos. O `tsx` (esbuild) não emite `emitDecoratorMetadata`, do qual a injeção de dependências do Nest depende.
- **`AvailabilityController` fica em `bookings/`**, mesmo respondendo em `/resources/...`. Disponibilidade é uma pergunta sobre reservas, e assim `resources` não depende de `bookings`.
