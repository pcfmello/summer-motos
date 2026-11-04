# Perguntas em aberto

Responda pelo número, por exemplo "P2: não, o vendedor não perde a comissão". O que não for respondido segue a proposta.

## Já respondidas

- **Modelo de dados:** R1 a R13, na seção 14.1 de [`modelo-dados.md`](modelo-dados.md) e na D018 de [`decisoes.md`](decisoes.md).
- **Regras de cálculo D1 a D5 e decisão técnica T1:** seguem a proposta (D019 e D020).

## Para o diretor da loja

As perguntas sobre a comissão do vendedor foram respondidas em 2026-11-03 (D021).

| # | Pergunta | Como está hoje |
|---|---|---|
| P8 | Quem pode fazer o quê nos pontos que a especificação não definia? | **Só o dono:** alterar preços; gerir os cadastros de perfis tributários, tabelas de preço, serviços, mecânicos e vendedores; fazer devolução de cliente; cancelar OS. **Balcão:** lança peças e serviços na OS e entrega a OS (com o pagamento), mas não muda o status no quadro. **Dono e mecânico:** mudam o status da OS. **Etiquetas:** só dono e estoque. Diga o que quer diferente. |
| P9 | O **markup** (a porcentagem que forma o preço sugerido) conta como alteração de preço? | Sim: só o dono altera o markup do produto e da categoria. O estoque cadastra a peça, e o dono define o preço. |
| P10 | Um mecânico ou balconista lança na OS um serviço que não está na tabela ("descrição livre"). Quem define a comissão do mecânico nesse serviço? | O dono define. Até lá, o serviço aparece como "comissão a definir" para ele. |
| P11 | A OS só pode ser marcada como **entregue** depois de passar por **"pronta"**? | Sim: o fluxo é aberta → em execução → pronta → entregue. Isso evita entregar uma moto que o mecânico não terminou. |

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
