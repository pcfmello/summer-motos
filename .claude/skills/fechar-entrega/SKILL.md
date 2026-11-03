---
name: fechar-entrega
description: Checklist de fechamento de uma entrega do SUMMER. Roda lint, typecheck, testes e build; escreve o resumo, o roteiro de homologação na linguagem do diretor da loja e as pendências; atualiza CHANGELOG.md e docs/plano.md. Use ao terminar uma entrega ou quando pedirem o roteiro de homologação.
argument-hint: "[número da entrega]"
---

# Fechar a Entrega $ARGUMENTS

## 1. Verificação (sem isto, a entrega não está pronta)

Rode e mostre o resultado real de:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (domínio e integração) e `pnpm build`;
- as migrações aplicadas do zero num banco vazio;
- o seed rodado duas vezes seguidas, para provar que é idempotente.

Se algo falhar, pare e relate a saída. Não escreva o roteiro como se estivesse pronto.

## 2. Conferência do plano

Para cada item da entrega em `docs/plano.md`, marque: feito, parcial (o que falta) ou não feito.

## 3. Pronto para produção?

- [ ] As migrações só acrescentam; a versão anterior do app funciona com o banco novo.
- [ ] Os módulos novos nascem desligados em produção (`empresas.modulos`).
- [ ] As variáveis de ambiente novas estão no `.env.example` e em `docs/deploy.md`.
- [ ] O deploy está planejado fora do horário da loja, com backup do banco antes.

## 4. O que entregar ao usuário

**a) Resumo**
Curto: o que foi feito, as decisões técnicas tomadas (com link para `docs/decisoes.md`) e os riscos conhecidos.

**b) Roteiro de homologação para o diretor da loja**
Salve em `docs/homologacao/entrega-<N>.md`, para poder imprimir ou enviar, e mostre na resposta.

Escreva como se fosse para quem conhece a loja, não o sistema:

- **Sem jargão.** Nada de "action", "endpoint", "migração", "tenant" ou "seed". Use "loja", "empresa", "tela", "botão", "cadastro".
- **Organização.** Agrupe por tarefa da loja ("Cadastrar uma peça nova", "Imprimir etiquetas"). Cada passo diz o que fazer e o que deve acontecer.
- **Testes de "não pode".** Ex.: "Tente vender mais unidades do que tem: o sistema deve avisar quais peças faltam."
- **Troca de empresa.** Inclua: os dados da outra empresa não podem aparecer.
- **Celular e tablet.** Inclua quando a entrega tiver telas de OS, inventário ou etiquetas.
- **Dados para usar.** Cite os de demonstração (nomes de peças, clientes, usuários). Nunca escreva senhas: diga "a senha que você recebeu".
- **Duração.** Termine com quanto tempo leva, mais ou menos, e como avisar um problema.

Modelo:

```markdown
# Teste da Entrega N — <nome>

Antes de começar: entre em <endereço de homologação> com o usuário <usuário>.

## 1. <Tarefa da loja>
| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 1.1 | ... | ... | ☐ Sim ☐ Não | |

## Encontrou um problema?
Anote o número do passo, tire um print da tela e mande para <contato>.
```

**c) Pendências**
O que ficou para depois, as limitações conhecidas e as perguntas abertas, separadas em: para o diretor, para o contador e técnicas. Inclua os arquivos que faltam (ex.: `public/brand/logo-negativo.svg`).

## 5. CHANGELOG.md (em português, para a loja)

Descreva o que a loja vê de novo, não o que mudou no código. Formato:

```markdown
## [0.N.0] — AAAA-MM-DD — Entrega N: <nome>
### Novidades
- Agora dá para ...
### Melhorias
- ...
### Correções
- ...
```

Versão semântica. A tag no git só é criada quando a entrega for aprovada para produção.

## 6. Depois

Atualize `docs/plano.md`. Não comece a próxima entrega sem o usuário pedir.
