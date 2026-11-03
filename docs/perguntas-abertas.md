# Perguntas em aberto

Responda pelo número, por exemplo "P7: não, só registrar a devolução" ou "D3: sim". O que não for respondido segue a proposta.

## Modelo de dados

As perguntas **P1 a P16** estão na seção 14 de [`modelo-dados.md`](modelo-dados.md):
- P1 a P13 são para o diretor da loja;
- P14 a P16 são para o contador.

A aprovação do modelo libera o banco, o login, a área de admin e o seed da Entrega 0.

## Regras de cálculo

Surgiram durante a Entrega 0. Hoje o sistema segue a proposta de cada uma.

| # | Pergunta | Proposta (como está hoje) |
|---|---|---|
| D1 | Um óleo tem 7,5 litros disponíveis. Quanto o anúncio do Mercado Livre e do site mostra? | 7: os canais vendem unidades inteiras, então arredonda para baixo. |
| D2 | O GTIN fiscal (código de barras que vai na nota) já recusa códigos de 13 dígitos começando com 2, de uso interno. A GS1 também reserva para uso interno os códigos de 12 dígitos começando com 2 e os de 8 dígitos começando com 0 ou 2. Recusamos esses também? | Sim, recusar também, para a SEFAZ não rejeitar a nota. Hoje ainda são aceitos, até você confirmar. |
| D3 | A loja arredonda os preços (ex.: terminar em ,90). Isso vale também para o preço calculado por uma tabela, como "último custo + 30%"? | Sim, para preço calculado. Um preço fixo digitado na tabela nunca é arredondado. |
| D4 | Na entrada manual de uma caixa com 10 unidades, o custo digitado é o da caixa ou o de cada unidade? | O da caixa (unidade de compra). A tela mostra ao lado o custo por unidade resultante. |
| D5 | Na virada, a contagem do estoque inicial vai trazer o custo de cada peça (do TeraSoft)? Sem custo, o custo médio fica errado. Ex.: 10 peças a R$ 0 + 10 compradas a R$ 20 = custo médio de R$ 10, metade do real. | Sim: o saldo inicial exige o custo, importado do TeraSoft. Peça sem custo fica marcada como "sem custo" e não entra na margem até ter um. |

## Notas técnicas para as próximas entregas (não precisam de resposta)

- **Entrega 1 (importação e formulário de produto):** markup vazio vira "sem markup" (herda o da categoria), nunca 0%, com teste. Markup 0% é uma escolha explícita.
- **Produto sem preço numa tabela** (sem custo e sem preço fixo): não pode ser vendido nem publicado nessa tabela até ter preço.
