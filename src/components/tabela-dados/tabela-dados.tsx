import type { ReactNode } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { SearchXIcon, InboxIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { Paginacao } from "./paginacao";
import { hrefComParametros, type SearchParams } from "./parametros";

export type ColunaTabela<T> = {
  id: string;
  cabecalho: ReactNode;
  celula: (linha: T) => ReactNode;
  /** Números e valores à direita. */
  alinhar?: "inicio" | "fim" | "centro";
  className?: string;
};

export type TabelaDadosProps<T> = {
  /** Descrição acessível da tabela (fica oculta): "Produtos cadastrados". */
  rotulo: string;
  colunas: ColunaTabela<T>[];
  linhas: T[];
  /** Total de linhas no servidor, considerando a busca. */
  total: number;
  pagina: number;
  tamanhoPagina: number;
  /** searchParams atuais, para os links de paginação preservarem os filtros. */
  parametros: SearchParams;
  chaveLinha: (linha: T) => string;
  busca?: string;
  /**
   * Versão em cartão de cada linha, usada abaixo de 768 px no lugar da tabela
   * (OS, inventário e etiquetas precisam funcionar no celular).
   */
  cartao?: (linha: T) => ReactNode;
  vazio?: { titulo: string; descricao?: string; icone?: LucideIcon; acao?: ReactNode };
  className?: string;
};

const ALINHAMENTO = { inicio: "text-left", fim: "text-right", centro: "text-center" } as const;

/**
 * Tabela genérica com busca e paginação feitas no servidor. Recebe só a página
 * atual de linhas; a query faz o filtro (`lerParametrosTabela`).
 * Combine com <CampoBusca /> acima e um <Suspense fallback={<TabelaDadosCarregando />}>.
 */
export function TabelaDados<T>({
  rotulo,
  colunas,
  linhas,
  total,
  pagina,
  tamanhoPagina,
  parametros,
  chaveLinha,
  busca,
  cartao,
  vazio,
  className,
}: TabelaDadosProps<T>) {
  if (linhas.length === 0) {
    return (
      <EstadoVazio busca={busca} pagina={pagina} parametros={parametros} vazio={vazio} />
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {cartao ? (
        <ul className="flex flex-col gap-2 md:hidden" aria-label={rotulo}>
          {linhas.map((linha) => (
            <li key={chaveLinha(linha)}>{cartao(linha)}</li>
          ))}
        </ul>
      ) : null}

      <div className={cn("rounded-lg border", cartao && "hidden md:block")}>
        <Table>
          <TableCaption className="sr-only">{rotulo}</TableCaption>
          <TableHeader>
            <TableRow>
              {colunas.map((coluna) => (
                <TableHead
                  key={coluna.id}
                  scope="col"
                  className={cn(ALINHAMENTO[coluna.alinhar ?? "inicio"], coluna.className)}
                >
                  {coluna.cabecalho}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((linha) => (
              <TableRow key={chaveLinha(linha)}>
                {colunas.map((coluna) => (
                  <TableCell
                    key={coluna.id}
                    className={cn(
                      ALINHAMENTO[coluna.alinhar ?? "inicio"],
                      coluna.alinhar === "fim" && "tabular-nums",
                      coluna.className,
                    )}
                  >
                    {coluna.celula(linha)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao total={total} pagina={pagina} tamanhoPagina={tamanhoPagina} parametros={parametros} />
    </div>
  );
}

function EstadoVazio({
  busca,
  pagina,
  parametros,
  vazio,
}: {
  busca?: string;
  pagina: number;
  parametros: SearchParams;
  vazio?: TabelaDadosProps<unknown>["vazio"];
}) {
  if (busca) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <SearchXIcon aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Nada encontrado para “{busca}”</EmptyTitle>
          <EmptyDescription>
            Confira a grafia ou busque pelo código, código de barras ou referência.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link href={hrefComParametros(parametros, { busca: null, pagina: null })}>Limpar busca</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  if (pagina > 1) {
    return (
      <Empty className="border">
        <EmptyHeader>
          <EmptyTitle>Esta página não tem itens</EmptyTitle>
          <EmptyDescription>A lista ficou menor desde que você abriu esta página.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="outline" asChild>
            <Link href={hrefComParametros(parametros, { pagina: null })}>Ir para a primeira página</Link>
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  const Icone = vazio?.icone ?? InboxIcon;
  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icone aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>{vazio?.titulo ?? "Nenhum registro ainda"}</EmptyTitle>
        {vazio?.descricao ? <EmptyDescription>{vazio.descricao}</EmptyDescription> : null}
      </EmptyHeader>
      {vazio?.acao ? <EmptyContent>{vazio.acao}</EmptyContent> : null}
    </Empty>
  );
}
