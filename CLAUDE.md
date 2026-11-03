@docs/especificacao.md

# SUMMER — guia rápido do repositório

A especificação completa está em `docs/especificacao.md` (importada acima). As seções citadas aqui e nos agentes (2.1, 4.2, 4.14…) são dela.

- Plano e status das entregas: `docs/plano.md`
- Decisões técnicas: `docs/decisoes.md`
- Modelo de dados: `docs/modelo-dados.md` (aprovado antes de qualquer migração)

## Fluxo de trabalho

- Uma entrega por vez; a próxima só começa quando o usuário pedir.
- Fatias verticais (schema → domínio → action/query → tela → teste), cada uma num commit pequeno em Conventional Commits (`feat(produtos): ...`). Use a skill `nova-fatia`.
- Regra de negócio ambígua: pergunte antes de inventar. Decisão técnica menor: decida e registre em `docs/decisoes.md`.
- Antes de integrar com um serviço externo (Focus NFe, Mercado Livre), leia a documentação oficial atual e apresente o plano.
- Ao fechar uma entrega, use a skill `fechar-entrega`.
- Branches: feature → `develop` (homologação) → `main` (produção, após aprovação do diretor).

## Stack

Versões exatas: ver `package.json` depois da instalação.

- Next.js (App Router), TypeScript `strict` e pnpm.
- Server Components para leitura; Server Actions + Zod para escrita. Route handlers só para PDF, upload, webhooks, `/api/health` e `/api/v1`.
- Tailwind e shadcn/ui; react-hook-form + Zod; Montserrat em `--font-sans`; cores da seção 2.1 em OKLCH no `globals.css`.
- PostgreSQL 17 com Drizzle ORM (driver `pg`, um único `Pool` em `src/server/db/index.ts`) e as extensões `pg_trgm` e `unaccent`.
- Better Auth (e-mail e senha), pg-boss (worker em `src/worker/index.ts`), S3 via `@aws-sdk/client-s3` (MinIO local, R2 em produção).
- `decimal.js`, pdf-lib + bwip-js, Vitest e Playwright (opcional).
- Docker Compose local (Postgres 17 + MinIO); deploy com Coolify a partir de um Dockerfile multi-stage (alvos `app`, `worker` e `migrate`).

## Comandos (pnpm)

| Comando | O que faz |
|---|---|
| `pnpm dev` | app em desenvolvimento |
| `pnpm worker` | worker pg-boss |
| `pnpm build` | build de produção (standalone) |
| `pnpm lint` / `pnpm typecheck` | ESLint / `tsc --noEmit` |
| `pnpm test` | testes de domínio (Vitest) |
| `pnpm test:integration` | testes de integração com Postgres real |
| `pnpm db:generate --name <slug>` | gera uma migração SQL a partir do schema |
| `pnpm db:generate:custom --name <slug>` | cria uma migração SQL vazia (extensões, funções, gatilhos) |
| `pnpm db:migrate` | aplica as migrações pendentes |
| `pnpm db:status` | lista as migrações aplicadas e as pendentes |
| `pnpm db:seed` | seed de demonstração (só local e homologação; idempotente) |

## Migrações do banco

O banco só muda por migração versionada. É o único caminho, em todos os ambientes.

- **Fonte:** schema Drizzle em `src/server/db/schema/<modulo>.ts`.
- **Geração:** `pnpm db:generate --name <slug>` cria um arquivo SQL em `src/server/db/migrations/`, junto com o snapshot. O SQL é lido inteiro e commitado com o schema.
- **SQL que o Drizzle não gera** (extensões, `f_unaccent`, gatilhos, índices de expressão) vai numa migração custom.
- **Aplicação:** `scripts/migrate.ts` usa o migrador do `drizzle-orm` (`pnpm db:migrate`).
  - As migrações aplicadas ficam registradas numa tabela de controle no banco, então rodar de novo só aplica as pendentes.
  - Um advisory lock impede duas aplicações ao mesmo tempo.
- **Deploy:** o alvo `migrate` do Dockerfile roda antes de a nova versão subir. Se a migração falhar, o deploy para.
- **Nunca:**
  - `drizzle-kit push`;
  - editar uma migração já aplicada em algum ambiente;
  - remover ou renomear, na mesma entrega, uma coluna ou tabela em uso.
- **Migrações só aditivas** (seção 6): a versão anterior do app precisa funcionar com o banco novo.
- **CI:** as migrações são aplicadas do zero num banco vazio a cada pull request.
- Detalhes: skill `migracao-drizzle` e `docs/decisoes.md`.

## Convenções de código

- **Nomes:** domínio em português sem acento, `snake_case` no banco e `camelCase` no TypeScript; termos técnicos em inglês.
- **Camadas:**
  - `server/domain/*`: funções puras, sem banco e sem `Date.now()` escondido, com testes Vitest;
  - `server/actions/*`: ordem fixa, Zod → `getContext()` → permissão do perfil e módulo ligado → `withTransaction` → auditoria e outbox → `revalidatePath`;
  - `server/queries/*`: `server-only`, sempre filtradas por `empresaId`.
- **`getContext()`** retorna `{ usuario, tenantId, empresaId, perfil }` da sessão. `tenantId` e `empresaId` nunca vêm do cliente, e nenhum schema Zod de entrada aceita `empresaId`.
- **Números:**
  - dinheiro `numeric(14,2)`, quantidade `numeric(14,4)`, custo `numeric(16,6)` e alíquota `numeric(7,4)`;
  - `Decimal` com `ROUND_HALF_UP` na aplicação;
  - nunca `number`, `parseFloat` ou `toFixed` nesses valores.
- **Datas:** `timestamptz`, exibidas em `America/Sao_Paulo`; formatação pt-BR.
- **Tabelas:** `id uuid`, `created_at` e `updated_at` em todas; `empresa_id` nas de negócio.
- **Desativar, não apagar:** cadastros são desativados; documentos nunca são apagados.
- **Cores:** nenhum hex direto em componente, só variáveis do tema.

## Regras inegociáveis (resumo da seção 4)

1. **Isolamento (4.1):**
   - toda leitura e escrita filtra pela empresa ativa;
   - unicidade por empresa;
   - `marcas_moto` e `modelos_moto` são globais;
   - módulos por empresa em `empresas.modulos`, desligados por padrão em produção;
   - testes A×B (empresas do mesmo tenant) e X×Y (tenants diferentes).
2. **Estoque (4.2):**
   - o saldo só muda por movimentação append-only, na mesma transação, com `SELECT … FOR UPDATE`;
   - disponível = quantidade − reservada;
   - só `server/domain/estoque` + `withTransaction` altera saldo;
   - erro se corrige com estorno;
   - toda mudança no disponível grava na `outbox`.
3. **Documentos (4.3):**
   - orçamento não mexe no estoque;
   - venda baixa ao finalizar;
   - OS reserva ao lançar a peça e baixa na entrega;
   - pedido de canal reserva quando pago e baixa no faturamento.
4. **Kits (D012, substitui a 4.4):** o kit já vem fechado do fornecedor e é um produto comum, com saldo, custo e código de barras próprios. Não há composição.
5. **Custo (4.5):**
   - custo médio ponderado (saldo ≤ 0 → custo da entrada);
   - também guarda o último custo;
   - a saída grava o CMV do momento.
6. **Unidades (4.6):** tudo é convertido para a unidade de estoque.
7. **Códigos (4.7):**
   - `codigo` (SKU) é único por empresa, com sequencial automático de 6 dígitos;
   - vários códigos de barras por produto, com fator;
   - EAN interno `200…` com dígito GS1;
   - o `gtin_fiscal` rejeita prefixo 2 e nunca recebe o EAN interno.
8. **Leitor (4.8):** Enter com código exato adiciona direto; o foco volta para a busca.
9. **Preço (4.9):**
   - sugerido = último custo × (1 + markup), com arredondamento configurável;
   - tabelas de preço por canal.
10. **Totais (4.10):** half-up em 2 casas; desconto rateado, com a sobra de centavos no item de maior valor.
11. **Numeração e auditoria (4.11):** sequencial por empresa (`#000123`); auditoria nos eventos listados.
12. **Validações (4.12):**
    - CPF;
    - CNPJ numérico e alfanumérico, guardado com 14 caracteres;
    - placa antiga e Mercosul;
    - NCM com 8 dígitos, CEST com 7 e origem de 0 a 8.
13. **Comissão (4.13):**
    - valor fixo por serviço;
    - congelada quando a OS está entregue e paga;
    - o acerto vai para `acertos_mecanico`.
14. **Canais (4.14):**
    - publicado = max(0, disponível − segurança);
    - outbox e worker com retentativa e agrupamento;
    - webhooks idempotentes;
    - as notas do Mercado Livre vêm de um emissor externo, com séries diferentes das do Focus.
15. **Intragrupo (4.15):** venda normal, excluída da receita consolidada.
16. **Arquivos (4.16):** o banco guarda só a chave; os XMLs fiscais nunca são apagados.

## Perfis (seção 3)

- Os perfis `dono`, `balcao`, `estoque` e `mecanico` são **por empresa** e verificados no servidor.
- `balcao` e `mecanico` nunca recebem custo nem margem.
- O admin da plataforma acessa só `/admin`.
- Desconto acima do limite pede o PIN de um dono e vai para a auditoria.
