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

## D018 — Respostas do diretor às perguntas do modelo (2026-11-03, decisão do usuário)

Estas respostas substituem trechos da especificação onde houver conflito.

- **Devolução de cliente (P1):** não existe crédito na loja. A loja devolve o pagamento, e a peça volta ao estoque. A peça com defeito vai para o depósito oculto "Garantia" (P7).
- **Comissões (P2):**
  - a OS fechada (`entregue`) gera a comissão do mecânico **e do vendedor**, independentemente do pagamento;
  - **regra nova:** o vendedor ganha um percentual sobre o valor das peças, configurado por vendedor;
  - o vendedor é escolhido na OS e na venda de balcão; a regra vale para as duas;
  - a base exata e o tratamento de cancelamento ou devolução depois do acerto estão em `perguntas-abertas.md`.
- **OS fechada não pode ser reaberta (P3):** substitui o "Reabrir uma OS entregue (só o dono) gera estorno" da regra 4.3. Correção depois do fechamento é feita por devolução.
- **Canais × balcão (P4):** o estoque é único e interligado (já previsto). Uma corrida rara pela última unidade vai para a lista de "pedidos com problema", e o estoque de segurança do canal reduz o risco.
- **Balanço (P5, P6):**
  - a peça não contada mantém a quantidade; o sistema só a lista antes de aplicar;
  - um balanço aberto por vez, com várias pessoas contando.
- **Comprador do e-commerce (P8):** não entra no cadastro de clientes da loja. Os dados completos do destinatário (para a NF-e) ficam no pedido.
- **OS visíveis ao mecânico (P9):** as que ele é responsável **ou** em que executou algum serviço.
- **CPF/CNPJ (P11):** único por empresa; o TeraSoft não tem duplicados.
- **Unidade `PCT` (P13):** acrescentada às unidades. A compra em PCT com fator 10 entra como 10 unidades de estoque (regra 4.6).
- **Propostas aceitas (P7, P10, P12):**
  - depósito "Garantia";
  - orçamento com serviço só vira OS;
  - abrir um kit para vender uma peça = ajuste manual com motivo.

## D019 — Regras de cálculo sem resposta seguem a proposta (2026-11-03)

As perguntas D1 a D5 de `perguntas-abertas.md` não foram respondidas e seguem a proposta:

- **D1:** a quantidade publicada é arredondada para baixo até o inteiro.
- **D2:** o GTIN fiscal recusa todos os códigos de circulação restrita da GS1 (General Specifications 26.0, seção 2.1.11):
  - prefixos 02, 04 e 20–29 (inclui UPC-A começando com 2 ou 4);
  - RCN-8 começando com 0 ou 2;
  - GTIN-14 montado sobre um desses.
  - O CHECK do banco continua barrando só o EAN-13 com 2, como última barreira; o domínio barra o resto.
- **D3:** o arredondamento da empresa vale para o preço calculado por tabela, nunca para o preço fixo.
- **D4:** o custo da entrada manual é por unidade de compra.
- **D5:** o saldo inicial exige custo; peça sem custo fica marcada e fora da margem.

## D020 — Migrações aplicadas na subida da versão nova (2026-11-03, complementa a D010)

- **Contexto:** no Coolify, o pre-deployment command roda no container **antigo** e não roda no primeiro deploy. Por isso não serve para aplicar as migrações da versão nova (`docs/deploy.md`, seção 5). A pergunta T1 não foi respondida e segue a recomendação.
- **Decisão (opção A):**
  - as imagens do app e do worker rodam `migrate` ao subir (`MIGRAR_AO_INICIAR=true`), com o advisory lock da D010, antes de iniciar o processo;
  - com rolling update, se a migração falhar o container novo nunca fica saudável e a versão anterior continua no ar;
  - a credencial de dono do banco (`DATABASE_URL_MIGRACAO`) é removida do ambiente (`unset`) antes do `exec` do processo Node.
- **Consequência:**
  - não há tempo fora do ar no deploy;
  - as migrações continuam aditivas, porque a versão anterior roda sobre o banco novo durante a troca;
  - o alvo `migrate` do Dockerfile continua existindo para uso manual (restauração, CI).

## D021 — Modelo de dados aprovado (2026-11-03, decisão do usuário)

- O usuário aprovou o `docs/modelo-dados.md` (59 tabelas). As migrações estão liberadas.
- As decisões de modelagem da seção 1.10 do modelo (D1 a D28, numeração interna do modelo) passam a valer. Elas ficam documentadas lá, para não duplicar.
- **Respostas do diretor sobre a comissão do vendedor (todas seguem a proposta):**
  - a base é o valor das peças **depois do desconto**;
  - venda cancelada ou peça devolvida depois do acerto gera um desconto no próximo acerto (`comissao_ajustes`);
  - no balcão, o vendedor vem preenchido com quem está no caixa (se for vendedor) e pode ser trocado;
  - mão de obra cobrada a mais numa OS fechada se corrige com uma devolução de serviço, sem mexer no estoque nem na comissão do mecânico.
- **Ainda abertas, só para o contador, sem travar a Entrega 0:** CFOP e natureza da operação, nota de garantia ao fornecedor e devolução de NFC-e.

## D022 — Ordenação pt-BR por collation ICU na coluna (2026-11-03)

- **Contexto:** o modelo (1.11) previa criar o banco com collation ICU `pt-BR`. Os bancos locais já existem com `en_US.utf8` (libc), e recriar o banco em cada ambiente é frágil. A imagem do Postgres 17 tem a collation `pt-BR-x-icu`.
- **Decisão:**
  - as colunas usadas para ordenar listas têm `COLLATE "pt-BR-x-icu"` no nível da coluna, declarado no schema Drizzle (`textoPtBr`, um `customType`), então sai na migração gerada, sem SQL manual;
  - colunas: `produtos.descricao`, `clientes.nome` e `fornecedores.razao_social` (keyset, 1.11) e os nomes dos cadastros exibidos em ordem alfabética (`categorias`, `marcas`, `perfis_tributarios`, `servicos.descricao`, `mecanicos`, `vendedores`, `tabelas_preco`, `marcas_moto`, `modelos_moto`).
- **Consequência:**
  - o banco não precisa ser criado com ICU, e o `docs/deploy.md` não ganha esse passo (o modelo 1.11 pedia registrá-lo);
  - os índices keyset `(empresa_id, descricao, id)` herdam a collation da coluna, então `ORDER BY descricao` usa o índice;
  - o teste de integração confere "abacate, Ábaco, Bola, Zebra".

## D023 — Recurso de migrações implementado (2026-11-03, detalha a D010)

- **Versões:** `drizzle-orm` 0.45.4, `drizzle-kit` 0.31.11, `pg` 8.23.1 (conferido no código instalado).
- **Layout:** `src/server/db/migrations/NNNN_<slug>.sql` + `meta/_journal.json` + `meta/NNNN_snapshot.json`. A numeração do drizzle-kit começa em `0000` (o modelo citava `0001`).
- **Ordem:** a seção 15 do modelo, com um par por passo: a migração gerada do módulo e uma custom (`*_gatilhos`) com o que o Drizzle não gera. FKs para tabelas de passos seguintes entram no passo em que a tabela de destino nasce (ex.: `vendas.documento_fiscal_id` no passo 9). Resultado: 19 migrações.
- **Aplicação (`scripts/migrate.ts` → `src/server/db/migracoes.ts`):**
  - uma conexão só (`pg.Client`) com `pg_advisory_lock(91625834235218)` (bytes ASCII de "SUMMER"), espera máxima de 10 min (`lock_timeout`), e `pg_advisory_unlock` no fim;
  - o `migrate()` do drizzle-orm 0.45 aplica **todas as pendentes numa transação só** e decide o que é pendente pelo `when` do journal, comparado com o `created_at` da última aplicada;
  - por isso o script recusa, antes de aplicar, a migração **alterada depois de aplicada** (hash diferente) e a migração com `when` antigo nunca aplicada, que o Drizzle **pularia em silêncio**;
  - migração aplicada sem arquivo (o banco à frente do código, caso do rollback da D020) só gera aviso;
  - sai com 0 ou 1; nunca imprime usuário nem senha da URL.
- **Scripts:** `db:generate`, `db:generate:custom`, `db:migrate`, `db:migrate:test` (`--banco=teste` → `DATABASE_URL_TEST`), `db:status` e `db:status:test`. O `db:status` sai com 1 se houver pendência, migração ignorada ou alterada.
- **Empacotamento (D020):** `scripts/migrate.ts`, `scripts/_ambiente.ts` e `src/server/db/migracoes.ts` só usam imports relativos e de pacotes. Conferido: `esbuild --bundle --platform=node --format=esm --packages=external` gera um `migrate.mjs` de 6,5 kB que roda com `node`. `MIGRACOES_DIR` (opcional) aponta a pasta no container.
- **CI:** além de aplicar do zero e reaplicar, `drizzle-kit check` e um `db:generate` que não pode criar arquivo (schema sem migração commitada).
- **Testes:** o `globalSetup` do projeto `integration` recria o schema do `summer_test` e aplica as migrações do zero; os testes exigem um banco cujo nome termine em `_test`.

## D024 — Conexão e `withTransaction` (2026-11-03)

- **Decisão:**
  - `src/server/db/conexao.ts` (sem `server-only`): `criarPool`, `criarBanco` e `criarWithTransaction`, usados por scripts, worker e testes;
  - `src/server/db/index.ts` (com `server-only`): o `Pool` único do app em escopo de módulo (guardado no `globalThis` fora de produção, por causa do HMR), `db` e `withTransaction`. Sem `DATABASE_URL`, falha ao carregar, exceto durante o `next build`;
  - `withTransaction(fn, { isolamento, modoAcesso, tentativas })`: padrão `read committed`, `read write` e 1 tentativa. Com `tentativas` (máximo 5), repete a transação inteira em `40001` (serialização) e `40P01` (deadlock), com espera crescente e variação. O SQLSTATE é lido também de dentro do `DrizzleQueryError` (`cause`);
  - o `Pool` tem ouvinte de `error` (cliente ocioso que cai não derruba o processo) e `application_name` (`summer-app`, `summer-migrate`).
- **Consequência:** o worker (fatia 0.11) cria o próprio Pool com `criarPool`, porque o `server-only` lança erro fora do Next. Retentativa só em função sem efeito fora do banco.

## D025 — Convenções do schema Drizzle (2026-11-03)

- **Nomes:** FK `<tabela>_<coluna>_fk`; `unique (empresa_id, id)` como `<tabela>_empresa_id_id_key` em toda tabela [N] (1.1), inclusive as que ninguém referencia; CHECK de coluna `<tabela>_<coluna>_check` (1.3); CHECK de várias colunas `<tabela>_<assunto>_check`.
- **Tipos:** `bytea` por `customType` (o Drizzle 0.45 não tem `bytea`; o drizzle-kit o escreve entre aspas, `"bytea"`, o que o Postgres aceita); `bigint` em modo `number` para numeração; `date` em modo `string`; `timestamptz` em modo `Date`.
- **Índices "mais recentes":** `DESC NULLS FIRST`, o mesmo sentido do `ORDER BY col DESC, id DESC` que o Drizzle gera (`desc()`). O drizzle-kit escreve `DESC NULLS LAST` por padrão, o que impediria o uso do índice na paginação keyset.
- **Tipos TypeScript:** o terceiro argumento de `pgTable` é anotado (`(t): Restricoes => [...]`). Sem isso, tabelas que se referenciam (vendas ↔ orçamentos ↔ OS ↔ documentos fiscais) entram em ciclo na inferência do TypeScript. Os módulos se importam em ciclo só dentro desses callbacks, que o Drizzle avalia de forma preguiçosa.
- **Append-only:** `bloquear_alteracao()` (SQLSTATE `23001`, `restrict_violation`) em `movimentacoes_estoque`, `os_historico_status` e `auditoria`. `comissao_ajustes` tem gatilho próprio: só aceita o UPDATE que preenche `acerto_comissao_id` de nulo para um valor, sem mudar outra coluna, e nesse caso o próprio gatilho atualiza o `updated_at`. As quatro ficam sem o `set_updated_at` (1.6).
- **Busca:** os 6 índices GIN `f_unaccent(lower(col)) gin_trgm_ops` ficam na custom do passo 10 (como no modelo), fora do snapshot do drizzle-kit. Um índice novo desse tipo também vai em migração custom.

## D026 — Endurecimento do schema depois das revisões (2026-11-03)

As revisões de estoque e de isolamento do schema não acharam vazamento entre empresas. Os achados viraram regras no banco, aplicadas antes de qualquer migração sair do ambiente local, com as migrações regeneradas:

- **Reservas:**
  - a reserva única por item vale para qualquer status menos `liberada`, então um item consumido nunca ganha outra reserva;
  - a reserva aponta para o mesmo produto do item.
- **Status finais não voltam:**
  - OS `entregue`/`cancelada` (OS não reabre, D018);
  - venda `cancelada`;
  - reserva `consumida`/`liberada`;
  - entrada confirmada não vira `cancelada`.
- **Depósito "Garantia":**
  - todo depósito nasce não vendável (`vendavel = false`), e o "Loja" é criado explicitamente como vendável;
  - vendas, OS e reservas só aceitam depósito vendável, garantido por FK.
- **Estorno:**
  - é sempre total, com o mesmo produto, depósito e custo unitário e a quantidade inversa (gatilho);
  - a recusa parcial do fornecedor vira `ajuste_manual` com motivo.
- **Inventário da virada:**
  - a diferença negativa usa `ajuste_inventario`, e o `saldo_inicial` só soma;
  - o `saldo_inicial` aceita custo nulo (peça sem custo, D019-D5).
- **Devolução de cliente com custo nulo:** entra pelo custo médio atual.
- **Comissão congelada não muda** (gatilho): valor, mecânico e, no documento fechado, também o `vendedor_id`, porque trocá-lo mudaria quem recebe. A correção é por `comissao_ajustes`.
- **CHECKs de linha:**
  - total do item = `round(qtd × preço, 2)` − descontos;
  - comissão do vendedor = `round(base × % ÷ 100, 2)`;
  - quantidade convertida da entrada.
- **`empresa_grupo_id`:** gatilho que exige o mesmo tenant nas duas empresas.
- **Únicos sobre ids de outras tabelas:** prefixados com `empresa_id`.
- **Autorizador do desconto:** FK composta para `membros` da mesma empresa.
- **`withTransaction`:**
  - `lock_timeout` de 5 s por padrão (opção `esperaLockMs`), o que complementa a D024;
  - regras da retentativa:
    - nada de fila fora da transação;
    - ler tudo o que decide dentro do `fn`, com `FOR UPDATE`;
    - sem estado acumulado fora do `fn`;
    - sem `redirect()` dentro do `fn`.
- **Testes:** catálogo de constraints (toda FK entre tabelas de empresa começa por `empresa_id`) e isolamento X×Y no banco.

## D027 — Autenticação, contexto e permissões (2026-11-03)

- **Better Auth 1.7.16:**
  - mapeamento pelo schema (`{ user: usuarios, session: sessoes, … }`), `generateId: "uuid"`, e `admin_plataforma`/`empresa_ativa_id` com `input: false`;
  - cadastro público desligado (`disableSignUp` e `disabledPaths` para sign-up, update-user, update-session, change-email, delete-user, contas sociais e de token);
  - senha de 10 a 128 caracteres, sessões revogadas na redefinição de senha e telemetria desligada;
  - sessão de 7 dias, renovada a cada dia, com **`cookieCache` desligado**;
  - cookies com prefixo `summer`.
- **Login** pelo cliente HTTP do Better Auth, não por server action, porque o limite de tentativas só roda no roteador HTTP. A mensagem de erro é a mesma para e-mail inexistente e senha errada.
- **Limite de tentativas em memória**, por IP + rota:
  - login: 10 por minuto (a loja inteira costuma sair pelo mesmo IP);
  - pedido de redefinição: 3 em 15 minutos;
  - redefinição e troca de senha: 5 em 15 minutos.
  - O IP vem de `x-forwarded-for` com `BETTER_AUTH_TRUSTED_PROXIES`. Com mais de uma réplica, o limite passa para o banco (migração aditiva).
- **`getContext()`:**
  - núcleo testável (`contexto-nucleo.ts`, com o banco injetado) e uma casca `server-only` com `React.cache` por requisição;
  - a cada requisição confere membro ativo, empresa ativa e tenant ativo, e lê perfil e módulos do banco;
  - se a empresa ativa ficar inválida, cai na primeira empresa válida, gravada na sessão;
  - o admin da plataforma sem membro não recebe contexto de empresa.
- **Rotas:**
  - o `proxy.ts` só redireciona quem não tem cookie; a checagem real é feita no servidor (`exigirContexto`, `exigirAdminPlataforma`);
  - páginas `/sem-acesso` e `/admin` (provisória até a 0.10);
  - `destinoSeguro` contra open redirect.
- **`trocarEmpresa`:** é a única exceção do `empresaId` vindo do cliente, validada num único UPDATE com `EXISTS` (membro, empresa e tenant ativos), com mensagem genérica na recusa.
- **Permissões** (`server/auth/permissoes.ts`): matriz por perfil com capacidades, `exigirPermissao`, `exigirModulo` e `veCusto` (dono e estoque). O menu é derivado da matriz e dos módulos. Os pontos que a especificação não definia estão em `perguntas-abertas.md` (P8).
- **PIN do dono:**
  - de 6 a 8 dígitos, com hash scrypt do Better Auth;
  - a validação roda numa transação própria, para o contador de falhas gravar mesmo se a venda for desfeita;
  - as linhas dos donos são travadas em ordem de `usuario_id`;
  - 5 erros bloqueiam todos os donos livres da empresa por 15 minutos.
- **Camada `server/servicos/*`:** operações de banco reaproveitadas por actions, worker e scripts (sequências, auditoria). Recebem o `tx`, sem `server-only` e com imports relativos.
  - `proximoNumero` faz `INSERT … ON CONFLICT DO NOTHING` seguido de `UPDATE … RETURNING`.
  - A auditoria remove, em qualquer nível, campos com `cifrad`, `hash`, `senha`, `password`, `token`, `secret`, `segredo` e `csc`, além dos binários.

## D028 — Worker, fila, healthcheck e imagens (2026-11-03)

- **Fila (pg-boss 12):**
  - **Instalação e privilégios:** o schema `pgboss` é criado e atualizado pelo `migrate`, com a credencial de dono, ainda segurando o advisory lock da D023. O usuário do app recebe só USAGE, DML e EXECUTE no schema da fila, sem CREATE nem TRUNCATE.
  - **Worker sem DDL em runtime:** `migrate: false`, `createSchema: false` e filas não particionadas. O pg-boss usa o pool interno dele (até 4 conexões); o worker tem um Pool de negócio próprio (`criarPool`).
  - **Risco a revisar a cada versão:** a atualização usa `migrateCommands` interno do pg-boss. O pacote está fixado em versão exata, e `tests/integration/fila.test.ts` cobre a instalação e a migração.
- **`/api/health`:**
  - dinâmica, com `select 1` e prazo de 2 s;
  - 200 `{status, banco, versao}` ou 503, sem expor erro;
  - a versão vem de `SUMMER_VERSAO` (build arg) ou do `package.json`.
- **Batimento do worker:** a cada 15 s, só com o banco respondendo. O HEALTHCHECK exige menos de 60 s. No SIGTERM, o `boss.stop()` gracioso tem até 8 s.
- **Bundles:** `dist/migrate.mjs` e `dist/worker.mjs` (esbuild) são autossuficientes, com `pg`, `pg-boss` e `drizzle-orm` embutidos. O build falha se `server-only` entrar num deles.
- **Dockerfile:**
  - alvos `app` (último, padrão), `worker` e `migrate`, todos com usuário não-root;
  - o `docker/entrypoint.sh` aplica a D020 e exige `DATABASE_URL_MIGRACAO` quando `MIGRAR_AO_INICIAR=true`, sem fallback;
  - `start-period` de 60 s.
- **CI:** builds dos três alvos, migração num banco vazio, app e worker saudáveis, 503 sem banco e SIGTERM do worker.

## D029 — Endurecimento da autenticação depois da revisão (2026-11-03)

- **Redirecionamento depois do login (`destinoSeguro`):**
  - recusa caracteres de controle e `\`;
  - interpreta a URL e confere a origem;
  - **confere o resultado final**, porque a normalização de `.`/`..` (inclusive `%2e`) recria `//host`.
- **Dois limites de login em memória:**
  - por IP + rota: 10 por minuto, num armazenamento próprio que não conta a chave fixa do Better Auth para IP indeterminado;
  - por e-mail: 10 falhas em 15 minutos, com resposta 429 genérica; um acerto zera.
- **Produção:**
  - `BETTER_AUTH_TRUSTED_PROXIES` (sub-rede da rede `coolify`) e `BETTER_AUTH_URL` com https são obrigatórias;
  - cookies `Secure`;
  - sem elas, a autenticação recusa a configuração na primeira requisição.
- **OS:**
  - `exigirAcessoOS(tx, ctx, osId)` é obrigatório para todo `osId` vindo do cliente. O mecânico só acessa as OS em que é responsável ou executor (D018-P9), por meio de um cadastro ativo em `mecanicos` ligado ao login. "Não encontrada" e "não permitida" dão o mesmo erro.
  - **Transições de status por perfil:** o mecânico só move entre aberta, aguardando peça, em execução e pronta; `entregue` exige `os.entregar` e parte de `pronta`; `cancelada` exige `os.cancelar`.
- **Comissão informada por quem não é dono é sempre ignorada.** Serviço lançado à mão por quem não é dono fica "a definir pelo dono" (`perguntas-abertas.md`, P10).
- **PIN:**
  - bloqueio progressivo: o 3º bloqueio seguido é definitivo até o dono redefinir (coluna `membros.pin_bloqueios`, migração aditiva 0019);
  - bloqueios auditados;
  - resposta única `pin_invalido`.
- **Admin da plataforma** só nasce por `criarAdminPlataforma`; formulário nenhum cria admin.
- **Auditoria:** o filtro também remove `pin`, chaves de API, chave privada, `authorization`, certificado e CSC (exceto `certificado_validade`, `certificado_enviado_em` e `csc_id`).
- **Capacidades novas:** `produtos.buscar_para_documento` (dono, balcão e mecânico, nunca com custo) e `os.definir_comissao_servico_manual` (dono). O markup conta como preço (`precos.alterar`; P9).
