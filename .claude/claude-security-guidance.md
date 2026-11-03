# Regras de segurança do SUMMER (sistema multi-tenant de loja de moto peças)

## Isolamento (o risco nº 1)
- Hierarquia tenant → empresa. Toda tabela de negócio tem `empresa_id`. Exceções globais: `marcas_moto` e `modelos_moto`.
- `tenantId` e `empresaId` vêm SOMENTE de `getContext()` (sessão). Qualquer valor desses vindo de body, params, searchParams, headers ou campo de formulário é uma vulnerabilidade (IDOR).
- Todo SELECT/UPDATE/DELETE filtra por `empresa_id`, inclusive joins, subqueries, exportações CSV, PDFs (`/api/pdf/...`) e downloads do storage.
- Ids vindos do cliente (produto, cliente, OS, tabela de preço, mecânico) precisam ser conferidos como da empresa ativa antes de uso.
- Na API v1 (`/api/v1/*`), a empresa e o canal vêm da chave de API, nunca do payload.
- Relatórios consolidados só leem empresas em que o usuário é membro.

## Permissões (sempre no servidor)
- Perfis por empresa: `dono`, `balcao`, `estoque`, `mecanico`. Esconder botão não basta.
- `balcao` e `mecanico` nunca recebem custo ou margem: nem na query, nem em props de Client Component.
- `mecanico` só vê as próprias OS e os próprios ganhos.
- Só o `dono` cancela venda, reabre OS, altera código de produto, edita comissão e configura canal.
- Desconto acima do limite exige o PIN de um dono, guardado como hash e com tentativas limitadas, e gera auditoria.
- O admin da plataforma acessa só `/admin`; a flag não dá acesso aos dados das empresas.
- Módulo desligado em `empresas.modulos` é bloqueado no servidor.

## Segredos
- Credenciais de canais (Mercado Livre, e-commerce) e tokens do Focus NFe são criptografados no banco e nunca chegam ao navegador.
- Nenhum segredo com prefixo `NEXT_PUBLIC_`, em log ou em mensagem de erro.
- Chave de API é guardada só como hash e comparada em tempo constante.
- A senha do certificado A1 nunca é guardada em texto puro.

## Entradas externas
- Toda server action e todo route handler valida a entrada com Zod.
- O upload de XML de NF-e tem limite de tamanho e usa parser com entidades externas desligadas (XXE).
- Chave de storage não aceita path traversal e é validada como da empresa.
- Webhooks (Focus, Mercado Livre) gravam a notificação de forma idempotente, com índice único, antes de processar. Repetição não duplica efeito.
- O webhook de saída para o e-commerce é assinado com HMAC.
- A API v1 e o login têm limite de requisições.

## Integridade
- XMLs de notas fiscais nunca são apagados.
- `movimentacoes_estoque` e `auditoria` só recebem inserções.
- Documentos (vendas, OS, notas) nunca são apagados, só cancelados.
