---
name: nova-fatia
description: Roteiro para implementar uma fatia vertical do SUMMER (schema → domínio → action/query → tela → teste → revisão → commit). Use ao começar qualquer funcionalidade nova ou item do docs/plano.md.
argument-hint: "[o que a fatia entrega]"
---

# Nova fatia vertical

Fatia pedida: $ARGUMENTS

## 0. Contexto

- Leia `docs/plano.md` e confirme que a fatia pertence à entrega atual. Não comece a próxima entrega sem o usuário pedir.
- Leia `docs/modelo-dados.md` e `docs/decisoes.md`. Na Entrega 0, nenhuma migração antes de o usuário aprovar o modelo de dados.
- Liste as regras da seção 4 da especificação que a fatia toca.

## 1. Dúvidas antes de codar

- Regra de negócio ambígua: pergunte ao usuário com opções e uma recomendação, e espere a resposta.
- Decisão técnica menor: decida e registre em `docs/decisoes.md`.

## 2. Passos

Delegue aos agentes quando o trabalho for grande; quando for pequeno, faça direto.

| Passo | Quem | O que garantir |
|---|---|---|
| Schema | `backend` + skill `migracao-drizzle` | migração aditiva, SQL revisado, unicidade por empresa |
| Domínio | `backend` (testes com `testes`) | função pura em `src/server/domain/<modulo>`, teste Vitest antes da implementação |
| Action / query | `backend` | Zod → `getContext()` → permissão e módulo → `withTransaction` → auditoria e outbox; queries filtradas por empresa |
| Tela | `ui-ux` | shadcn, tokens da seção 2.1, pt-BR, estados de carregando/vazio/erro, responsivo quando for OS/inventário/etiquetas |
| Integração | `testes` | obrigatório se tocar estoque, reserva, numeração ou acesso a dados (isolamento A × B e X × Y) |

## 3. Revisão

Rode em paralelo, sobre o diff da fatia:

- `revisor-multitenant`: sempre que houver action, query, route handler, job ou schema novo;
- `revisor-estoque`: sempre que tocar saldo, reserva, custo, preço, desconto, numeração ou documento.

Corrija os bloqueadores e os importantes antes de seguir. Sugestões podem virar pendência.

## 4. Verificação

Rode `pnpm lint`, `pnpm typecheck` e `pnpm test` (ou os scripts do `package.json`) e mostre o resultado real. Se mexeu em tela, confira no app rodando (skill `next-dev-loop`, se disponível). Não declare a fatia pronta com verificação falhando.

## 5. Commit

- Um commit pequeno por fatia, em Conventional Commits: `tipo(escopo): descrição`, com o escopo sendo o módulo (`estoque`, `produtos`, `auth`…).
- Ex.: `feat(produtos): gerar EAN-13 interno`.
- Schema, migração SQL, snapshot, código e testes vão juntos.

## 6. Fechamento da fatia

Marque o item em `docs/plano.md` e diga ao usuário o que ficou pronto, o que ficou pendente e as perguntas em aberto.
