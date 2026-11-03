"use client";

import { CampoDecimal, type CampoDecimalProps } from "./campo-decimal";

type CampoMoedaProps = Omit<CampoDecimalProps, "casas" | "casasFixas" | "prefixo" | "sufixo">;

/**
 * Dinheiro em R$ (numeric(14,2)): mostra "R$ 1.234,56" e entrega "1234.56".
 * Use com `esquemaMoeda` no schema Zod.
 */
export function CampoMoeda(props: CampoMoedaProps) {
  return <CampoDecimal {...props} casas={2} casasFixas prefixo="R$" />;
}
