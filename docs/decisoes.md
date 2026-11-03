# Decisões técnicas — SUMMER

Formato: contexto → decisão → consequência. Uma decisão só muda por meio de uma nova entrada que a substitua; a antiga não é apagada.

---

## D001 — Especificação fora do CLAUDE.md (2026-11-03)

- **Contexto:** a especificação original era o próprio `CLAUDE.md` e pedia um `CLAUDE.md` curto com stack, comandos e convenções.
- **Decisão:** a especificação foi movida, sem alterações, para `docs/especificacao.md`. O `CLAUDE.md` novo a importa com `@docs/especificacao.md` e traz o guia operacional.
- **Consequência:** os agentes continuam recebendo a especificação inteira. As referências a seções (4.2, 2.1…) apontam para `docs/especificacao.md`.

## D002 — Membros: tabela própria em vez do plugin `organization` (2026-11-03, provisória)

- **Contexto:** a seção 2 pede para avaliar o plugin `organization` do Better Auth mapeado para `empresas`. Precisamos da hierarquia tenant → empresa, de perfis fixos por empresa (`dono`, `balcao`, `estoque`, `mecanico`) e de `pin_hash`. Só o admin da plataforma cria empresas.
- **Decisão:** tabela `membros` própria (usuário, empresa, perfil, `pin_hash`, ativo). A empresa ativa fica num campo adicional da sessão do Better Auth (`empresa_ativa_id`), validado contra `membros` a cada `getContext()`.
- **Consequência:**
  - não expomos as rotas de criar organização ou convidar do plugin;
  - os convites do dono são feitos pela área `/admin`;
  - a decisão é confirmada depois de conferir a documentação atual do plugin, e uma mudança vira nova entrada.

## D003 — Isolamento: filtro na aplicação + FKs compostas (2026-11-03)

- **Contexto:** o vazamento entre empresas ou tenants é o risco nº 1.
- **Decisão:**
  - toda query filtra por `empresa_id`, que vem de `getContext()`;
  - no banco, as referências entre tabelas de negócio usam FK composta `(empresa_id, x_id) → x(empresa_id, id)`, com `unique (empresa_id, id)` na tabela referenciada;
  - testes de integração A×B e X×Y obrigatórios.
- **Consequência:**
  - o banco recusa uma venda da empresa A apontando para um produto da empresa B, mesmo que haja um bug na aplicação;
  - RLS fica no backlog, porque exigiria `SET LOCAL` por transação com o Pool compartilhado.

## D004 — Status e tipos como `text` + `CHECK` (2026-11-03)

- **Decisão:** sem `pgEnum`. Colunas `text` com `CHECK (col IN (...))`, tipadas no Drizzle com `text({ enum: [...] })`.
- **Consequência:** acrescentar um valor é trocar a constraint numa migração. Não há a limitação do `ALTER TYPE ... ADD VALUE` dentro de transação.

## D005 — `updated_at` por gatilho (2026-11-03)

- **Decisão:** função `set_updated_at()` e um gatilho `BEFORE UPDATE` em todas as tabelas, criados numa migração custom.
- **Consequência:** vale para qualquer caminho de escrita (Drizzle, SQL cru, scripts).

## D006 — IDs `uuid` com `gen_random_uuid()` (2026-11-03)

- **Decisão:** `id uuid primary key default gen_random_uuid()`. O Postgres 17 não tem `uuidv7()` nativo.
- **Consequência:** ordenação temporal por `created_at` ou pela numeração do documento, nunca pelo `id`.

## D007 — Segredos criptografados na aplicação (2026-11-03)

- **Decisão:**
  - credenciais de canais, tokens do Focus e a senha do certificado A1 (quando for indispensável guardá-la) são criptografados com AES-256-GCM;
  - a chave fica em `APP_ENCRYPTION_KEY`, e cada valor grava a versão da chave, para permitir rotação;
  - as chaves de API são guardadas só como hash (SHA-256) e comparadas em tempo constante.
- **Consequência:** nenhum segredo fica em texto no banco nem chega ao navegador. A rotação exige reprocessar os valores com a chave nova.

## D008 — Append-only reforçado no banco (2026-11-03)

- **Decisão:** um gatilho bloqueia `UPDATE` e `DELETE` em `movimentacoes_estoque` e `auditoria`.
- **Consequência:** correção só por estorno. Um bug na aplicação não consegue reescrever o histórico.

## D009 — Numeração por contador atômico (2026-11-03)

- **Decisão:** a tabela `sequencias` tem `(empresa_id, chave)` único. `proximoNumero()` faz `UPDATE ... SET ultimo_valor = ultimo_valor + 1 RETURNING` dentro da transação do documento. Os documentos têm `unique (empresa_id, numero)`.
- **Consequência:**
  - a numeração não tem buracos quando a transação do documento é revertida;
  - há contenção na linha da sequência, aceitável para o volume de uma loja.

## D010 — Recurso de migrações do banco (2026-11-03)

- **Contexto:** o banco precisa evoluir de forma versionada, repetível e segura em todos os ambientes (local, CI, homologação e produção), com deploys contínuos e migrações só aditivas (seção 6).
- **Decisão:**
  - **Geração:**
    - drizzle-kit `generate` a partir do schema em `src/server/db/schema/*`;
    - SQL e snapshot versionados em `src/server/db/migrations/`;
    - SQL que o Drizzle não gera (extensões, funções, gatilhos, índices de expressão) vai em migrações `--custom`.
  - **Aplicação:**
    - `scripts/migrate.ts` usa o migrador do `drizzle-orm` (`migrate()` do driver `node-postgres`);
    - as migrações aplicadas ficam registradas numa tabela de controle (padrão do Drizzle: `drizzle.__drizzle_migrations`);
    - um advisory lock do Postgres impede duas execuções ao mesmo tempo.
  - **Scripts:**
    - `db:generate` e `db:generate:custom`;
    - `db:migrate`;
    - `db:status`, que compara o diretório de migrações com a tabela de controle.
  - **Deploy:** um alvo `migrate` no Dockerfile (só com o necessário para rodar o script, sem o drizzle-kit) roda antes de a nova versão do app e do worker subir. Se falhar, o deploy para.
  - **CI:** as migrações são aplicadas do zero num Postgres de serviço a cada pull request, antes dos testes de integração.
  - **Proibido:**
    - `drizzle-kit push`;
    - editar uma migração já aplicada;
    - `DROP` ou `RENAME` de algo em uso na mesma entrega;
    - `NOT NULL` sem padrão em tabela com dados.
- **Consequência:**
  - o histórico de migrações é o único caminho de mudança do banco;
  - voltar à versão anterior do app é sempre possível, porque as migrações são aditivas;
  - não há "down migrations": a correção é uma nova migração;
  - antes de implementar, confirmar na documentação da versão instalada do drizzle-kit o layout da pasta e o comportamento transacional.

## D011 — Testes em dois projetos do Vitest (2026-11-03)

- **Decisão:**
  - projeto `unit` para `src/server/domain/**`, sem banco;
  - projeto `integration` com Postgres 17 real, num banco de teste separado (`summer_test`), com as migrações aplicadas antes da suíte e `TRUNCATE` entre os casos;
  - sem rollback por transação nos testes de concorrência.
- **Consequência:** `pnpm test` é rápido; `pnpm test:integration` precisa do Docker (local) ou do serviço do CI.

## D012 — Kit é um produto comum, sem composição (2026-11-03, decisão do usuário)

- **Contexto:** a regra 4.4 da especificação previa kits montados a partir de peças avulsas, sem saldo próprio, com o disponível calculado pelos componentes. O usuário esclareceu que, na loja, **todo kit já vem fechado do fornecedor, com as peças inclusas**. Os kits não são montados com peças avulsas.
- **Decisão:**
  - o kit é cadastrado como um produto como outro qualquer, com saldo, custo médio, código de barras, NCM e perfil tributário próprios;
  - não há tabela de composição nem `produtos.tipo`;
  - **esta decisão substitui a regra 4.4 da especificação** e os trechos que dependem dela:
    - o cálculo de disponível pelos componentes (4.4 e 4.14);
    - a aba "Composição" do produto (Entrega 1);
    - os "3 kits" do seed, que viram produtos comuns com EAN próprio.
- **Consequência:**
  - o estoque, a reserva, a baixa e a sincronização com os canais tratam o kit como uma peça comum;
  - se no futuro a loja precisar montar kits, a composição volta como migração aditiva.

## D013 — Regras de cálculo do domínio (2026-11-03)

Ficam em `src/server/domain/*`: funções puras, com testes e só com `Decimal`.

- **Rateio (4.10):**
  - cada parte é arredondada half-up, e a sobra de centavos vai para o item de maior valor (no empate, o primeiro da lista);
  - se o ajuste não couber no item, porque o desconto ficaria negativo ou maior que o valor do item, a sobra passa ao próximo maior;
  - a soma sempre fecha exata, como a NF-e exige.
- **Total do item:** `round2(qtd × preço) − desconto do item`. Preço com mais de 2 casas ou quantidade com mais de 4 são recusados, porque a NF-e exige vProd = qCom × vUnCom com os valores gravados.
- **Margem:** sobre o preço de venda, `(preço − custo) ÷ preço`. O markup resultante sobre o custo também é calculado.
- **Preço sugerido e preço de tabela:** sem markup ou com a base zero, a função devolve "sem preço" (`null`), nunca R$ 0,00. O preço fixo da tabela tem prioridade e nunca é arredondado.
- **Markup:** markup `0` é escolha explícita; nulo herda o da categoria.
- **GTIN fiscal:**
  - o prefixo é conferido no código completado com zeros até 14 dígitos (`02…` = uso interno), o que impede o EAN interno disfarçado com zeros à esquerda;
  - GTIN-12 com 2 e GTIN-8 com 0 ou 2 aguardam resposta (`docs/perguntas-abertas.md`, D2).
- **Quantidade publicada:** é arredondada para baixo até o inteiro. Decisão provisória (`perguntas-abertas.md`, D1).
- **Entrada manual:** o custo informado é por unidade de compra. Decisão provisória (`perguntas-abertas.md`, D4).

## D014 — Imagem do MinIO no ambiente local (2026-11-03)

- **Contexto:** a especificação pede MinIO no ambiente local. O MinIO Community deixou de publicar imagens Docker em 2025: o repositório `minio/minio` não existe mais no Docker Hub, e o pull anônimo é negado no Docker Hub e no quay.io (conferido em 03/11/2026).
- **Decisão:**
  - o `docker-compose.yml` usa o fork comunitário da Pigsty, `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`, a última versão publicada com o nome MinIO (o fork foi renomeado para "Silo" em agosto de 2026);
  - a mesma imagem, que traz o cliente `mc`, roda o serviço one-shot que cria o bucket e a chave do app;
  - é só para desenvolvimento. Homologação e produção usam o R2, e o código fala S3 genérico.
- **Consequência:**
  - a versão fica congelada. Se ela der problema, trocar por outro storage S3 local (Silo, Garage, SeaweedFS, RustFS) é mudar só o `docker-compose.yml`;
  - validado localmente: bucket criado, chave do app gravando e lendo, `minio-init` idempotente.

## D015 — Tema e componentes base (2026-11-03)

- **Contraste:**
  - o `--muted-foreground` da especificação (#71717A) dá 4,40:1 sobre o `--muted` (#F4F4F5), abaixo do mínimo de 4,5 que a própria especificação exige;
  - ele foi escurecido para **#6B6B73**: 4,81:1 sobre o `--muted` e 5,28:1 sobre o branco;
  - a série 3 dos gráficos continua em #71717A, porque não é texto.
- **Cores de apoio acrescentadas** (não estão na seção 2.1): `--sucesso-fundo`, `--destructive-fundo`, `--info-fundo`, `--destructive-foreground` e `--sidebar-muted-foreground`. Todas são expostas ao Tailwind.
- **`parseDecimalBR`:**
  - "1.500" é lido como mil e quinhentos (separador de milhar);
  - "1.5" e "0.125" são lidos como decimal (teclado em layout americano);
  - casas além do limite tornam o valor inválido, em vez de arredondar.
  - O valor do formulário é sempre uma string decimal com ponto.
- **Menu por perfil:** a visibilidade dos itens é provisória (`components/layout/navegacao.ts`) e só esconde na tela. A permissão real é verificada no servidor (fatia 0.6).
- **Vitrine `/dev/componentes`:** só existe fora de produção (`notFound()` em produção).
- **Logos:** provisórios e neutros em `public/brand/`, até a loja enviar os oficiais.

## D016 — Nome da variável das chaves de cifragem (2026-11-03)

- **Contexto:** a D007 citava `APP_ENCRYPTION_KEY`; o modelo de dados (1.7) e o `.env.example` usam `CHAVES_CIFRAGEM=v1:<base64>,v2:<base64>`.
- **Decisão:** vale `CHAVES_CIFRAGEM`, uma lista de chaves versionadas. A versão mais alta da lista cifra os valores novos; as anteriores servem só para decifrar, até a recifragem.
- **Consequência:** a D007 continua valendo, com o nome da variável ajustado por esta decisão.

## D017 — Listas com rolagem infinita (2026-11-03, decisão do usuário)

- **Contexto:** a especificação pedia "tabela com busca e paginação no servidor (via `searchParams`)". O usuário decidiu que **todas as listas usam rolagem infinita**.
- **Decisão:**
  - **primeira leva** (50 linhas) renderizada no Server Component, com o total e o cursor da próxima leva;
  - **busca e filtros** continuam na URL; mudar a busca recomeça a lista;
  - **próximas levas** vêm de uma server function de leitura declarada dentro da página. Ela captura busca e filtros por closure, que o Next criptografa; não se usa `.bind`, cujos argumentos vão abertos ao navegador e podem voltar alterados. Os filtros são revalidados com Zod no servidor e só o cursor vem do cliente. Ela passa por `getContext()` e pelo filtro de empresa e perfil, como qualquer query. Não se usa route handler para isso;
  - **paginação por chave (keyset)**, com coluna de ordenação + `id` e cursor opaco validado com Zod. Nunca `OFFSET`, para não repetir nem pular itens quando a lista muda durante a rolagem;
  - **acessibilidade:** botão "Carregar mais" como reserva para teclado e "Mostrando X de Y" anunciado para leitores de tela.
- **Consequência:**
  - as server functions de leitura são a exceção à regra "Server Actions só para escrita" e seguem as mesmas regras de contexto e permissão das queries;
  - sem virtualização por enquanto: em listas muito longas as linhas se acumulam na tela. Ela pode ser acrescentada depois sem mudar a API;
  - exportações (CSV) continuam trazendo todos os itens do filtro, independentemente do que foi rolado.
