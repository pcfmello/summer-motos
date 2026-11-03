"use client";

import { CampoDecimal, type CampoDecimalProps } from "./campo-decimal";

type CampoQuantidadeProps = Omit<
  CampoDecimalProps,
  "casas" | "casasFixas" | "prefixo" | "sufixo" | "permitirNegativo"
> & {
  /** Unidade de estoque mostrada à direita: UN, LT, ML, M… */
  unidade?: string;
  /** Ajustes de estoque aceitam quantidade negativa. */
  permitirNegativo?: boolean;
};

/**
 * Quantidade (numeric(14,4)): até 4 casas, ex.: "1,5" LT de óleo.
 * Entrega "1.5". Use com `esquemaQuantidade` no schema Zod.
 */
export function CampoQuantidade({ unidade, ...props }: CampoQuantidadeProps) {
  return <CampoDecimal {...props} casas={4} sufixo={unidade} />;
}
