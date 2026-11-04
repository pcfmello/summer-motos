/**
 * Serviço de estoque (regra 4.2; seções 6 e 13 do modelo de dados).
 *
 * É o **único caminho** que grava em `estoque_saldos` e `movimentacoes_estoque`.
 * As regras de cálculo ficam em `server/domain/estoque` (puras, com testes); aqui
 * ficam a ordem das travas e as gravações, sempre no `tx` de quem chama
 * (`withTransaction`). O serviço nunca abre transação própria, não checa perfil
 * nem módulo (é papel da action) e não faz nada fora do banco.
 *
 * Fluxo comum a toda operação (13.1), na ordem:
 *  1. valida os itens no domínio e os ordena por `produto_id`;
 *  2. trava o documento de origem, quando houver (`FOR UPDATE`), e o depósito (`FOR SHARE`);
 *  3. confere que os produtos são da empresa e estão ativos (a FK composta é a última barreira);
 *  4. garante as linhas de saldo (`INSERT ... ON CONFLICT DO NOTHING`, em ordem);
 *  5. trava os saldos numa única query ordenada (`SELECT ... ORDER BY produto_id FOR UPDATE`);
 *  6. calcula no domínio **depois** da trava, grava os movimentos e atualiza os saldos;
 *  7. grava a `outbox` dos produtos cujo disponível mudou.
 *
 * **Uma operação trava todos os seus saldos de uma vez.** Duas chamadas na mesma
 * transação com produtos sobrepostos quebram a ordem global das travas e podem
 * dar deadlock com uma venda: uma operação que gera vários tipos de movimento
 * (ex.: aplicar o inventário, com `saldo_inicial` e `ajuste_inventario`) é uma
 * função só, que trava tudo antes e decide depois.
 *
 * Nesta fase só existe o saldo inicial do seed. Entrada, saída, reserva, ajuste,
 * estorno e a aplicação do inventário entram na Entrega 3 reaproveitando as peças
 * abaixo (`travarDepositoVendavel`, `conferirProdutos`, `garantirETravarSaldos`,
 * `inserirMovimentos`, `atualizarSaldos` e `gravarOutboxDisponivel`).
 *
 * Imports só relativos (sem `@/`), para o worker e os scripts poderem empacotá-lo (D020).
 */
import { and, asc, eq, inArray, sql } from "drizzle-orm";

import type { Transacao } from "../db/conexao";
import { depositos, estoqueSaldos, movimentacoesEstoque, outbox, produtos } from "../db/schema";
import { type ValorDecimal, paraNumeric } from "../domain/decimal";
import {
  ErroEstoque,
  type TipoMovimento,
  aplicarEntrada,
  ordenarItensPorProduto,
  validarMovimento,
} from "../domain/estoque";

/** Quem lança. `usuario: null` = o sistema (worker, seed). Nunca vem do cliente. */
export type ContextoEstoque = {
  empresaId: string;
  usuario: { id: string } | null;
};

/** Linha de saldo travada, como o Drizzle a devolve (`numeric` em string). */
type SaldoTravado = {
  id: string;
  produtoId: string;
  quantidade: string;
  quantidadeReservada: string;
  custoMedio: string | null;
  ultimoCusto: string | null;
};

/** Movimento gravado, devolvido a quem chamou (para o kardex, a auditoria ou o inventário). */
export type MovimentoGravado = {
  movimentacaoId: string;
  produtoId: string;
  depositoId: string;
  tipo: TipoMovimento;
  /** Com sinal, em 4 casas. */
  quantidade: string;
  /** Custo efetivo do movimento (o informado ou o de `aplicarEntrada`); nulo = desconhecido. */
  custoUnitario: string | null;
  saldoApos: string;
  custoMedioApos: string | null;
};

/**
 * Linhas por comando. O Postgres aceita até 65.535 parâmetros por comando, e o
 * INSERT de movimento usa ~13 por linha: um inventário "todos" de uma loja grande
 * passaria do limite num comando só. Os blocos seguem a ordem de `produto_id`.
 */
const TAMANHO_BLOCO = 1_000;

function emBlocos<T>(lista: readonly T[]): T[][] {
  const blocos: T[][] = [];
  for (let i = 0; i < lista.length; i += TAMANHO_BLOCO) blocos.push(lista.slice(i, i + TAMANHO_BLOCO));
  return blocos;
}

// ---------------------------------------------------------------- Peças reaproveitáveis

/**
 * Depósito do movimento: o informado ou o padrão ("Loja") da empresa, travado com
 * `FOR SHARE` (não deixa de ser vendável no meio da operação). Recusa depósito de
 * outra empresa, inativo ou não vendável ("Garantia", D28 do modelo).
 */
async function travarDepositoVendavel(
  tx: Transacao,
  ctx: ContextoEstoque,
  depositoId: string | undefined,
): Promise<string> {
  const [deposito] = await tx
    .select({ id: depositos.id, vendavel: depositos.vendavel, ativo: depositos.ativo })
    .from(depositos)
    .where(
      and(
        eq(depositos.empresaId, ctx.empresaId),
        depositoId === undefined ? eq(depositos.padrao, true) : eq(depositos.id, depositoId),
      ),
    )
    .for("share");
  if (!deposito) throw new ErroEstoque("deposito_invalido", "Depósito não encontrado nesta empresa.");
  if (!deposito.ativo || !deposito.vendavel) {
    throw new ErroEstoque("deposito_invalido", "O saldo só pode ser lançado num depósito vendável e ativo.");
  }
  return deposito.id;
}

/**
 * Confere que todos os produtos existem **nesta empresa** e estão ativos, e lista
 * exatamente os que não estão. A FK composta `(empresa_id, produto_id)` continua
 * sendo a última barreira no banco.
 */
async function conferirProdutos(tx: Transacao, ctx: ContextoEstoque, produtoIds: readonly string[]): Promise<void> {
  const validos = new Set<string>();
  for (const bloco of emBlocos(produtoIds)) {
    const linhas = await tx
      .select({ id: produtos.id })
      .from(produtos)
      .where(and(eq(produtos.empresaId, ctx.empresaId), inArray(produtos.id, bloco), eq(produtos.ativo, true)));
    for (const l of linhas) validos.add(l.id);
  }
  const invalidos = produtoIds.filter((id) => !validos.has(id));
  if (invalidos.length > 0) {
    throw new ErroEstoque("produto_invalido", "Produto não encontrado nesta empresa ou inativo.", invalidos);
  }
}

/**
 * Passos 4 e 5: cria as linhas de saldo que faltam e trava todas, sempre em ordem
 * de `produto_id` (`produtoIds` já vem ordenado pelo domínio).
 *
 * O INSERT também trava a chave nova: na disputa pela mesma linha, a segunda
 * transação espera o commit da primeira e cai no `DO NOTHING`. O SELECT em seguida
 * trava as linhas na ordem do `ORDER BY` (o `LockRows` fica acima do `Sort`), numa
 * query só, para a ordem valer entre todos os produtos da operação.
 */
async function garantirETravarSaldos(
  tx: Transacao,
  ctx: ContextoEstoque,
  depositoId: string,
  produtoIds: readonly string[],
): Promise<Map<string, SaldoTravado>> {
  for (const bloco of emBlocos(produtoIds)) {
    await tx
      .insert(estoqueSaldos)
      .values(bloco.map((produtoId) => ({ empresaId: ctx.empresaId, produtoId, depositoId })))
      .onConflictDoNothing({ target: [estoqueSaldos.produtoId, estoqueSaldos.depositoId] });
  }

  // `= any($1::uuid[])`: um parâmetro só, qualquer que seja o número de produtos
  const linhas = await tx
    .select({
      id: estoqueSaldos.id,
      produtoId: estoqueSaldos.produtoId,
      quantidade: estoqueSaldos.quantidade,
      quantidadeReservada: estoqueSaldos.quantidadeReservada,
      custoMedio: estoqueSaldos.custoMedio,
      ultimoCusto: estoqueSaldos.ultimoCusto,
    })
    .from(estoqueSaldos)
    .where(
      and(
        eq(estoqueSaldos.empresaId, ctx.empresaId),
        eq(estoqueSaldos.depositoId, depositoId),
        sql`${estoqueSaldos.produtoId} = any(${sql.param([...produtoIds])}::uuid[])`,
      ),
    )
    .orderBy(asc(estoqueSaldos.produtoId))
    .for("update");

  const porProduto = new Map(linhas.map((l) => [l.produtoId, l]));
  const faltando = produtoIds.filter((id) => !porProduto.has(id));
  if (faltando.length > 0) {
    throw new ErroEstoque("saldo_nao_encontrado", "Saldo não encontrado para o produto.", faltando);
  }
  return porProduto;
}

type NovoMovimento = Omit<typeof movimentacoesEstoque.$inferInsert, "id" | "empresaId" | "createdAt" | "updatedAt">;

/** Insere os movimentos (append-only) em blocos e devolve o id de cada um, por produto. */
async function inserirMovimentos(
  tx: Transacao,
  ctx: ContextoEstoque,
  movimentos: readonly NovoMovimento[],
): Promise<Map<string, string>> {
  const idPorProduto = new Map<string, string>();
  for (const bloco of emBlocos(movimentos)) {
    const inseridos = await tx
      .insert(movimentacoesEstoque)
      .values(bloco.map((m) => ({ ...m, empresaId: ctx.empresaId })))
      .returning({ id: movimentacoesEstoque.id, produtoId: movimentacoesEstoque.produtoId });
    for (const m of inseridos) idPorProduto.set(m.produtoId, m.id);
  }
  return idPorProduto;
}

/** Atualiza os saldos travados com um UPDATE por bloco (`UPDATE ... FROM (VALUES ...)`). */
async function atualizarSaldos(
  tx: Transacao,
  ctx: ContextoEstoque,
  novos: readonly { saldoId: string; quantidade: string; custoMedio: string | null; ultimoCusto: string | null }[],
): Promise<void> {
  for (const bloco of emBlocos(novos)) {
    const valores = sql.join(
      bloco.map(
        (n) => sql`(${n.saldoId}::uuid, ${n.quantidade}::numeric, ${n.custoMedio}::numeric, ${n.ultimoCusto}::numeric)`,
      ),
      sql`, `,
    );
    await tx.execute(sql`
      update estoque_saldos s
         set quantidade = v.quantidade, custo_medio = v.custo_medio, ultimo_custo = v.ultimo_custo
        from (values ${valores}) as v (id, quantidade, custo_medio, ultimo_custo)
       where s.id = v.id and s.empresa_id = ${ctx.empresaId}
    `);
  }
}

/**
 * Passo 7: um evento `produto.disponivel_alterado` por produto, na mesma transação
 * (modelo 8.7). Quem chama passa **só** os movimentos que mudaram o disponível num
 * depósito vendável (a entrega da OS e o faturamento do pedido não mudam; o
 * depósito "Garantia" não conta). O payload não leva quantidade: o worker calcula
 * a quantidade publicada no momento do envio, depois de agrupar os eventos.
 */
async function gravarOutboxDisponivel(
  tx: Transacao,
  ctx: ContextoEstoque,
  movimentos: readonly MovimentoGravado[],
): Promise<void> {
  for (const bloco of emBlocos(movimentos)) {
    await tx.insert(outbox).values(
      bloco.map((m) => ({
        empresaId: ctx.empresaId,
        tipo: "produto.disponivel_alterado" as const,
        produtoId: m.produtoId,
        payload: { deposito_id: m.depositoId, movimentacao_id: m.movimentacaoId, tipo_movimento: m.tipo },
      })),
    );
  }
}

// ---------------------------------------------------------------- Saldo inicial do seed

export type ItemSaldoInicial = {
  produtoId: string;
  /** Positiva, até 4 casas, na unidade de estoque. */
  quantidade: ValorDecimal;
  /**
   * Custo por unidade de estoque, até 6 casas. `null` = custo desconhecido (D25 do
   * modelo): a peça entra pelo médio ou pelo último custo, se houver; senão, nulo.
   */
  custoUnitario: ValorDecimal | null;
};

export type OpcoesSaldoInicial = {
  /** Motivo gravado no movimento (ex.: "Seed de demonstração"). Obrigatório. */
  motivo: string;
  /** Padrão: o depósito padrão ("Loja") da empresa. */
  depositoId?: string;
};

/**
 * Lança saldo inicial (movimento `saldo_inicial`, sem documento de origem) de
 * vários produtos num depósito vendável. **Só para o seed e cargas antes da
 * virada**: não grava auditoria nem exige custo. O inventário da virada (13.7)
 * terá a própria operação na Entrega 3, que trava os saldos antes de calcular a
 * diferença sobre o saldo do momento e marca cada item aplicado.
 *
 * Cada produto aparece uma vez só. A quantidade é somada ao saldo atual (o saldo
 * inicial só soma). O custo informado recalcula o médio (regra 4.5) e vira o
 * último custo; o custo nulo segue `aplicarEntrada`.
 *
 * Erros de regra saem como `ErroEstoque` (a transação inteira é desfeita), com a
 * lista dos produtos envolvidos.
 */
export async function lancarSaldoInicial(
  tx: Transacao,
  ctx: ContextoEstoque,
  itens: readonly ItemSaldoInicial[],
  opcoes: OpcoesSaldoInicial,
): Promise<MovimentoGravado[]> {
  const motivo = opcoes.motivo?.trim();
  if (!motivo) throw new ErroEstoque("movimento_invalido", "O lançamento de saldo inicial exige um motivo.");
  if (itens.length === 0) return [];
  const tipo: TipoMovimento = "saldo_inicial";

  // 1. domínio: ordem das travas e regras do movimento
  const ordenados = ordenarItensPorProduto(itens);
  const invalidos = ordenados
    .map((item) => ({ item, r: validarMovimento({ tipo, quantidade: item.quantidade, custoUnitario: item.custoUnitario }) }))
    .filter(({ r }) => !r.ok);
  if (invalidos.length > 0) {
    const primeiro = invalidos[0].r;
    throw new ErroEstoque(
      "movimento_invalido",
      primeiro.ok ? "Movimento inválido." : primeiro.mensagem,
      invalidos.map(({ item }) => item.produtoId),
    );
  }
  const produtoIds = ordenados.map((i) => i.produtoId);

  // 2 a 5. depósito, produtos e saldos travados em ordem de produto_id
  const depositoId = await travarDepositoVendavel(tx, ctx, opcoes.depositoId);
  await conferirProdutos(tx, ctx, produtoIds);
  const saldos = await garantirETravarSaldos(tx, ctx, depositoId, produtoIds);

  // 6. cálculo no domínio sobre o saldo travado; movimentos e saldos
  const calculados = ordenados.map((item) => {
    const saldo = saldos.get(item.produtoId) as SaldoTravado;
    const depois = aplicarEntrada(saldo, { quantidade: item.quantidade, custoUnitario: item.custoUnitario });
    const custo = (valor: typeof depois.custoMedio) => (valor === null ? null : paraNumeric(valor, "custo"));
    return {
      produtoId: item.produtoId,
      saldoId: saldo.id,
      quantidade: paraNumeric(item.quantidade, "quantidade"),
      custoUnitario: custo(depois.custoMovimento),
      saldoApos: paraNumeric(depois.quantidade, "quantidade"),
      custoMedioApos: custo(depois.custoMedio),
      ultimoCusto: custo(depois.ultimoCusto),
    };
  });

  const idPorProduto = await inserirMovimentos(
    tx,
    ctx,
    calculados.map((c) => ({
      produtoId: c.produtoId,
      depositoId,
      tipo,
      quantidade: c.quantidade,
      custoUnitario: c.custoUnitario,
      saldoApos: c.saldoApos,
      custoMedioApos: c.custoMedioApos,
      motivo,
      usuarioId: ctx.usuario?.id ?? null,
    })),
  );
  await atualizarSaldos(
    tx,
    ctx,
    calculados.map((c) => ({
      saldoId: c.saldoId,
      quantidade: c.saldoApos,
      custoMedio: c.custoMedioApos,
      ultimoCusto: c.ultimoCusto,
    })),
  );

  const movimentos: MovimentoGravado[] = calculados.map((c) => ({
    movimentacaoId: idPorProduto.get(c.produtoId) as string,
    produtoId: c.produtoId,
    depositoId,
    tipo,
    quantidade: c.quantidade,
    custoUnitario: c.custoUnitario,
    saldoApos: c.saldoApos,
    custoMedioApos: c.custoMedioApos,
  }));

  // 7. o saldo inicial sempre soma num depósito vendável: o disponível mudou em todos
  await gravarOutboxDisponivel(tx, ctx, movimentos);
  return movimentos;
}
