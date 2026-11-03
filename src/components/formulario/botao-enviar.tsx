import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

type BotaoEnviarProps = Omit<ComponentProps<typeof Button>, "type"> & {
  pendente: boolean;
  /** Texto com verbo: "Salvar produto", "Finalizar venda". */
  children: string;
  /** Texto durante o envio. Padrão: "Salvando…". */
  textoPendente?: string;
};

/** Botão de envio em preto (--primary), com estado pendente e bloqueio de duplo clique. */
export function BotaoEnviar({
  pendente,
  children,
  textoPendente = "Salvando…",
  disabled,
  ...props
}: BotaoEnviarProps) {
  return (
    <Button type="submit" disabled={pendente || disabled} aria-busy={pendente} {...props}>
      {pendente ? <Spinner data-icon="inline-start" /> : null}
      {pendente ? textoPendente : children}
    </Button>
  );
}
