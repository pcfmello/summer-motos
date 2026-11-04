# Teste da Entrega 0 — Fundação do SUMMER

Esta entrega ainda não é usada no dia a dia da loja. Ela prepara a base: entrar no sistema, trocar de empresa, ver o menu certo de cada pessoa e cadastrar uma loja nova. As telas de peças, orçamentos, balcão e OS vêm nas próximas entregas e, por enquanto, mostram "Em breve".

**Antes de começar:**
- Abra o endereço de homologação: `<endereço de homologação>`.
- Use os usuários de demonstração abaixo, com a senha que você recebeu.

| Usuário | Quem é |
|---|---|
| dono@demo.summer.local | Dono das duas empresas de demonstração |
| balcao@demo.summer.local | Balconista das duas empresas |
| estoque@demo.summer.local | Estoquista das duas empresas |
| mecanico@demo.summer.local | Mecânico só da "Moto Peças Demo Centro" |
| admin@demo.summer.local | Administrador do sistema (cadastra lojas novas) |

As duas empresas de demonstração são a **Moto Peças Demo Centro** (Simples Nacional) e a **Moto Peças Demo Distribuidora** (Lucro Real).

---

## 1. Entrar e sair do sistema

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 1.1 | Abra o endereço do sistema sem estar logado | Aparece a tela de login, com o logo do SUMMER | ☐ Sim ☐ Não | |
| 1.2 | Entre com `dono@demo.summer.local` e a senha certa | Abre a tela inicial, com o menu preto à esquerda e o nome da empresa no topo | ☐ Sim ☐ Não | |
| 1.3 | Clique no seu nome (canto da tela) e em **Sair** | Volta para a tela de login | ☐ Sim ☐ Não | |
| 1.4 | Tente entrar com a senha errada | Aparece um aviso de e-mail ou senha incorretos, sem dizer qual dos dois está errado | ☐ Sim ☐ Não | |
| 1.5 | Tente entrar com um e-mail que não existe | Aparece o **mesmo** aviso do passo 1.4 | ☐ Sim ☐ Não | |
| 1.6 | Erre a senha várias vezes seguidas (umas 11 vezes) | O sistema pede para esperar antes de tentar de novo | ☐ Sim ☐ Não | Depois de alguns minutos volta a deixar |

## 2. Trocar de empresa

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 2.1 | Entre como `dono@demo.summer.local` e veja qual empresa aparece no topo | Aparece uma das duas empresas de demonstração | ☐ Sim ☐ Não | |
| 2.2 | Clique no nome da empresa e escolha a outra | O nome no topo muda para a outra empresa | ☐ Sim ☐ Não | |
| 2.3 | Saia e entre de novo | O sistema volta na última empresa que você escolheu | ☐ Sim ☐ Não | |
| 2.4 | Entre como `mecanico@demo.summer.local` e clique no nome da empresa | Só aparece a **Moto Peças Demo Centro**. A Distribuidora **não pode** aparecer | ☐ Sim ☐ Não | |

## 3. Cada pessoa vê só o que pode

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 3.1 | Entre como **dono** e olhe o menu | Aparecem todos os itens, inclusive Relatórios e Configurações | ☐ Sim ☐ Não | |
| 3.2 | Entre como **balcão** e olhe o menu | **Não** aparecem Configurações nem Relatórios | ☐ Sim ☐ Não | |
| 3.3 | Entre como **mecânico** e olhe o menu | Aparecem só Início, OS e Peças por moto | ☐ Sim ☐ Não | |
| 3.4 | Entre como **estoque** e olhe o menu | Aparecem Produtos e Estoque; **não** aparece Balcão | ☐ Sim ☐ Não | |
| 3.5 | Logado como **balcão**, digite no endereço `/admin` | O sistema **não** abre a área de administração e volta para a tela inicial | ☐ Sim ☐ Não | |

## 4. Cadastrar uma loja nova (área de administração)

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 4.1 | Entre como `admin@demo.summer.local` | Abre direto a área de administração, com a lista de lojas | ☐ Sim ☐ Não | |
| 4.2 | Crie uma loja nova chamada "Loja Teste Homologação" | A loja aparece na lista | ☐ Sim ☐ Não | |
| 4.3 | Dentro dela, crie uma empresa com um CNPJ **errado** (troque o último número) | O sistema avisa que o CNPJ é inválido e não deixa salvar | ☐ Sim ☐ Não | |
| 4.4 | Crie a empresa com um CNPJ válido | A empresa aparece na loja, com todas as funções (balcão, OS, fiscal…) **desligadas** | ☐ Sim ☐ Não | |
| 4.5 | Ligue a função **Balcão** dessa empresa | A função fica ligada | ☐ Sim ☐ Não | |
| 4.6 | Convide um dono com um e-mail seu (que ainda não usa o SUMMER) | Aparece um **link** de convite, com o botão "Copiar link". **Nenhuma senha** aparece | ☐ Sim ☐ Não | |
| 4.7 | Tente convidar um segundo dono, com outro e-mail, para a mesma empresa | O sistema não deixa: novos donos são convidados pelo dono da loja | ☐ Sim ☐ Não | |
| 4.8 | Logado como admin, digite no endereço a tela inicial (`/`) | O sistema volta para a administração. O admin **não** vê dados de nenhuma loja | ☐ Sim ☐ Não | |

## 5. Aceitar o convite e trocar a senha

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 5.1 | Saia, abra o link do passo 4.6 e preencha seu nome e uma senha (mínimo 10 caracteres) | Você entra direto no sistema, já na empresa nova, como dono | ☐ Sim ☐ Não | |
| 5.2 | Saia e abra o **mesmo** link de novo | Aparece "Convite indisponível". O link só vale uma vez | ☐ Sim ☐ Não | |
| 5.3 | Entre com a conta nova, clique no seu nome e em **Minha conta** | Abre a tela com seu nome e e-mail | ☐ Sim ☐ Não | |
| 5.4 | Troque a senha | Aparece a confirmação. Saia e entre com a senha nova | ☐ Sim ☐ Não | |
| 5.5 | Ainda com a conta nova, clique no nome da empresa no topo | Só aparece a empresa nova. As empresas de demonstração **não podem** aparecer | ☐ Sim ☐ Não | |

## 6. No celular e no tablet

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 6.1 | Abra o sistema no celular e entre como **mecânico** | A tela se ajusta; o menu fica escondido atrás de um botão | ☐ Sim ☐ Não | |
| 6.2 | Toque no botão do menu | O menu abre por cima da tela e fecha ao escolher um item | ☐ Sim ☐ Não | |
| 6.3 | Repita no tablet | A tela fica legível e os botões são fáceis de tocar | ☐ Sim ☐ Não | |

## 7. Aparência

| # | Faça isto | O que deve acontecer | Deu certo? | Observação |
|---|-----------|----------------------|------------|------------|
| 7.1 | Olhe as cores das telas | Fundo branco, menu preto, botões principais pretos. O vermelho da marca aparece só em destaques (item ativo do menu, foco) | ☐ Sim ☐ Não | |
| 7.2 | Olhe o logo no topo do menu e na tela de login | Hoje aparece um logo **provisório** ("SUMMER" com uma estrela). O logo oficial entra quando a loja enviar os arquivos | ☐ Sim ☐ Não | |

---

**Duração:** cerca de 30 a 40 minutos.

## Encontrou um problema?

Anote o número do passo, tire um print da tela e mande para `<contato>`. Se algo não ficou claro neste roteiro, mande também: o roteiro é ajustado para as próximas entregas.
