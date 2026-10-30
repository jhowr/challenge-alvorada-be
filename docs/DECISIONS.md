# Decisões investigadas

## 1. O teste de concorrência precisava de uma barreira

**O que eu queria conferir.** Que o `EXCLUDE USING gist` é o que impede reservas duplicadas sob concorrência, e não as pré-checagens do service (`findById` e `findActiveConflicts` antes do `insert`), que sofrem a corrida clássica de "checa e depois insere".

**Como investiguei.** A primeira versão do teste disparava 10 `create` sobrepostos com `Promise.all` e esperava 1 aceito e 9 `conflict`. Passou. Para provar que o teste testava algo, removi o constraint da migration e rodei de novo. **Continuou passando.** Na prática, o primeiro insert terminava antes de as outras requisições chegarem à checagem de conflito, então o service recusava todas sozinho. O teste dava uma falsa confiança.

**O que concluí.** Um teste de concorrência que depende de timing não prova nada. Criei [insert-barrier.repository.ts](../test/helpers/insert-barrier.repository.ts), um decorator de repositório que segura todos os `insert` até que as 10 requisições tenham chegado lá. Isso força o pior intercalamento possível: todas passam pelas pré-checagens contra o mesmo estado vazio. Com a barreira:

| Schema | Resultado |
|---|---|
| com `EXCLUDE` | 1 aceita, 9 `conflict` ✔ |
| sem `EXCLUDE` | **10 aceitas**: o teste falha com `expected … to have a length of 1 but got 10` |

O mesmo experimento mostrou que o contrato do repositório Postgres também depende do constraint: sem ele, 4 testes falham, inclusive o `INSERT` direto no SQL que ignora a aplicação.

**Desdobramento: deadlock sob contenção.** Ao rodar a suíte num clone limpo, o teste falhou uma vez em cerca de seis com `error: deadlock detected` (`40P01`). Com inserts sobrepostos simultâneos, a checagem do `EXCLUDE` faz cada transação esperar pela linha ainda não commitada da outra. Quando isso fecha um ciclo, o Postgres aborta uma delas. Sem tratamento, isso vira um **500** em produção exatamente no cenário que o constraint protege.

A correção foi repetir o `insert` em caso de `40P01`, até 5 tentativas. É seguro porque o insert é um único comando atômico. Na nova tentativa a vencedora já está commitada, então o resultado vira um `conflict` normal. Para verificar:
- instrumentei temporariamente o caminho de retry: **29 retries em 8 execuções**, todas passando;
- rodei o teste 15 vezes seguidas: 15 de 15 passaram;
- como o deadlock depende de timing, [postgres-bookings.repository.spec.ts](../src/modules/bookings/repositories/postgres-bookings.repository.spec.ts) fixa a política de retry de forma determinística, com um pool falso.

## 2. Ordem de ids: `COLLATE "C"` e imagem Debian nos testes

**O que eu queria conferir.** O enunciado pede os conflitos "em ordem crescente de identificador". Os ids são texto, e eu queria a mesma ordem em memória e no Postgres. Em JS, `a < b` compara code units; no Postgres, `ORDER BY id` segue a collation do banco.

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

## Ajustes em relação ao plano

- **Nest 12 já gera o projeto com Vitest e ESM**, então não foi preciso o `unplugin-swc` previsto no plano.
- **A validação fica nos services** (`booking-validator.ts`, com zod), e não em DTOs. Os services recebem `unknown` e são a única fonte das regras BR1 e BR2. O controller só converte a query string em número.
- **A demo sobe o `dist/main.js` compilado** em um processo filho. O `tsx` (esbuild) não emite `emitDecoratorMetadata`, do qual a injeção de dependências do Nest depende.
- **O repositório Postgres não pré-checa nada no `insert`**: ele confia nos constraints e traduz os códigos de erro do driver (`23P01`, `23505`, `23503`). As pré-checagens do service existem para dar mensagens precisas no caso sequencial.
