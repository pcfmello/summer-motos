# Perguntas em aberto

Responda pelo número, por exemplo "P2: não, o vendedor não perde a comissão". O que não for respondido segue a proposta.

## Já respondidas

- **Modelo de dados:** R1 a R13, na seção 14.1 de [`modelo-dados.md`](modelo-dados.md) e na D018 de [`decisoes.md`](decisoes.md).
- **Regras de cálculo D1 a D5 e decisão técnica T1:** seguem a proposta (D019 e D020).

## Para o diretor da loja

| # | Pergunta | Proposta |
|---|---|---|
| P1 | A comissão do vendedor é calculada sobre o valor das peças **antes ou depois do desconto**? Ex.: peças de R$ 100 com 10% de desconto e vendedor com 5% de comissão. | **Depois do desconto:** 5% de R$ 90 = R$ 4,50. |
| P2 | Uma venda é cancelada, ou o cliente devolve uma peça, **depois** que o vendedor já recebeu a comissão. Ele perde essa comissão? | **Sim:** o valor é descontado no próximo pagamento. Se o cancelamento acontecer antes do pagamento, a comissão simplesmente não conta. |
| P3 | Na venda de balcão, o vendedor é sempre quem está no caixa? | A tela já vem com quem está no caixa, se ele for vendedor, e pode ser trocada. |
| P4 | Uma OS já fechada tem a mão de obra cobrada errada. Como corrigir, já que a OS não pode ser reaberta? | Devolver ao cliente o valor cobrado a mais, como uma devolução de mão de obra. O estoque e a comissão do mecânico não mudam. |

## Para o contador (não travam o trabalho até a Entrega 3)

| # | Pergunta |
|---|---|
| P5 | Qual CFOP e qual natureza da operação usar em cada tipo de venda, por empresa (com e sem ST, dentro e fora do estado)? |
| P6 | Peça com defeito enviada ao fornecedor na garantia: a nota é de devolução de compra ou de remessa em garantia? E quando não há a nota de compra? |
| P7 | Um cliente comprou com cupom fiscal (NFC-e) e devolveu a peça. A loja emite nota de entrada? |

## Notas técnicas para as próximas entregas (não precisam de resposta)

- **Entrega 1 (importação e formulário de produto):** markup vazio vira "sem markup" (herda o da categoria), nunca 0%, com teste. Markup 0% é uma escolha explícita.
- **Produto sem preço numa tabela** (sem custo e sem preço fixo): não pode ser vendido nem publicado nessa tabela até ter preço.
- **Entrega 3 (fiscal):** a NFC-e com "CPF na nota" de quem não é cliente cadastrado precisa de um lugar na venda. Isso entra no plano do Focus.
- **Banco:** criar o banco com collation ICU `pt-BR`, para a ordenação por nome e descrição sair certa.
