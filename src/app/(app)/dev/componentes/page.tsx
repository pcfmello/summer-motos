import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { RefreshCwIcon } from "lucide-react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { StatusBadge } from "@/components/status-badge";
import {
  CampoBusca,
  chaveDaLista,
  hrefComParametros,
  lerParametrosLista,
  SeletorOrdem,
  TabelaDadosCarregando,
  type SearchParams,
} from "@/components/tabela-dados";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  formatarData,
  formatarDataHora,
  formatarMoeda,
  formatarPercentual,
  formatarQuantidade,
} from "@/lib/formatacao";

import { consultarProdutosFicticios, OPCOES_ORDEM, ORDENS } from "./_dados-ficticios";
import { carregarMaisProdutosFicticios } from "./acoes";
import { DemonstracaoDialogo } from "./demonstracao-dialogo";
import { FormularioExemplo } from "./formulario-exemplo";
import { TabelaProdutos } from "./tabela-produtos";

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

      <Secao
        titulo="Lista com rolagem infinita"
        descricao="500 produtos fictícios em levas de 50, com cursor keyset. A busca ignora acentos; busca e ordem ficam na URL e recomeçam a lista."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CampoBusca rotulo="Buscar produtos" placeholder="Código, descrição, marca ou referência" />
            <SeletorOrdem opcoes={OPCOES_ORDEM} padrao="descricao" />
          </div>
          <Suspense fallback={<TabelaDadosCarregando linhas={10} />}>
            <ListaProdutos searchParams={searchParams} />
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

/**
 * Primeira leva no servidor. As próximas vêm de `carregarMais`, uma server
 * function de leitura com busca e ordem presas numa closure: o Next criptografa
 * as variáveis capturadas antes de mandá-las ao navegador (o `.bind` não
 * criptografa), e a função ainda revalida tudo com Zod. Do cliente, só o cursor.
 */
async function ListaProdutos({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const parametros = await searchParams;
  const filtros = lerParametrosLista(parametros, { ordens: ORDENS, ordemPadrao: "descricao" });
  const { linhas, total, proximoCursor } = await consultarProdutosFicticios({ ...filtros, cursor: null });

  async function carregarMais(cursor: string) {
    "use server";
    return carregarMaisProdutosFicticios(filtros, cursor);
  }

  return (
    <TabelaProdutos
      // Busca ou ordem nova = lista nova, do zero
      key={chaveDaLista(filtros)}
      linhasIniciais={linhas}
      total={total}
      proximoCursor={proximoCursor}
      carregarMais={carregarMais}
      busca={filtros.busca}
      hrefLimparBusca={hrefComParametros(parametros, { busca: null })}
    />
  );
}
