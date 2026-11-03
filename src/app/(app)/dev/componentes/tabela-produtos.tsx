"use client";

import Decimal from "decimal.js";
import { PackageIcon } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import {
  TabelaInfinita,
  type ColunaTabela,
  type TabelaInfinitaProps,
} from "@/components/tabela-dados";
import { formatarMoeda, formatarQuantidade } from "@/lib/formatacao";

import type { ProdutoFicticio } from "./_dados-ficticios";

// Colunas num módulo cliente: funções de célula não atravessam a fronteira
// servidor → cliente; da página só vêm dados simples.

function statusEstoque(produto: ProdutoFicticio) {
  const quantidade = new Decimal(produto.quantidade);
  if (quantidade.lte(0)) return <StatusBadge variante="destrutivo">Sem estoque</StatusBadge>;
  if (quantidade.lt(produto.minimo)) return <StatusBadge variante="alerta">Abaixo do mínimo</StatusBadge>;
  return <StatusBadge variante="sucesso">Em estoque</StatusBadge>;
}

const COLUNAS: ColunaTabela<ProdutoFicticio>[] = [
  { id: "codigo", cabecalho: "Código", celula: (p) => <span className="font-mono">{p.codigo}</span> },
  {
    id: "descricao",
    cabecalho: "Descrição",
    celula: (p) => (
      <span className="flex flex-col">
        <span className="font-medium">{p.descricao}</span>
        <span className="text-xs text-muted-foreground">
          {p.marca} · Ref. {p.referencia}
        </span>
      </span>
    ),
  },
  { id: "saldo", cabecalho: "Saldo", alinhar: "fim", celula: (p) => formatarQuantidade(p.quantidade, p.unidade) },
  { id: "status", cabecalho: "Estoque", celula: statusEstoque },
  { id: "preco", cabecalho: "Preço", alinhar: "fim", celula: (p) => formatarMoeda(p.preco) },
];

function CartaoProduto(p: ProdutoFicticio) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col">
          <span className="font-medium">{p.descricao}</span>
          <span className="text-xs text-muted-foreground">
            <span className="font-mono">{p.codigo}</span> · {p.marca}
          </span>
        </div>
        <span className="shrink-0 font-semibold tabular-nums">{formatarMoeda(p.preco)}</span>
      </div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="tabular-nums">{formatarQuantidade(p.quantidade, p.unidade)}</span>
        {statusEstoque(p)}
      </div>
    </div>
  );
}

type TabelaProdutosProps = Pick<
  TabelaInfinitaProps<ProdutoFicticio>,
  "linhasIniciais" | "total" | "proximoCursor" | "carregarMais" | "busca" | "hrefLimparBusca"
>;

export function TabelaProdutos(props: TabelaProdutosProps) {
  return (
    <TabelaInfinita
      {...props}
      rotulo="Produtos fictícios"
      colunas={COLUNAS}
      chaveLinha={(p) => p.id}
      cartao={CartaoProduto}
      vazio={{ titulo: "Nenhum produto cadastrado", icone: PackageIcon }}
    />
  );
}
