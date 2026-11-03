import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PackageIcon, RefreshCwIcon } from "lucide-react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { StatusBadge } from "@/components/status-badge";
import {
  CampoBusca,
  lerParametrosTabela,
  TabelaDados,
  TabelaDadosCarregando,
  type ColunaTabela,
  type SearchParams,
} from "@/components/tabela-dados";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Decimal from "decimal.js";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
} from "@/lib/formatacao";

import { consultarProdutosFicticios, type ProdutoFicticio } from "./_dados-ficticios";
import { DemonstracaoDialogo } from "./demonstracao-dialogo";
import { FormularioExemplo } from "./formulario-exemplo";

export const metadata: Metadata = { title: "Componentes (dev)" };

/** Vitrine dos componentes base. Só existe fora de produção. */
export default function VitrineComponentesPage({ searchParams }: PageProps<"/dev/componentes">) {
  if (process.env.NODE_ENV === "production") notFound();

  return (
    <>
      <CabecalhoPagina
        titulo="Componentes base"
        descricao="Vitrine de desenvolvimento. Não aparece em produção."
      />

      <Secao titulo="Tabela com busca e paginação no servidor" descricao="50 produtos fictícios. A busca ignora acentos e atualiza a URL (?busca=&pagina=).">
        <div className="flex flex-col gap-4">
          <CampoBusca rotulo="Buscar produtos" placeholder="Código, descrição, marca ou referência" />
          <Suspense fallback={<TabelaDadosCarregando linhas={10} />}>
            <TabelaProdutos searchParams={searchParams} />
          </Suspense>
        </div>
      </Secao>

      <Secao titulo="Formulário" descricao="react-hook-form + Zod com o mesmo schema da server action. Moeda e quantidade enviam string decimal com ponto.">
        <FormularioExemplo />
      </Secao>

      <Secao titulo="Status" descricao="Sempre ícone + texto, nunca só cor.">
        <div className="flex flex-wrap gap-2">
          <StatusBadge variante="sucesso">Nota autorizada</StatusBadge>
          <StatusBadge variante="alerta">Abaixo do mínimo</StatusBadge>
          <StatusBadge variante="alerta">Orçamento vencendo</StatusBadge>
          <StatusBadge variante="destrutivo">Rejeitada pela SEFAZ</StatusBadge>
          <StatusBadge variante="info" icone={RefreshCwIcon}>
            Sincronizando
          </StatusBadge>
          <StatusBadge variante="neutro">Aberta</StatusBadge>
        </div>
      </Secao>

      <Secao titulo="Ação destrutiva" descricao="Cor --destructive, ícone e diálogo de confirmação. O foco inicial fica em “Voltar”.">
        <DemonstracaoDialogo />
      </Secao>

      <Secao titulo="Formatação pt-BR" descricao="src/lib/formatacao.ts">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
          <dt className="text-muted-foreground">Moeda</dt>
          <dd className="tabular-nums">{formatarMoeda("1234.56")}</dd>
          <dt className="text-muted-foreground">Quantidade</dt>
          <dd className="tabular-nums">{formatarQuantidade("1.5", "LT")}</dd>
          <dt className="text-muted-foreground">Percentual</dt>
          <dd className="tabular-nums">{formatarPercentual("35.5")}</dd>
          <dt className="text-muted-foreground">Data</dt>
          <dd className="tabular-nums">{formatarData("2026-11-03T02:30:00Z")}</dd>
          <dt className="text-muted-foreground">Data e hora</dt>
          <dd className="tabular-nums">{formatarDataHora("2026-11-03T17:05:00Z")}</dd>
        </dl>
      </Secao>
    </>
  );
}

function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        {descricao ? <CardDescription>{descricao}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

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

async function TabelaProdutos({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const parametros = await searchParams;
  const { busca, pagina, tamanhoPagina, deslocamento } = lerParametrosTabela(parametros, { tamanhoPadrao: 10 });
  const { linhas, total } = await consultarProdutosFicticios({ busca, deslocamento, tamanhoPagina });

  return (
    <TabelaDados
      rotulo="Produtos fictícios"
      colunas={COLUNAS}
      linhas={linhas}
      total={total}
      pagina={pagina}
      tamanhoPagina={tamanhoPagina}
      parametros={parametros}
      chaveLinha={(p) => p.id}
      busca={busca}
      vazio={{ titulo: "Nenhum produto cadastrado", icone: PackageIcon }}
      cartao={(p) => (
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
      )}
    />
  );
}
