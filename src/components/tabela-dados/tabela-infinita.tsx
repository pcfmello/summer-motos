"use client";

import Link from "next/link";
import { InboxIcon, RotateCwIcon, SearchXIcon, TriangleAlertIcon } from "lucide-react";
import { useRef, useState, useTransition, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useSentinela } from "@/hooks/use-sentinela";
import type { ResultadoLeva } from "@/lib/cursor";
import { formatarNumero } from "@/lib/formatacao";
import { cn } from "@/lib/utils";

import type { ColunaTabela, EstadoVazioLista } from "./tipos";

export type TabelaInfinitaProps<L> = {
  /** Descrição acessível da tabela (fica oculta): "Produtos cadastrados". */
  rotulo: string;
  colunas: ColunaTabela<L>[];
  chaveLinha: (linha: L) => string;
  /** Primeira leva, renderizada no servidor. */
  linhasIniciais: L[];
  /** Total com a busca atual (contado no servidor na primeira leva). */
  total: number;
  /** Cursor opaco da próxima leva; null = não há mais. */
  proximoCursor: string | null;
  /**
   * Server function de leitura com busca e filtros já fixados no servidor.
   * Recebe só o cursor. Deve devolver erro amigável, não lançar.
   */
  carregarMais: (cursor: string) => Promise<ResultadoLeva<L>>;
  /** Versão em cartão, usada abaixo de 768 px no lugar da tabela. */
  cartao?: (linha: L) => ReactNode;
  busca?: string;
  /** Link para "Limpar busca" no estado vazio com busca. */
  hrefLimparBusca?: string;
  vazio?: EstadoVazioLista;
  /** Altura máxima da área com rolagem no desktop (o cabeçalho fica fixo nela). */
  classeAltura?: string;
  className?: string;
};

const ALINHAMENTO = { inicio: "text-left", fim: "text-right", centro: "text-center" } as const;
const ERRO_INESPERADO = "Não foi possível carregar mais itens. Confira a conexão e tente de novo.";

/**
 * Lista com rolagem infinita. Para reiniciar quando a busca muda, renderize com
 * `key={chaveDaLista(...)}`. Sem virtualização: todas as linhas carregadas
 * ficam no DOM.
 */
export function TabelaInfinita<L>({
  rotulo,
  colunas,
  chaveLinha,
  linhasIniciais,
  total,
  proximoCursor,
  carregarMais,
  cartao,
  busca,
  hrefLimparBusca,
  vazio,
  classeAltura = "max-h-[min(70svh,52rem)]",
  className,
}: TabelaInfinitaProps<L>) {
  const [linhas, setLinhas] = useState(linhasIniciais);
  const [cursor, setCursor] = useState(proximoCursor);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, iniciar] = useTransition();
  const emAndamento = useRef(false);

  const rolagemDesktop = useRef<HTMLDivElement>(null);
  const sentinelaDesktop = useRef<HTMLDivElement>(null);
  const sentinelaCelular = useRef<HTMLDivElement>(null);

  function carregar() {
    // Um carregamento por vez: o ref barra o segundo disparo antes do re-render
    if (!cursor || emAndamento.current) return;
    emAndamento.current = true;
    setErro(null);
    iniciar(async () => {
      try {
        const resultado = await carregarMais(cursor);
        if (!resultado.ok) {
          setErro(resultado.mensagem);
          return;
        }
        setLinhas((anteriores) => {
          // Defesa: se uma linha mudou de posição entre levas, não duplica a chave
          const vistas = new Set(anteriores.map(chaveLinha));
          return [...anteriores, ...resultado.linhas.filter((l) => !vistas.has(chaveLinha(l)))];
        });
        setCursor(resultado.proximoCursor);
      } catch {
        setErro(ERRO_INESPERADO);
      } finally {
        emAndamento.current = false;
      }
    });
  }

  const podeCarregar = cursor !== null && erro === null;
  useSentinela({ alvo: sentinelaDesktop, raiz: rolagemDesktop, ativo: podeCarregar, versao: linhas.length, aoVer: carregar });
  useSentinela({ alvo: sentinelaCelular, ativo: podeCarregar && Boolean(cartao), versao: linhas.length, aoVer: carregar });

  if (linhas.length === 0) {
    return <EstadoVazio busca={busca} hrefLimparBusca={hrefLimparBusca} vazio={vazio} />;
  }

  const mostrarEsqueleto = carregando && cursor !== null;

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {cartao ? (
        <div className="flex flex-col gap-2 md:hidden">
          <ul className="flex flex-col gap-2" aria-label={rotulo}>
            {linhas.map((linha) => (
              <li key={chaveLinha(linha)}>{cartao(linha)}</li>
            ))}
          </ul>
          {mostrarEsqueleto
            ? Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-24 rounded-lg" />)
            : null}
          <div ref={sentinelaCelular} aria-hidden="true" />
        </div>
      ) : null}

      <div
        ref={rolagemDesktop}
        className={cn("overflow-auto rounded-lg border", classeAltura, cartao && "hidden md:block")}
      >
        {/* <table> direto (sem o contêiner do shadcn) para o cabeçalho sticky funcionar nesta rolagem */}
        <table data-slot="table" className="w-full caption-bottom text-sm">
          <caption className="sr-only">{rotulo}</caption>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {colunas.map((coluna) => (
                <TableHead
                  key={coluna.id}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 bg-background shadow-[inset_0_-1px_0_var(--border)]",
                    ALINHAMENTO[coluna.alinhar ?? "inicio"],
                    coluna.className,
                  )}
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
            {mostrarEsqueleto
              ? Array.from({ length: 3 }, (_, i) => (
                  <TableRow key={`esqueleto-${i}`} aria-hidden="true" className="hover:bg-transparent">
                    {colunas.map((coluna) => (
                      <TableCell key={coluna.id}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </table>
        <div ref={sentinelaDesktop} aria-hidden="true" className="h-px" />
      </div>

      <RodapeLista
        carregados={linhas.length}
        total={Math.max(total, linhas.length)}
        temMais={cursor !== null}
        carregando={carregando}
        erro={erro}
        aoCarregar={carregar}
      />
    </div>
  );
}

function RodapeLista({
  carregados,
  total,
  temMais,
  carregando,
  erro,
  aoCarregar,
}: {
  carregados: number;
  total: number;
  temMais: boolean;
  carregando: boolean;
  erro: string | null;
  aoCarregar: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-sm sm:flex-row sm:justify-between">
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando {formatarNumero(carregados)} de {formatarNumero(total)}
      </p>

      {erro ? (
        <div role="alert" className="flex flex-col items-center gap-2 text-destructive sm:flex-row">
          <span className="flex items-center gap-1.5">
            <TriangleAlertIcon className="size-4 shrink-0" aria-hidden="true" />
            {erro}
          </span>
          <Button variant="outline" onClick={aoCarregar} className="max-md:h-11 max-md:px-4">
            <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      ) : temMais ? (
        // Reserva para quem não rola (teclado, leitor de tela, observador falhou).
        // aria-disabled em vez de disabled: o foco não se perde durante o carregamento.
        <Button
          variant="outline"
          onClick={() => !carregando && aoCarregar()}
          aria-disabled={carregando}
          className="max-md:h-11 max-md:px-4 aria-disabled:opacity-70"
        >
          {carregando ? <Spinner data-icon="inline-start" /> : null}
          {carregando ? "Carregando…" : "Carregar mais"}
        </Button>
      ) : (
        <p className="text-muted-foreground">Fim da lista</p>
      )}
    </div>
  );
}

function EstadoVazio({
  busca,
  hrefLimparBusca,
  vazio,
}: {
  busca?: string;
  hrefLimparBusca?: string;
  vazio?: EstadoVazioLista;
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
        {hrefLimparBusca ? (
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link href={hrefLimparBusca}>Limpar busca</Link>
            </Button>
          </EmptyContent>
        ) : null}
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
