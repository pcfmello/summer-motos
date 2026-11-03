import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export type ColunaTabela<L> = {
  id: string;
  cabecalho: ReactNode;
  celula: (linha: L) => ReactNode;
  /** Números e valores à direita. */
  alinhar?: "inicio" | "fim" | "centro";
  className?: string;
};

export type EstadoVazioLista = {
  titulo: string;
  descricao?: string;
  icone?: LucideIcon;
  acao?: ReactNode;
};
