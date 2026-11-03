import type { LucideIcon } from "lucide-react";
import { ConstructionIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

import { CabecalhoPagina } from "./cabecalho-pagina";

type EmBreveProps = {
  titulo: string;
  /** Em qual entrega a tela chega: "Entrega 1 — Cadastros e consulta". */
  entrega: string;
  descricao?: string;
  icone?: LucideIcon;
};

/** Página provisória para itens do menu que ainda não foram construídos. */
export function EmBreve({ titulo, entrega, descricao, icone: Icone = ConstructionIcon }: EmBreveProps) {
  return (
    <>
      <CabecalhoPagina titulo={titulo} />
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Icone aria-hidden="true" />
          </EmptyMedia>
          <EmptyTitle>Em breve</EmptyTitle>
          <EmptyDescription>
            {descricao ?? `Esta tela chega na ${entrega}.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </>
  );
}
