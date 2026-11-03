# Plano das entregas — SUMMER

Status possíveis: ⬜ não iniciada · 🟨 em andamento · 🟦 em homologação · ✅ em produção

| Entrega | Nome | Status |
|---|---|---|
| — | Fase A: documentos de base e modelo de dados | 🟨 |
| 0 | Fundação | 🟨 (só o que não depende do banco, até a aprovação do modelo) |
| 1 | Cadastros e consulta | ⬜ |
| 2 | Orçamentos | ⬜ |
| 3 | A virada: estoque, vendas, OS e notas | ⬜ |
| 4 | Mão de obra dos mecânicos | ⬜ |
| 5 | Recebimento de notas e pacote do contador | ⬜ |
| 6 | Mercado Livre | ⬜ |
| 7 | E-commerce | ⬜ |
| 8 | Relatórios do dono | ⬜ |

Regra: uma entrega por vez; a próxima só começa quando o usuário pedir.

---

## Fase A — Documentos de base e modelo de dados

- [x] `git init` (branch `main`) e `.gitignore`
- [x] Especificação movida para `docs/especificacao.md`; `CLAUDE.md` novo, que a importa
- [x] `docs/plano.md` (este arquivo)
- [x] `docs/decisoes.md`
- [x] `docs/modelo-dados.md`, com todas as tabelas da seção 5 e o ER em Mermaid (revisado com a D012)
- [ ] **Aprovação do modelo de dados pelo usuário** (nenhuma migração antes disso). Perguntas P1–P16 em aberto (seção 14 do modelo).

---

## Entrega 0 — Fundação (ainda não é usada pela loja)

Pré-requisito: Docker Desktop com integração WSL ativada.

- [x] 0.1 Esqueleto do app
  - Next.js, TypeScript strict, Tailwind, shadcn, ESLint e Vitest;
  - `output: 'standalone'`;
  - gerado numa pasta temporária e mesclado sem sobrescrever o `CLAUDE.md`.
- [x] 0.2 Infra local
  - `docker-compose.yml` com Postgres 17 e MinIO, com bucket automático;
  - `.env.example` completo.
- [ ] 0.3 Recurso de migrações
  - `drizzle.config.ts`;
  - migrações SQL em `src/server/db/migrations/`;
  - `scripts/migrate.ts` (migrador do drizzle-orm, com advisory lock);
  - scripts `db:generate`, `db:generate:custom`, `db:migrate` e `db:status`;
  - teste: as migrações aplicam do zero num banco vazio.
- [ ] 0.4 Banco
  - `src/server/db/index.ts`, com Pool único, `db` e `withTransaction`;
  - schema Drizzle de **todas** as tabelas aprovadas;
  - migrações custom: extensões, `f_unaccent`, gatilhos de `updated_at` e de append-only, índices de busca.
- [x] 0.5 Domínio puro com testes
  - CPF, CNPJ alfanumérico, placa, NCM, CEST e origem;
  - EAN-13 interno e GTIN fiscal;
  - rateio de desconto;
  - `Decimal` e formatação pt-BR.
- [ ] 0.6 Autenticação
  - Better Auth (e-mail e senha) e flag `admin_plataforma`;
  - `membros` e empresa ativa na sessão;
  - `getContext()`;
  - matriz de permissões e checagem de módulo.
- [ ] 0.7 Auditoria e sequências: `registrarAuditoria` e `proximoNumero`, com teste de concorrência.
- [x] 0.8 Layout e tema (logos provisórios; o seletor de empresa e o login ganham lógica na 0.6)
  - Montserrat e cores da seção 2.1 em OKLCH;
  - menu lateral preto com o logo da empresa ativa;
  - seletor de empresa;
  - login.
- [x] 0.9 Componentes base
  - tabela com busca no servidor e rolagem infinita (D017);
  - formulários (react-hook-form + Zod);
  - campos de moeda e quantidade pt-BR.
- [ ] 0.10 Área `/admin`: criar tenant e empresas e convidar o dono.
- [ ] 0.11 Scripts e saúde
  - `scripts/criar-tenant.ts`;
  - seed idempotente (seção 8; os kits do seed são produtos comuns, ver D012);
  - `/api/health`, testando o banco;
  - esqueleto do worker pg-boss.
- [ ] 0.12 Testes de isolamento: empresa A × B (mesmo tenant) e tenant X × Y.
- [ ] 0.13 Deploy (🟨 Dockerfile alvo `app`, CI, `.dockerignore` e rascunho do `docs/deploy.md` prontos; faltam `worker`/`migrate`, GitHub, Coolify, R2 e backup)
  - `Dockerfile` multi-stage (`app`, `worker`, `migrate`);
  - GitHub Actions (lint, typecheck, testes e migrações do zero com Postgres de serviço);
  - Coolify (homologação em `develop`, produção em `main`);
  - backup diário no R2;
  - `docs/deploy.md`.
- [ ] Fechamento (skill `fechar-entrega`): roteiro `docs/homologacao/entrega-0.md` e `CHANGELOG.md`.

**Pronto quando:**
- login, troca de empresa e criação de tenant pelo admin funcionam;
- o CI está verde;
- os dois ambientes estão no ar.

---

## Entrega 1 — Cadastros e consulta (o TeraSoft continua oficial)

- [ ] **Importação do TeraSoft**
  - CSV/XLSX com mapeamento de colunas e prévia de erros por linha;
  - importa produtos (com o código preservado), clientes e fornecedores;
  - sem saldos;
  - o contador de código passa a começar depois do maior código numérico importado.
- [ ] **Produtos**
  - busca única (código, código de barras, referência, código original, descrição) com trigram e unaccent;
  - filtros por categoria, marca e moto/ano.
- [ ] **Formulário do produto em abas:** Geral, Códigos de barras (EAN interno), Aplicação, Preço (tabelas e margem), Fiscal, Fotos e medidas (sem aba Composição: o kit é um produto comum, ver D012); a aba Estoque mostra o aviso do TeraSoft.
- [ ] **Peças por moto:** marca → modelo → ano → peças por categoria.
- [ ] **Cadastros:** categorias, marcas, modelos de moto (pelo admin), perfis tributários, tabelas de preço, serviços (com comissão), mecânicos, clientes e motos, fornecedores.
- [ ] **Etiquetas em PDF**
  - A4 com grade configurável e 2 predefinições da Pimaco;
  - térmicas de 40×25 e 50×30 mm;
  - opção "pular N etiquetas";
  - prioridade do código de barras: EAN do fabricante, depois EAN interno, depois Code128.
- [ ] Fechamento da entrega.

**Pendência de entrada:** um arquivo de exemplo exportado do TeraSoft.

## Entrega 2 — Orçamentos

- [ ] Montagem com leitor e busca, cliente, moto, tabela de preço e validade.
- [ ] Lista com filtros por status, período e cliente; o status "vencido" é calculado.
- [ ] PDF com o logo da empresa.
- [ ] Botão WhatsApp (`wa.me`, com resumo).
- [ ] Conversão em venda ou OS desabilitada até a virada.
- [ ] Fechamento da entrega.

## Entrega 3 — A virada: estoque, vendas, OS e notas

- [ ] **Portão:** plano de integração do Focus NFe (`docs/integracoes/focus.md`) aprovado.
- [ ] **Estoque**
  - saldo inicial por contagem;
  - kardex;
  - entrada manual;
  - ajuste com motivo;
  - abaixo do mínimo (CSV);
  - reservas.
- [ ] **Inventário:** abrir, contar, revisar e aplicar, sobre o saldo do momento e com aviso de movimento depois da abertura.
- [ ] **Entrada por XML**
  - parse seguro;
  - fornecedor pelo CNPJ;
  - rateios;
  - bloqueio de duplicidade;
  - de-para;
  - etiquetas da entrada.
- [ ] **Balcão:** teclado e leitor, atalhos F2/F3/F6/F9/Esc, vários pagamentos com troco, baixa e emissão; cancelamento só pelo dono.
- [ ] **OS:** kanban e lista, cadastro rápido de moto, reserva de peças, serviços com mecânico, entrega com pagamento e baixa, histórico por placa e PDF.
- [ ] Conversão de orçamento em venda ou OS.
- [ ] Devoluções de cliente e ao fornecedor.
- [ ] **Fiscal pelo Focus**
  - NF-e e NFC-e;
  - fluxo assíncrono com webhook;
  - tela de rejeições;
  - cancelamento, carta de correção, inutilização e devolução;
  - séries por empresa.
- [ ] **Testes obrigatórios**
  - duas vendas simultâneas da última unidade;
  - cenários fiscais validados pelo contador.
- [ ] `docs/virada.md`: checklist do dia da virada e plano de volta.
- [ ] Fechamento da entrega.

## Entrega 4 — Mão de obra dos mecânicos

- [ ] Tela "Mão de obra" (dono): filtros de período, cards por mecânico, serviços e histórico.
- [ ] Botão "Pagar": acerto, `acerto_id` nos itens e auditoria.
- [ ] Tela "Meus ganhos" (mecânico).
- [ ] Fechamento da entrega.

## Entrega 5 — Recebimento de notas e pacote do contador

- [ ] MDe:
  1. notificação;
  2. ciência automática;
  3. download do XML para a conferência;
  4. confirmação automática;
  5. alerta perto dos 180 dias.
- [ ] Zip mensal de XMLs (emitidos, recebidos e externos).
- [ ] Relatório de inventário em 31/12 por NCM.
- [ ] Fechamento da entrega.

## Entrega 6 — Mercado Livre

- [ ] **Portão:** plano `docs/integracoes/mercadolivre.md` aprovado.
- [ ] OAuth por empresa.
- [ ] Vínculo de anúncios pelo SKU e lista dos sem vínculo.
- [ ] Sincronização de estoque e preço (outbox e worker).
- [ ] Pedidos por notificação: reserva, baixa e cancelamento.
- [ ] Registro da nota externa.
- [ ] Painel de erros com reenvio.
- [ ] Teste de disputa balcão × Mercado Livre pela última unidade.
- [ ] Fechamento da entrega.

## Entrega 7 — E-commerce

- [ ] API v1: disponibilidade, pedidos e status.
- [ ] Chaves por canal (hash), limite de requisições e log.
- [ ] Webhook de saída assinado com HMAC.
- [ ] `docs/api.md` (OpenAPI) com exemplos.
- [ ] Teste ponta a ponta com o e-commerce em homologação.
- [ ] Fechamento da entrega.

## Entrega 8 — Relatórios do dono

- [ ] Consolidado do tenant, por empresa e no total, sem as vendas intragrupo.
- [ ] Vendas por canal, margem, giro e abaixo do mínimo por empresa.
- [ ] Fechamento da entrega.

---

## Dependências do usuário

- [ ] Ativar o Docker Desktop com integração WSL (antes da Entrega 0).
- [ ] Criar o repositório no GitHub (antes do item 0.13).
- [ ] Acesso ao Coolify e ao R2 (item 0.13).
- [ ] Logos em `public/brand/`: `logo.svg`, `logo-negativo.svg` e `simbolo.svg`.
- [ ] Arquivo de exemplo exportado do TeraSoft (antes da Entrega 1).
