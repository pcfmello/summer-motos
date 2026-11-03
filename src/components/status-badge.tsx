import type { LucideIcon } from "lucide-react";
import {
  CircleCheckIcon,
  CircleDotIcon,
  CircleXIcon,
  InfoIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";

export type VarianteStatus = "sucesso" | "alerta" | "destrutivo" | "info" | "neutro";

const ICONES: Record<VarianteStatus, LucideIcon> = {
  sucesso: CircleCheckIcon,
  alerta: TriangleAlertIcon,
  destrutivo: CircleXIcon,
  info: InfoIcon,
  neutro: CircleDotIcon,
};

type StatusBadgeProps = {
  variante: VarianteStatus;
  /** Texto do status. Obrigatório: status nunca é comunicado só por cor. */
  children: string;
  /** Troca o ícone padrão da variante (ex.: RefreshCw para "Sincronizando"). */
  icone?: LucideIcon;
  className?: string;
};

/**
 * Status de documento, estoque, fiscal ou sincronização: sempre ícone + texto.
 * Ex.: <StatusBadge variante="alerta">Abaixo do mínimo</StatusBadge>
 */
export function StatusBadge({ variante, children, icone, className }: StatusBadgeProps) {
  const Icone = icone ?? ICONES[variante];
  return (
    <Badge variant={variante} className={className}>
      <Icone data-icon="inline-start" aria-hidden="true" />
      {children}
    </Badge>
  );
}
