# SUMMER — Gerenciador de loja de moto peças

Você vai construir o **SUMMER**, um sistema web de gestão para lojas de moto peças com oficina. Ele controla estoque, orçamentos, vendas no balcão, ordens de serviço (OS), notas fiscais e a integração com o Mercado Livre e com o e-commerce.

---

## 0. Contexto

- **Multi-tenant.** O sistema será vendido para várias lojas.
  - Cada cliente que contrata é um **tenant**. Um tenant tem uma ou mais **empresas**: CNPJs distintos, não filiais.
  - Dados de um tenant nunca aparecem para outro.
  - Dentro do tenant, cada empresa tem os próprios produtos, estoque, clientes e documentos.
- **Primeiro tenant:** uma moto peças com duas empresas, uma no **Lucro Real** e outra no **Simples Nacional**.
  - As duas vendem praticamente as mesmas peças.
  - As duas vendem no balcão, na oficina, no Mercado Livre e no e-commerce.
  - Cada empresa tem o próprio cadastro de produtos e dá entrada nas próprias notas.
- **Hoje a loja usa o TeraSoft.** Até a virada (Entrega 3), o TeraSoft continua sendo o sistema oficial de estoque e de notas.
- **O estoque tem uma única fonte: o SUMMER.** O Mercado Livre e o e-commerce leem estoque e preço daqui.
- **Entregas contínuas.** Cada entrega vai primeiro para homologação. O diretor da loja testa e aprova, e só então ela vai para produção. A loja passa a usar cada parte assim que ela é aprovada.
- **Referência visual:** se existir `docs/referencia/summer-demo.html`, use-o como referência de telas e fluxos. É uma demo feita antes; não reaproveite o código.

---

## 1. Como trabalhar

1. Antes de qualquer código, crie:
   - `CLAUDE.md` na raiz, com stack, convenções, comandos e um resumo das regras da seção 4;
   - `docs/plano.md`, com o checklist das entregas da seção 7;
   - `docs/decisoes.md`, para registrar decisões técnicas.
2. **A primeira tarefa é o modelo de dados.**
   - Escreva `docs/modelo-dados.md` com todas as tabelas da seção 5: colunas, tipos, chaves estrangeiras, índices e regras de unicidade.
   - Inclua um diagrama ER em Mermaid.
   - **Me mostre e espere a minha aprovação antes de criar as migrações.**
3. Faça uma entrega por vez e não comece a próxima sem eu pedir.
4. Trabalhe em fatias verticais (schema → domínio → action/query → tela → teste), com um commit pequeno por fatia, no padrão Conventional Commits.
5. Se uma regra de negócio estiver ambígua, **pergunte antes de inventar**. Decisões técnicas menores você mesmo toma e registra em `docs/decisoes.md`.
6. **Antes de integrar com qualquer serviço externo** (Focus NFe, Mercado Livre), leia a documentação oficial atual e me apresente o plano de integração.
7. Ao terminar cada entrega:
   - rode lint, typecheck e testes;
   - entregue um resumo do que foi feito, um roteiro de teste para a homologação (escrito na linguagem do diretor da loja, não de programador) e a lista do que ficou pendente;
   - atualize o `CHANGELOG.md` em português, descrevendo o que a loja vê de novo.

---

## 2. Stack

- **Next.js** (versão estável mais recente), App Router e TypeScript `strict`.
  - Server Components para leitura.
  - **Server Actions** para toda escrita, validadas com **Zod**.
  - Route handlers só para PDFs, uploads, webhooks, healthcheck e a API v1.
- **UI:** Tailwind e shadcn/ui; formulários com react-hook-form e Zod.
  - **Fonte Montserrat** via `next/font/google`, exposta como variável CSS `--font-sans` e usada como fonte padrão do Tailwind e do shadcn.
  - **Cores e logo** conforme a seção 2.1.
  - Interface em pt-BR e responsiva: o balcão é usado no desktop; OS, inventário e etiquetas também precisam funcionar em tablet e celular.
- **Banco:** PostgreSQL 17, com **Drizzle ORM** e migrações pelo drizzle-kit.
  - As migrações são arquivos SQL versionados. Nunca use `push` em produção.
  - Driver `pg`, com **um único `Pool` em escopo de módulo** (`src/server/db/index.ts`), reaproveitado por todas as requisições.
  - Helper `withTransaction(fn)` para tudo que mexe em estoque, reservas, numeração ou documentos.
  - Extensões `pg_trgm` e `unaccent`, para a busca.
- **Autenticação:** Better Auth (e-mail e senha) com adapter do Drizzle.
  - Um usuário pode pertencer a várias empresas, com um perfil diferente em cada uma. A empresa ativa fica guardada na sessão.
  - Avalie o plugin `organization` do Better Auth mapeado para a tabela `empresas`. Se ele não encaixar bem, use uma tabela `membros` própria. Registre a escolha.
- **Fila e tarefas em segundo plano:** `pg-boss`, que guarda a fila no próprio Postgres.
  - O worker roda num processo separado (`src/worker/index.ts`): mesmo código, outro container.
- **Arquivos:** storage compatível com S3, via `@aws-sdk/client-s3`.
  - Cloudflare R2 em produção e MinIO no ambiente local.
  - O banco guarda só a chave do arquivo.
- **Números:** nunca usar `float` do JavaScript para dinheiro, quantidade ou custo. Use `numeric` no Postgres e `decimal.js` na aplicação:
  - dinheiro: `numeric(14,2)`;
  - quantidade: `numeric(14,4)`, porque óleo é vendido em litro/ml;
  - custo unitário e custo médio: `numeric(16,6)`;
  - alíquotas e percentuais: `numeric(7,4)`.
- **Datas:** `timestamptz`, exibidas em `America/Sao_Paulo`. Formatação pt-BR (R$ 1.234,56).
- **PDF:** `pdf-lib`, com `bwip-js` para os códigos de barras. Não use Puppeteer/Chromium.
- **Ambiente local:** `docker-compose.yml` com Postgres 17 e MinIO, e um `.env.example` completo.
- **Deploy:** VPS da Hostinger com **Coolify**.
  - `output: 'standalone'` no `next.config`.
  - `Dockerfile` multi-stage, gerando a imagem do app e a do worker.
  - As migrações rodam antes de a nova versão subir.
  - Healthcheck em `/api/health`, que também testa o banco.
  - Dois ambientes: **homologação** (branch `develop`) e **produção** (branch `main`).
  - Nada que prenda o sistema a um provedor específico.
- **CI:** GitHub Actions rodando lint, typecheck e testes (com um Postgres de serviço) em todo pull request.
- **Testes:**
  - Vitest para as regras de domínio, que ficam em funções puras sem acesso ao banco.
  - Testes de integração com Postgres real para: concorrência de estoque, reservas e isolamento entre tenants e entre empresas.
  - Playwright, opcional, para os roteiros de homologação.
- **Nomenclatura:** domínio em português sem acento (`snake_case` no banco, `camelCase` no TypeScript); termos técnicos em inglês.

### 2.1 Identidade visual

A base é o logo da Summer Motos: vermelho e preto sobre fundo branco.

**Cores.** Defina todas como variáveis CSS do tema do shadcn em `globals.css`, convertendo os hex abaixo para OKLCH (o formato que o shadcn usa).

| Variável                             | Cor                             | Uso                                                |
| ------------------------------------ | ------------------------------- | -------------------------------------------------- |
| `--background`                       | `#FFFFFF`                       | fundo das telas                                    |
| `--foreground`                       | `#111111`                       | texto                                              |
| `--muted` / `--muted-foreground`     | `#F4F4F5` / `#71717A`           | áreas de apoio e texto secundário                  |
| `--border` / `--input`               | `#E4E4E7`                       | bordas e campos                                    |
| `--primary` / `--primary-foreground` | `#111111` / `#FFFFFF`           | botões de ação principal (Salvar, Finalizar venda) |
| `--marca`                            | `#EA3739`                       | vermelho do logo, só para destaques (ver regras)   |
| `--ring`                             | `#EA3739`                       | anel de foco                                       |
| `--destructive`                      | `#C8262B`                       | erros, rejeições da SEFAZ e ações destrutivas      |
| `--sucesso`                          | `#15803D`                       | confirmações (venda finalizada, nota autorizada)   |
| `--alerta`                           | `#B45309`, fundo `#FFFBEB`      | avisos (abaixo do mínimo, orçamento vencendo)      |
| `--info`                             | `#1D4ED8`                       | informações neutras                                |
| `--sidebar`                          | `#111111`                       | fundo do menu lateral                              |
| `--sidebar-foreground`               | `#E4E4E7`, secundário `#A1A1AA` | texto do menu                                      |
| `--sidebar-accent`                   | `#27272A`                       | item ativo e hover no menu                         |
| `--sidebar-primary`                  | `#EA3739`                       | barra de 3 px à esquerda do item ativo             |

**Regras.**

- **O vermelho da marca é destaque, não botão.** Ele aparece no logo, no indicador do item ativo do menu, na aba selecionada, no anel de foco, em ícones de destaque e na série principal dos gráficos. As ações principais ficam em preto. Motivo: num sistema de gestão, vermelho significa erro e cancelamento; se "Finalizar venda" e "Cancelar venda" tiverem a mesma cor, o balconista erra.
- `#EA3739` sobre branco tem contraste de 4,1:1, abaixo do mínimo para texto pequeno. Texto vermelho sobre branco usa `--destructive`. Sobre o menu preto, `#EA3739` passa (4,6:1).
- Ações destrutivas usam `--destructive`, com ícone e diálogo de confirmação.
- "Abaixo do mínimo" é alerta (âmbar), não erro.
- Status (fiscal, da OS, de estoque, de sincronização) sempre com ícone e texto, nunca só cor.
- Gráficos: série principal em `--marca`; as demais em `#111111`, `#71717A` e `#A1A1AA`.
- Nenhum hex direto nos componentes: tudo passa pelas variáveis, para o tema poder ser trocado por tenant no futuro.
- Contraste mínimo WCAG AA (4,5:1 para texto).

**Logo.**

- `public/brand/`: `logo.svg` (original, para fundo claro), `logo-negativo.svg` (para o menu preto) e `simbolo.svg` (só a estrela, para o favicon e o menu recolhido). É o logo padrão do sistema, usado na tela de login e no favicon.
- No topo do menu e nos PDFs (orçamento, OS, comprovante) aparece o `empresas.logo` da empresa ativa.
- Enquanto não houver versão negativa, o logo original vai sobre um bloco branco arredondado no topo do menu. Registre a falta dos arquivos como pendência.
- Etiquetas continuam em preto puro, porque a impressora térmica só imprime uma cor.

### Estrutura sugerida

```
src/
  app/(auth)/...                       login
  app/(app)/...                        telas do sistema (empresa ativa)
  app/admin/...                        área do admin da plataforma
  app/api/health/                      healthcheck
  app/api/pdf/...                      etiquetas, orçamento, OS, comprovante
  app/api/webhooks/focus/              notificações do Focus NFe
  app/api/webhooks/mercadolivre/       notificações do Mercado Livre
  app/api/v1/...                       API para o e-commerce
  server/db/schema/*                   schema Drizzle por módulo
  server/db/index.ts                   Pool + db + withTransaction
  server/domain/*                      regras puras: estoque, reserva, custo, ean, kit, preco, rateio, comissao, documentos (cpf/cnpj/placa)
  server/actions/*                     server actions (validação + permissão + transação)
  server/queries/*                     leituras
  server/auth/*                        sessão, contexto, permissões
  server/fiscal/focus/*                cliente do Focus NFe
  server/integracoes/mercadolivre/*
  server/integracoes/ecommerce/*
  server/storage/*
  worker/index.ts                      consumidor da fila
scripts/seed.ts                        seed de demonstração (só local e homologação)
scripts/criar-tenant.ts                cria tenant, empresas e usuário dono em produção
```

A função `getContext()` retorna `{ usuario, tenantId, empresaId, perfil }` a partir da sessão. **`tenantId` e `empresaId` nunca vêm do cliente.**

---

## 3. Perfis de usuário

O perfil é **por empresa**: a mesma pessoa pode ser `dono` numa empresa e `balcao` na outra.

| Perfil     | Pode                                                                                            | Não pode                            |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------------------------- |
| `dono`     | Tudo, inclusive configurações, cancelamentos, auditoria, acerto de mecânicos e PIN de aprovação | —                                   |
| `balcao`   | Vendas, orçamentos, abrir OS, clientes, consultar produtos e saldos                             | Ver custo e margem, ajustar estoque |
| `estoque`  | Produtos, entradas, ajustes, inventário e etiquetas; vê custo                                   | Cancelar venda                      |
| `mecanico` | Ver as OS dele, mudar status, lançar peças e serviços na OS, ver "Meus ganhos"                  | Ver custo, margem e vendas          |

- **Admin da plataforma** (flag no usuário): acessa só a área `/admin`, onde cria tenants e empresas e convida o primeiro usuário dono.
- As permissões são verificadas **no servidor**, em toda action e query. Esconder botão na tela não basta.
- O limite de desconto (%) é configurável por perfil. Desconto acima do limite pede o **PIN de um usuário dono** ali mesmo no balcão e é registrado na auditoria.

---

## 4. Regras de negócio inegociáveis

### 4.1 Multi-tenant e empresas

- Hierarquia: `tenants` → `empresas`. Toda tabela de negócio tem `empresa_id`.
- Exceções globais, sem empresa: `marcas_moto` e `modelos_moto`, um cadastro de motos único para todos os tenants, mantido pelo admin da plataforma.
- Toda leitura e escrita filtra pela empresa ativa da sessão.
- Leituras entre empresas só existem nos relatórios consolidados do tenant, e só das empresas em que o usuário é membro.
- Unicidade (códigos, códigos de barras, numerações) é **por empresa**.
- **Módulos por empresa:** `empresas.modulos` (jsonb) liga e desliga balcão, OS, fiscal, Mercado Livre e e-commerce. Em produção, um módulo novo nasce desligado e só é ligado depois da aprovação.
- **Testes obrigatórios:**
  - um usuário da empresa A não lê nem altera dados da empresa B do mesmo tenant;
  - nenhum usuário do tenant X vê dados do tenant Y.

### 4.2 Estoque só muda por movimentação

- Toda alteração de saldo gera uma linha em `movimentacoes_estoque`, que só recebe inserções (_append-only_).
- O saldo fica em `estoque_saldos` e é atualizado **na mesma transação**, com a linha travada por `SELECT ... FOR UPDATE`.
- `estoque_saldos` guarda `quantidade` e `quantidade_reservada`. **Disponível = quantidade − reservada.**
- Nenhum código fora de `server/domain/estoque` + `withTransaction` altera saldo ou reserva.
- Erro se corrige com movimento de estorno, **nunca apagando** movimento.
- Tipos de movimento: `saldo_inicial`, `entrada_compra`, `entrada_manual`, `saida_venda`, `saida_os`, `ajuste_manual`, `ajuste_inventario`, `devolucao_cliente`, `devolucao_fornecedor`, `estorno`.
- Cada movimento grava: quantidade (com sinal), custo unitário, saldo após o movimento, documento de origem (tipo + id), motivo, usuário e data.
- A configuração `permite_estoque_negativo` é por empresa, com padrão `false`.
  - Quando bloqueado, venda, reserva ou baixa sem disponível suficiente falha.
  - A tela lista exatamente quais itens faltam.
- **Toda mudança no disponível grava um evento na tabela `outbox`, na mesma transação.** O worker processa esses eventos para atualizar os canais de venda (regra 4.14).
- **Testes obrigatórios:**
  - duas vendas simultâneas da última unidade: uma tem que falhar;
  - uma venda no balcão e um pedido do Mercado Livre disputando a última unidade: só um consegue.

### 4.3 Quando cada documento mexe no estoque

| Documento                         | Reserva                | Baixa                                         | Como desfaz                                                                                        |
| --------------------------------- | ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Orçamento                         | Não                    | Não                                           | —                                                                                                  |
| Venda no balcão                   | —                      | Ao finalizar                                  | Cancelamento (só o dono) gera estorno                                                              |
| OS                                | Ao lançar a peça       | Na entrega, consumindo a reserva              | Remover a peça ou cancelar a OS libera a reserva. Reabrir uma OS entregue (só o dono) gera estorno |
| Pedido de canal (ML e e-commerce) | Quando o pedido é pago | No evento de faturamento configurado no canal | Cancelado antes de faturar: libera a reserva. Depois de faturado: devolução                        |

- O orçamento só mostra o saldo disponível e avisa sobre falta na hora de converter.

### 4.4 Kits

- Existem peças **avulsas** (`tipo = 'simples'`) e **kits** (`tipo = 'kit'`).
- Um kit é a composição de outros produtos, com a quantidade de cada um. **O kit não tem saldo próprio.**
- Vender, reservar ou baixar um kit age sobre cada componente.
- Disponível do kit = `min(disponível do componente ÷ quantidade no kit)`.
- Quando um componente muda, todos os kits que o usam também geram evento para os canais.
- Um kit que já vem fechado do fabricante, com código de barras próprio, é cadastrado como produto `simples`.
- Um kit não pode conter outro kit.

### 4.5 Custo

- **Entrada** recalcula o custo médio ponderado:
  - `novo_medio = (saldo × medio_atual + qtd_entrada × custo_entrada) ÷ (saldo + qtd_entrada)`;
  - se o saldo antes da entrada for ≤ 0, `novo_medio = custo_entrada`.
- Guarde também o **último custo**: o custo médio serve para relatórios e inventário; o último custo serve para formar preço.
- Custo de entrada por unidade de estoque = (valor do item + IPI + ST + frete + seguro + outras despesas − descontos) ÷ quantidade convertida.
  - Na entrada manual, informa-se o custo unitário e um frete total opcional, rateado pelo valor dos itens.
  - Créditos de imposto do regime normal ficam para depois, validados com o contador.
- **Saída** grava o custo médio do momento (CMV, o custo da mercadoria vendida), usado no cálculo de margem.

### 4.6 Unidades

- Cada produto tem uma **unidade de estoque**: UN, PC, PAR, JG, KIT, CX, LT, ML ou M.
- A compra pode vir em outra unidade, com fator de conversão (CX com 10 → 10 UN). **Tudo é convertido para a unidade de estoque.**

### 4.7 Códigos do produto

- **Código interno (`codigo`)**: texto, único por empresa. Também é o **SKU** usado no Mercado Livre e no e-commerce.
  - Se o usuário deixar o campo em branco, o sistema gera um sequencial de 6 dígitos (`000001`) a partir de um contador atômico em `sequencias` (`UPDATE ... RETURNING`), pulando códigos que já existem.
  - O usuário **pode digitar o código**, para manter o código que a peça já tem no TeraSoft.
  - Depois de criado, o código só pode ser alterado pelo dono, e a alteração vai para a auditoria.
- Campos pesquisáveis separados:
  - `referencia_fabricante`: código da peça no catálogo da marca da peça;
  - `codigo_original`: código da montadora (Honda, Yamaha…);
  - `marca_id`: marca da peça.
- **Códigos de barras**: tabela própria, com vários códigos por produto.
  - Cada código tem `tipo` (`fabricante`, `interno`, `embalagem`) e `fator` (quantas unidades ele representa; o código da caixa pode valer 10).
  - Código de barras é único por empresa.
- **Gerar EAN-13 interno**: `200` + sequencial de 9 dígitos + dígito verificador GS1 (módulo 10). É uma função pura, com testes. O produto tem um botão "Gerar código de barras".
- **GTIN fiscal (`gtin_fiscal`)**: campo separado.
  - Só aceita GTIN-8/12/13/14 com dígito verificador válido e **rejeita os prefixos de uso interno (EAN-13 começando com 2)**.
  - Campo vazio = `SEM GTIN` na nota.
  - O EAN interno **nunca** é copiado para o GTIN fiscal, porque a SEFAZ valida o GTIN no cadastro oficial da GS1.

### 4.8 Leitor de código de barras

- O leitor USB funciona como teclado e envia Enter no final.
- Nos campos de item (balcão, orçamento, OS, inventário, entrada):
  - se o Enter vier com um texto que bate **exatamente** com um código de barras ou código interno, o item é adicionado direto, com quantidade = fator do código;
  - caso contrário, abre a lista de resultados da busca.
- O foco volta sozinho para o campo de busca depois de cada item adicionado.

### 4.9 Preço

- O produto guarda o markup (%) e o preço de venda base. O saldo guarda o custo médio e o último custo.
- **Preço sugerido** = último custo × (1 + markup/100), com arredondamento configurável (ex.: terminar em ,90).
  - O usuário pode sobrescrever o preço, e a tela mostra a margem resultante.
  - Se o produto não tiver markup próprio, herda o markup padrão da categoria.
- **Tabelas de preço** por empresa:
  - cada tabela tem uma `base` (`preco_base` | `ultimo_custo` | `custo_medio`) e um percentual sobre essa base, e aceita preço fixo por produto;
  - exemplos: Balcão, Mecânico parceiro, Atacado, Mercado Livre, E-commerce e Repasse entre empresas (custo + %);
  - **cada canal de venda aponta para a sua própria tabela**;
  - o cliente pode ter uma tabela padrão.
- Alteração de preço ou custo vai para a auditoria.

### 4.10 Totais e desconto

- Arredondamento _half-up_ em 2 casas no total de cada item.
- Desconto no total do documento é **rateado entre os itens** proporcionalmente ao valor (a nota fiscal exige isso). A diferença de centavos vai para o item de maior valor.
- Vale para orçamento, venda e OS. A função de rateio é pura e tem testes.

### 4.11 Numeração e auditoria

- Orçamento, venda, OS, devolução e acerto de mecânico têm numeração sequencial por empresa (contador atômico), exibida como `#000123`.
- A tabela `auditoria` guarda: empresa, usuário, entidade, id, ação, JSON antes/depois e data.
- Registram auditoria:
  - alteração de preço ou custo;
  - ajuste de estoque;
  - cancelamento de venda e reabertura de OS;
  - desconto acima do limite;
  - alteração de código;
  - acerto e alteração de comissão de mecânico;
  - alteração de configuração de canal.

### 4.12 Validações de documentos

- **CPF**: validação com dígito verificador.
- **CNPJ**: aceita **numérico e alfanumérico**.
  - Desde julho de 2026, novos CNPJs podem ter letras nas 12 primeiras posições.
  - Os 2 dígitos verificadores continuam numéricos, calculados pelo algoritmo oficial da Receita (valor ASCII − 48, módulo 11).
  - Guarde sempre como texto de 14 caracteres, sem máscara.
- **Placa**: padrão antigo e Mercosul (`^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$`).
- **NCM**: 8 dígitos. **CEST**: 7 dígitos. **Origem**: 0 a 8.

### 4.13 Comissão do mecânico (valor fixo por serviço)

- `servicos.comissao_valor` é o valor padrão que o mecânico recebe por aquele serviço, independente do preço cobrado do cliente.
- Cada item de serviço da OS guarda:
  - o mecânico que executou;
  - `comissao_valor`, que vem do serviço, só pode ser editado pelo dono e é obrigatório no serviço lançado à mão.
- Uma OS pode ter serviços de mecânicos diferentes; cada item paga quem executou.
- **A comissão só conta quando a OS está entregue e paga.** Nesse momento o valor fica congelado (`comissao_congelada_em`); mudanças posteriores no serviço não alteram o passado.
- **Tela "Mão de obra"** (dono):
  - filtro de período: semana, mês, mês anterior ou datas;
  - um card por mecânico com o que ganhou, o que já foi pago, o que falta pagar e o que está pendente em OS abertas;
  - lista dos serviços do período e histórico de pagamentos.
- O botão **"Pagar"** registra um acerto (Pix ou dinheiro) em `acertos_mecanico`, marca os itens com `acerto_id` e grava auditoria.
- O mecânico vê a tela **"Meus ganhos"**, só com os dados dele.

### 4.14 Canais de venda: Mercado Livre e e-commerce

- **Cada empresa tem as próprias contas.** A tabela `canais_venda` (tipo `mercado_livre` | `ecommerce`) guarda:
  - credenciais criptografadas;
  - tabela de preço do canal;
  - estoque de segurança;
  - evento de faturamento (o que dispara a baixa);
  - emissor fiscal (`focus` | `externo`).
- **Vínculo produto ↔ anúncio** em `canal_anuncios`, pelo SKU (código interno). No Mercado Livre, os anúncios já existem: o SUMMER vincula, não cria. Criar anúncio fica no backlog.
- **Quantidade publicada** = `max(0, disponível − estoque de segurança do canal)`. Para kits, a conta usa os componentes (regra 4.4).
- **Sincronização:**
  - o worker lê a `outbox` e manda a quantidade e o preço para cada canal, com retentativa e espera crescente entre tentativas;
  - várias mudanças do mesmo produto em poucos segundos viram um envio só;
  - o anúncio guarda a última quantidade e o último preço enviados, a data da sincronização e o último erro.
- **Pedidos que chegam de fora:**
  1. o webhook grava a notificação em `eventos_integracao`, de forma idempotente (a mesma notificação recebida duas vezes não gera nada duplicado);
  2. o sistema busca o pedido na API do canal;
  3. cria ou atualiza `pedidos_canal`, único por canal + id externo;
  4. quando o pedido está pago, reserva o estoque;
  5. no evento de faturamento, vira venda e dá baixa;
  6. se for cancelado antes, libera a reserva.
- **As notas das vendas do Mercado Livre são emitidas por um serviço externo, não pelo Focus.**
  - O canal tem `emissor_fiscal = externo`; o SUMMER não emite nota para esses pedidos.
  - O SUMMER registra chave, número, série e o XML da nota externa quando disponível (por upload ou importação), para o pacote mensal do contador.
  - **Atenção:** o emissor externo e o Focus precisam usar **séries de NF-e diferentes** no mesmo CNPJ. As séries do Focus ficam configuráveis por empresa.
- **E-commerce:** é um projeto Next.js separado (a unificação de sistemas existentes), rodando na mesma infraestrutura. O SUMMER expõe uma **API v1**:
  - `GET /api/v1/produtos/disponibilidade?skus=...`: quantidade publicada e preço do canal;
  - `POST /api/v1/pedidos`: cria o pedido, de forma idempotente pelo id externo, e reserva o estoque se ele já estiver pago;
  - `POST /api/v1/pedidos/{id}/status`: pago, cancelado, faturado ou enviado;
  - **webhook de saída** para o e-commerce quando a quantidade publicada ou o preço mudam, assinado com HMAC;
  - autenticação por chave de API por canal (guardada só como hash), limite de requisições e log;
  - documentação em `docs/api.md` (OpenAPI).

### 4.15 Venda entre empresas do mesmo tenant

- O cliente ainda não decidiu se vai operar assim. O sistema só precisa **suportar**:
  - `clientes.empresa_grupo_id` e `fornecedores.empresa_grupo_id` marcam quando o outro lado é uma empresa do mesmo tenant;
  - a venda é uma venda normal, com nota; a outra empresa dá entrada pelo XML, como faz com qualquer fornecedor;
  - os relatórios consolidados do tenant **excluem** essas vendas da receita, para o mesmo dinheiro não ser contado duas vezes.

### 4.16 Arquivos

- Fotos, XMLs e PDFs ficam no storage; o banco guarda só a chave.
- **XMLs de notas nunca são apagados**: o emissor precisa guardá-los por pelo menos 5 anos.

---

## 5. Modelo de dados

Convenções:

- `id` uuid, `created_at` e `updated_at` em todas as tabelas.
- Tabelas de negócio têm `empresa_id`.
- Cadastros são desativados (`ativo = false`), não apagados. Documentos nunca são apagados.

### Plataforma e acesso

- **tenants**: nome, status (`ativo` | `suspenso`).
- **empresas**
  - `tenant_id`, razão social, nome fantasia, CNPJ, IE, IM.
  - **Regime tributário**: `simples_nacional` | `lucro_presumido` | `lucro_real`.
  - Endereço completo com **código IBGE do município**, UF, telefone e logo (chave no storage).
  - `config` (jsonb): `permite_estoque_negativo`, arredondamento de preço, limite de desconto por perfil e validade padrão do orçamento.
  - `modulos` (jsonb): módulos ligados.
  - `config_fiscal` (jsonb): ambiente e séries de NF-e e NFC-e usadas pelo Focus.
- **Usuários:** tabelas do Better Auth, com flag `admin_plataforma`.
- **membros** (ou o equivalente do plugin): usuário ↔ empresa, `perfil` e `pin_hash` (só para o dono).

### Referência global (sem empresa)

- **marcas_moto** e **modelos_moto**: marca, nome do modelo e cilindrada.

### Catálogo (por empresa)

- **categorias**: nome e markup padrão.
- **marcas**: marcas de peças (Cobreq, Vaz, NGK…).
- **produtos**
  - `tipo` (`simples` | `kit`), `codigo`, descrição, descrição curta (usada na etiqueta), descrição completa (canais), categoria, marca, `referencia_fabricante`, `codigo_original`, unidade, localização (`corredor`, `prateleira`, `gaveta`), estoque mínimo, markup, preço de venda base, ativo e observações.
  - Medidas para frete: `peso_g`, `altura_cm`, `largura_cm`, `comprimento_cm`.
  - Campos fiscais: `ncm`, `cest`, `origem`, `gtin_fiscal`, `unidade_tributavel`, `perfil_tributario_id`.
- **produto_codigos_barras**: código, tipo e fator.
- **produto_imagens**: chave no storage e ordem.
- **produto_aplicacoes**: produto, modelo de moto, ano inicial, ano final e observação (ex.: "dianteira").
- **kit_componentes**: kit, componente e quantidade.
- **perfis_tributarios**
  - Identificação: nome, descrição e regime (`simples` | `normal`).
  - ICMS: `csosn` (Simples) ou `cst_icms` (normal), alíquota, redução de base.
  - ICMS-ST: `st_retido_anteriormente` (bool), `mva`, `aliquota_st`, `fcp_st`.
  - PIS/COFINS: `cst_pis`, `aliq_pis`, `cst_cofins`, `aliq_cofins`, `monofasico` (bool).
  - IPI: `cst_ipi`, `aliq_ipi`.
  - IBS/CBS (reforma tributária): `cst_ibs_cbs`, `cclasstrib`, `aliq_cbs`, `aliq_ibs_uf`, `aliq_ibs_mun`.
  - O formulário mostra os campos de acordo com o regime da empresa e valida os obrigatórios.
- **servicos**: código, descrição, preço padrão, `comissao_valor`, tempo estimado e ativo. Campos fiscais de NFS-e opcionais e ocultos.
- **mecanicos**: nome, ativo e `usuario_id` opcional (o mecânico pode não ter login).
- **tabelas_preco**: nome, `base`, percentual e ativo.
- **tabela_preco_itens**: preço fixo opcional por produto.

### Pessoas

- **clientes**
  - PF/PJ, nome, CPF/CNPJ (opcional), IE, WhatsApp, e-mail, endereço com código IBGE (opcional), tabela de preço padrão, `empresa_grupo_id` (opcional) e observações.
  - Cada empresa tem o cliente padrão "Consumidor final".
- **motos_cliente**: cliente, modelo de moto (opcional) + descrição livre, ano, placa, cor, km atual e chassi (opcional).
- **fornecedores**: CNPJ, razão social, nome fantasia, contato e `empresa_grupo_id` (opcional).
- **fornecedor_produto_vinculos**: fornecedor, código do fornecedor, produto e fator. É o "de-para", lembrado nas próximas compras.

### Estoque

- **depositos**: o depósito padrão "Loja" é criado automaticamente e fica escondido na interface. A tabela existe para permitir vários depósitos no futuro.
- **estoque_saldos**: produto, depósito, `quantidade`, `quantidade_reservada`, custo médio e último custo. Chave única (produto, depósito).
- **movimentacoes_estoque**: conforme a regra 4.2.
- **estoque_reservas**: produto, depósito, quantidade, origem (tipo + id: item de OS ou item de pedido de canal) e status (`ativa` | `consumida` | `liberada`).
- **entradas_estoque** e **entrada_itens**
  - Cabeçalho: fornecedor, número e série da nota, `chave_acesso` (única por empresa, quando houver), data, frete, origem (`manual` | `xml`) e chave do XML no storage.
  - Itens: produto, unidade de compra, fator, quantidade, custo unitário e os valores rateados.
- **inventarios** e **inventario_itens**
  - Inventário: status (`aberto` | `aplicado` | `cancelado`) e filtro (todos, categoria ou localização).
  - Itens: quantidade do sistema na abertura e quantidade contada.

### Documentos comerciais

- **orcamentos** e **orcamento_itens**
  - Cabeçalho: número, cliente (ou nome livre), moto, tabela de preço, validade, `status` (`aberto` | `aprovado` | `recusado` | `convertido`), desconto, totais, observações e referência ao documento gerado na conversão.
  - O status "vencido" é calculado pela data de validade, não é gravado.
  - Itens: `tipo` (`produto` | `servico`), referência ao produto ou serviço, **snapshot** de código e descrição, quantidade, preço unitário, desconto, total e mecânico (só em serviço).
- **vendas**, **venda_itens** e **venda_pagamentos**
  - Cabeçalho: número, cliente, `canal` (`balcao` | `orcamento` | `os` | `mercado_livre` | `ecommerce`), `pedido_canal_id`, status (`finalizada` | `cancelada`), totais, `status_fiscal` (padrão `nao_emitido`), `emissor_fiscal` e `documento_fiscal_id`.
  - Itens: snapshot de código, descrição e NCM, quantidade, preço, desconto rateado, total e **custo unitário do momento**.
  - Pagamentos: forma (`dinheiro`, `pix`, `debito`, `credito`, `boleto`, `crediario`, `marketplace`, `outros`), valor, parcelas e troco.
- **ordens_servico**, **os_itens**, **os_pagamentos** e **os_historico_status**
  - OS: número, cliente, moto, km de entrada, defeito relatado, diagnóstico, mecânico responsável, previsão de entrega e `status` (`aberta` | `aguardando_peca` | `em_execucao` | `pronta` | `entregue` | `cancelada`).
  - Item de serviço: `servico_id` **opcional** (pode ser só descrição livre), descrição, **valor da mão de obra editável**, mecânico que executou, `comissao_valor`, `comissao_congelada_em` e `acerto_id`.
  - Item de peça: igual ao item de venda, mais a referência à reserva.
  - Toda mudança de status grava histórico com usuário e data/hora.
- **acertos_mecanico**: número, mecânico, período, valor, forma (`pix` | `dinheiro`), pago por e data.
- **devolucoes** e **devolucao_itens**: tipo (`cliente` | `fornecedor`), documento de origem, status (no fornecedor: `enviado` | `aceito` | `recusado`), itens e valores.

### Canais de venda

- **canais_venda**: tipo, nome, ativo, credenciais criptografadas, `tabela_preco_id`, `estoque_seguranca`, `evento_faturamento`, `emissor_fiscal` e `config` (jsonb).
- **canal_anuncios**: canal, produto, id externo, id da variação, SKU, status, quantidade publicada, preço publicado, data da sincronização e último erro.
- **pedidos_canal** e **pedido_canal_itens**
  - Pedido: canal, id externo (único por canal), status externo, status (`pendente` | `pago` | `faturado` | `cancelado` | `devolvido`), dados mínimos do comprador, totais, frete, taxas, `venda_id` e nota externa (chave, número, série, chave do XML).
  - Itens: anúncio, produto, quantidade, preço e taxa.
- **eventos_integracao**: canal, direção (`entrada` | `saida`), tipo, id externo, payload, recebido em, processado em, tentativas e erro. Tem índice único para garantir a idempotência.
- **api_chaves**: canal, hash, prefixo visível, ativo e último uso.
- **outbox**: tipo, payload, criado em e processado em.

### Fiscal

- **documentos_fiscais**: modelo (55 | 65), série, número, chave, `ref` do Focus (única), ambiente, status, motivo da rejeição, chave do XML, chave do PDF, documento de origem (tipo + id) e data de emissão.
- **eventos_fiscais**: documento, tipo (`cancelamento` | `carta_correcao` | `inutilizacao`), protocolo, justificativa e status.
- **notas_recebidas**: chave, CNPJ e nome do emitente, valor, data de emissão, status da manifestação, chave do XML e `entrada_id`.

### Controle

- **sequencias**: empresa, chave (`produto`, `ean`, `orcamento`, `venda`, `os`, `devolucao`, `acerto`) e último valor.
- **auditoria**: conforme a regra 4.11.

### Índices importantes

- Busca de produto com trigram + unaccent em descrição, código, referência e código original.
- Unicidade por empresa: código do produto, código de barras, chave de acesso da entrada e numerações.
- Unicidade de `pedidos_canal` por (canal, id externo).
- `estoque_reservas` por (produto, status).
- `outbox` pelos não processados.

---

## 6. Entregas contínuas: como publicar

- **Branches:** feature → `develop` (deploy automático em homologação) → `main` (produção, só depois da aprovação do diretor).
- **Migrações só aditivas.** Primeiro cria a coluna ou tabela nova e migra os dados; a coluna antiga só é removida numa entrega seguinte. Assim, voltar à versão anterior do sistema nunca quebra o banco.
- **Módulos novos nascem desligados** em produção (`empresas.modulos`).
- **Backup:**
  - backup do banco antes de cada deploy em produção;
  - backup diário automático para o R2, com retenção de 30 dias;
  - o procedimento de restauração fica documentado em `docs/deploy.md` e é testado uma vez.
- **Deploy em produção fora do horário de funcionamento da loja.**
- **Versão** semântica com tag no git e `CHANGELOG.md` em português.

---

## 7. Entregas

### Entrega 0 — Fundação (ainda não é usada pela loja)

- Repositório, `docker-compose` local, CI, `Dockerfile`, healthcheck e `docs/deploy.md`, com homologação e produção no ar pelo Coolify.
- **Modelo de dados completo da seção 5**, aprovado por mim e migrado, inclusive as tabelas que só serão usadas em entregas futuras.
- Autenticação, tenants, empresas, membros, seletor de empresa, área `/admin`, perfis e permissões no servidor, auditoria e sequências.
- Layout: menu lateral preto com o logo da empresa ativa, fonte Montserrat, tema claro com as cores da seção 2.1. Componentes base:
  - tabela com busca e paginação no servidor (via `searchParams`);
  - formulários;
  - campos de moeda e quantidade no formato pt-BR.
- Seed de demonstração (seção 8) e `scripts/criar-tenant.ts`.
- Testes de isolamento entre tenants e entre empresas.
- **Pronto quando:** login, troca de empresa e criação de tenant pelo admin funcionam, o CI está verde e os dois ambientes estão no ar.

### Entrega 1 — Cadastros e consulta (antes da virada; o TeraSoft continua oficial)

- **Importação do TeraSoft:** CSV/XLSX com mapeamento de colunas e prévia de erros por linha antes de gravar.
  - Importa produtos (com o código do TeraSoft preservado), clientes e fornecedores.
  - **Saldos não são importados agora.**
  - Depois de importar, o contador de código passa a começar depois do maior código numérico importado.
- **Produtos:**
  - lista com busca única por código, código de barras, referência, código original e descrição (ignora acento e aceita termo parcial);
  - filtros por categoria, marca e moto/ano;
  - formulário em abas: Geral, Códigos de barras (com EAN interno), Aplicação, Composição (só em kit), Preço (com o preço em cada tabela e a margem), Fiscal, Fotos e medidas.
  - A aba Estoque mostra "Estoque controlado no TeraSoft até a virada".
- **Peças por moto:** marca → modelo → ano → peças compatíveis agrupadas por categoria.
- **Cadastros:** categorias, marcas, modelos de moto (pelo admin), perfis tributários, tabelas de preço, serviços (com comissão), mecânicos, clientes e motos, fornecedores.
- **Etiquetas em PDF:**
  - folha A4 com grade configurável e 2 predefinições comuns da Pimaco;
  - etiqueta individual de 40×25 mm e 50×30 mm, para impressora térmica imprimindo PDF;
  - opção "pular N etiquetas", para reaproveitar uma folha já começada;
  - conteúdo: descrição curta, código interno, localização e preço (opcional);
  - código de barras: EAN de fabricante se houver; senão o EAN interno; senão um Code128 do código interno.

### Entrega 2 — Orçamentos

- Montagem com leitor e busca, cliente, moto, tabela de preço e validade.
- Lista com filtros por status, período e cliente.
- **PDF** com logo da empresa, itens, totais, validade e observações.
- Botão **WhatsApp**: abre `wa.me` com um resumo em texto (itens, total e validade).
- A conversão em venda ou OS fica desabilitada até a virada.

### Entrega 3 — A virada: estoque, vendas, OS e notas

Vai para produção de uma vez, num dia combinado. Antes disso, tudo é testado em homologação, inclusive as notas, no ambiente de homologação do Focus.

- **Estoque:**
  - saldo inicial por inventário (contagem), gravado com movimentos `saldo_inicial`;
  - kardex filtrável por produto, tipo, período e usuário;
  - entrada manual, ajuste com motivo obrigatório (só dono e estoque), inventário e lista de abaixo do mínimo exportável em CSV;
  - reservas.
- **Inventário (balanço):**
  1. Abrir o inventário (todos, por categoria ou por localização).
  2. Contar: cada leitura do código soma 1, ou o usuário digita a quantidade.
  3. Revisar as diferenças.
  4. Aplicar: gera movimentos `ajuste_inventario` até chegar à quantidade contada, calculando a diferença sobre o saldo **do momento da aplicação**. O sistema avisa se o item foi movimentado depois da abertura.
- **Entrada por XML:**
  - upload do XML da NF-e de compra, com parse local;
  - encontra ou cria o fornecedor pelo CNPJ;
  - lê os itens com os impostos e despesas rateados;
  - bloqueia a importação duplicada pela chave de acesso;
  - guarda o XML no storage;
  - tela de conferência com de-para e sugestão automática por EAN e referência, permitindo criar produto a partir do item;
  - ao confirmar, gera `entrada_compra` e recalcula o custo médio, e oferece "imprimir etiquetas desta entrada".
- **Balcão:**
  - tela pensada para teclado, com o campo de busca/leitor sempre focado;
  - atalhos **F2** buscar produto, **F3** cliente, **F6** desconto, **F9** finalizar, **Esc** cancelar a ação atual, mostrados na tela;
  - várias formas de pagamento na mesma venda, com cálculo de troco;
  - ao finalizar, dá baixa no estoque e emite NFC-e ou NF-e (ou comprovante não fiscal, se o módulo fiscal estiver desligado);
  - cancelamento só pelo dono.
- **OS:**
  - visões kanban por status (arrastar o cartão muda o status) e lista;
  - abertura com cadastro rápido de moto (placa, modelo, ano, km);
  - peças reservam o estoque quando lançadas;
  - serviços vêm da tabela, com preço editável, ou são lançados à mão; cada um tem o mecânico que executou;
  - a entrega registra o pagamento e dá baixa nas peças;
  - histórico por placa e PDF com campo para assinatura;
  - o mecânico logado vê só as OS dele.
- **Conversão de orçamento** em venda ou OS, com aviso dos itens sem disponível.
- **Devoluções:**
  - de cliente: a partir da venda, até a quantidade vendida, com entrada `devolucao_cliente` pelo custo da venda original e registro do valor devolvido ou do crédito;
  - ao fornecedor (ou garantia): registro com status e saída `devolucao_fornecedor`.
- **Fiscal com Focus NFe** (apresente o plano antes de codar):
  - token por empresa e por ambiente, que nunca vai para o navegador; segredos criptografados;
  - cadastro da empresa no Focus pela API e envio do certificado A1, sem guardar a senha em texto;
  - NF-e (modelo 55) e NFC-e (modelo 65) a partir de venda ou OS:
    - `ref` única = id do documento, o que evita nota duplicada;
    - fluxo assíncrono `processando` → webhook → `autorizado` ou `erro`;
    - tela de rejeições com a mensagem da SEFAZ e opção de reenvio;
  - montagem do item:
    - produto + perfil tributário + natureza da operação;
    - CFOP definido pela operação e pela UF de destino;
    - IBS/CBS conforme o regime e o calendário da reforma (confira na documentação do Focus);
    - GTIN fiscal ou `SEM GTIN`;
    - desconto e frete rateados;
  - cancelamento, carta de correção, inutilização e NF-e de devolução, referenciando a chave da nota original;
  - cálculo de impostos por perfil tributário, com cenários de teste validados pelo contador;
  - séries configuráveis por empresa (diferentes das séries do emissor externo do Mercado Livre).
- **Checklist do dia da virada** em `docs/virada.md`:
  - contagem e lançamento do saldo inicial;
  - o TeraSoft para de controlar estoque;
  - primeira nota real emitida e conferida;
  - plano de volta, caso algo dê errado.

### Entrega 4 — Mão de obra dos mecânicos

Conforme a regra 4.13.

### Entrega 5 — Recebimento de notas e pacote do contador

- **Recebimento (MDe):**
  1. notificação de nota emitida contra o CNPJ;
  2. **ciência** automática;
  3. download do XML, que cai na conferência de entrada;
  4. **confirmação da operação** automática quando a entrada é confirmada;
  5. alerta de notas pendentes perto do prazo de 180 dias.
- **Para o contador:**
  - zip mensal com os XMLs emitidos pelo Focus, os XMLs recebidos e os XMLs das notas externas;
  - relatório de inventário em 31/12 (quantidade × custo médio, por NCM).

### Entrega 6 — Mercado Livre

Leia a documentação atual do Mercado Livre (autenticação, itens, estoque, pedidos e notificações) e apresente o plano antes de codar.

- Conexão da conta por empresa (OAuth).
- Vínculo dos anúncios existentes pelo SKU, com lista dos anúncios sem vínculo.
- Sincronização de estoque e preço conforme a regra 4.14.
- Pedidos por notificação: reserva, baixa e cancelamento.
- Registro da nota emitida pelo serviço externo.
- Painel de erros de sincronização, com reenvio.

### Entrega 7 — E-commerce

- API v1, chaves por canal e webhooks de saída, conforme a regra 4.14.
- `docs/api.md` com exemplos.
- Teste ponta a ponta com o projeto do e-commerce em homologação.

### Entrega 8 — Relatórios do dono

- Consolidado do tenant, por empresa e no total, sem as vendas entre empresas do grupo.
- Vendas por canal, margem, giro e itens abaixo do mínimo por empresa.

---

## 8. Seed de demonstração (`pnpm db:seed`, idempotente; só local e homologação)

- **Tenant** "Moto Peças Demo", com 2 empresas: uma no Simples Nacional e outra no Lucro Real.
- **Usuários:** um dono nas duas empresas, mais balcão, estoque e mecânico. Senhas definidas em variável de ambiente.
- **Motos:** ~30 modelos populares no Brasil (Honda CG 160 Titan/Fan/Start, Biz, Pop, Bros 160, XRE 300, CB 300F, PCX; Yamaha Factor 150, Fazer 250, Lander 250, Crosser 150, NMax, MT-03; Suzuki, Kawasaki, Royal Enfield, Shineray…).
- **Produtos:** ~80 peças realistas por empresa, distribuídas nas categorias freios, transmissão, elétrica, motor, suspensão, pneus e câmaras, óleos e lubrificantes, cabos, acessórios, capacetes e vestuário.
  - Use marcas reais de peças como dado.
  - Inclua aplicações em motos, localizações e códigos de barras. Os EANs de "fabricante" são fictícios, mas com dígito verificador válido.
- **Kits:** 3 kits, entre eles o kit relação CG 160 (coroa + pinhão + corrente).
- **Saldos:** criados **via movimentos `saldo_inicial`**, nunca com insert direto no saldo. Alguns produtos ficam abaixo do mínimo.
- **Perfis tributários de exemplo**, marcados no nome como **"EXEMPLO — validar com o contador"**:
  - Simples com ST retida (CSOSN 500) e PIS/COFINS monofásico (CST 04);
  - Simples sem ST (CSOSN 102);
  - Regime normal com ST retida (CST 60) e PIS/COFINS monofásico (CST 04);
  - Regime normal sem ST (CST 00) e PIS/COFINS não cumulativo (CST 01).
- **Demais cadastros:** 15 clientes com motos, 3 mecânicos, 10 serviços com comissão (troca de óleo, revisão, troca de relação, regulagem de freio, troca de pneu…) e as tabelas de preço Balcão, Mecânico parceiro, Mercado Livre e E-commerce.
- **Canais de demonstração** sem credenciais, com alguns anúncios vinculados.
- **Histórico:** 60 dias de vendas, orçamentos e OS em vários status, com mecânicos diferentes, para o painel e a tela de mão de obra terem números.

---

## 9. Backlog (depois das entregas acima)

- Cadastro de produtos compartilhado entre empresas do mesmo tenant (plano já desenhado)
- Tema por tenant: cor de destaque configurável (o logo já é por empresa) e modo escuro
- Criar anúncios no Mercado Livre a partir do SUMMER, com compatibilidades geradas pelas aplicações em motos
- Similares/equivalências (a mesma peça em marcas diferentes)
- Grade de tamanho e cor (capacetes, vestuário)
- Lote/validade e número de série
- Impressão direta em impressora térmica (ZPL)
- Sugestão de compra (curva ABC, giro) e pedido de compra
- Checklist de entrada da moto e aprovação de orçamento por link
- Financeiro: contas a pagar a partir das duplicatas, contas a receber e caixa
- Vários depósitos com transferência
- NFS-e da oficina
- Leitura de código de barras pela câmera do celular
- Importação de modelos de moto pela tabela FIPE

## 10. Fora do escopo

- SPED e demais obrigações acessórias (ficam com o contador).
- Financeiro.
- Mercado Envios Full.
- Emissão das notas das vendas do Mercado Livre (é feita pelo serviço externo).
