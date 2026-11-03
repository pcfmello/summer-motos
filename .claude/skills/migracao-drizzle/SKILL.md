---
name: migracao-drizzle
description: Como criar e revisar migrações do SUMMER com Drizzle (drizzle-kit generate + SQL versionado, nunca push), mantendo-as aditivas. Use ao criar ou alterar tabelas, colunas, índices, extensões, gatilhos ou constraints.
---

# Migrações com Drizzle no SUMMER

## Antes

- **Entrega 0:** o modelo de dados (`docs/modelo-dados.md`) precisa estar aprovado pelo usuário antes da primeira migração.
- Confira a versão de `drizzle-orm` e `drizzle-kit` no `package.json` e consulte a documentação dessa versão (context7 ou orm.drizzle.team). Nomes de comandos, layout da pasta de migrações e API de relações mudaram entre versões: não confie na memória.

## Fluxo

1. Altere o schema em `src/server/db/schema/<modulo>.ts`.
2. Gere a migração com nome descritivo: `pnpm drizzle-kit generate --name <slug>`.
3. Leia o SQL gerado inteiro. Confira tipos, nulabilidade, padrões, FKs, índices e se nada foi apagado ou renomeado sem querer (o drizzle-kit pode interpretar um rename como drop + create).
4. SQL que o Drizzle não gera (extensões, funções, gatilhos, índices de expressão) vai numa migração custom: `pnpm drizzle-kit generate --custom --name <slug>`.
5. Aplique localmente com `pnpm db:migrate` (`scripts/migrate.ts`, o mesmo caminho do deploy; ver D010 em `docs/decisoes.md`) e rode os testes.
6. Commite schema, SQL e snapshot juntos.

## Nunca

- `drizzle-kit push` em homologação ou produção. Prefira não usar nem localmente, para o histórico de migrações ser o único caminho.
- Editar uma migração já aplicada em algum ambiente: crie outra.
- Remover ou renomear coluna ou tabela na mesma entrega que deixa de usá-la. O caminho é: cria a nova → migra os dados → a remoção fica para uma entrega seguinte (seção 6).
- `NOT NULL` sem padrão numa tabela com dados. O caminho é: adiciona como nula → preenche → torna obrigatória numa migração posterior.
- `real` ou `double precision` para dinheiro, quantidade, custo ou alíquota.

## Convenções de tabela

- `id uuid primary key default gen_random_uuid()`.
- `created_at` e `updated_at` como `timestamptz not null default now()`.
  - A atualização de `updated_at` é feita pela aplicação ou por gatilho: siga o que estiver em `docs/decisoes.md`.
- `empresa_id uuid not null` com FK para `empresas`, e índice começando por `empresa_id` nas consultas principais.
- Unicidade por empresa: `unique (empresa_id, codigo)`. Colunas opcionais únicas (ex.: `chave_acesso`) podem usar unique comum, porque o Postgres trata nulos como distintos.
- Precisões:
  - dinheiro `numeric(14,2)`;
  - quantidade `numeric(14,4)`;
  - custo `numeric(16,6)`;
  - alíquota `numeric(7,4)`.
- No Drizzle, `numeric` volta como string: converta para `Decimal` no domínio.
- FKs com `ON DELETE` explícito; `RESTRICT` para documentos e movimentos.
- `jsonb` com padrão (`'{}'::jsonb`) para `config`, `modulos` e `config_fiscal`.
- Status e tipos: siga a decisão registrada (`pgEnum` ou `text` + `check`). Com `pgEnum`, valores só são acrescentados (`ALTER TYPE ... ADD VALUE`), nunca removidos.

## Busca (pg_trgm + unaccent)

Numa migração custom:

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;

-- unaccent() não é IMMUTABLE e não pode ir direto num índice: use um wrapper
CREATE OR REPLACE FUNCTION f_unaccent(text) RETURNS text
  LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT
  AS $$ SELECT public.unaccent('public.unaccent'::regdictionary, $1) $$;

CREATE INDEX produtos_busca_descricao_trgm
  ON produtos USING gin (f_unaccent(lower(descricao)) gin_trgm_ops);
```

Repita para `codigo`, `referencia_fabricante` e `codigo_original`. A query precisa usar exatamente a mesma expressão (`f_unaccent(lower(coluna))`) para o índice ser usado.

## Índices citados na especificação

- `estoque_reservas (produto_id, status)`.
- `outbox` parcial: `WHERE processado_em IS NULL`.
- `pedidos_canal` único por `(canal_id, id_externo)`.
- `documentos_fiscais.ref` único.
- Índice único de idempotência em `eventos_integracao`.

## Deploy

As migrações rodam antes de a nova versão subir. Toda migração precisa ser compatível com a versão anterior do app, que continua rodando até a troca, e com a volta para ela. `CREATE INDEX CONCURRENTLY` não roda dentro de transação: se precisar dele numa tabela grande em produção, trate numa migração separada e confira como a versão instalada do drizzle-kit lida com transações.

## Checklist antes do commit

- [ ] O SQL foi lido inteiro e só acrescenta (nada de `DROP` ou `RENAME` de coisa em uso).
- [ ] Tem `empresa_id`, unicidade por empresa e índices nas tabelas de negócio novas.
- [ ] Os tipos numéricos estão corretos.
- [ ] A migração aplica do zero num banco vazio e sobre o banco atual.
- [ ] Os testes passaram depois de aplicar.
