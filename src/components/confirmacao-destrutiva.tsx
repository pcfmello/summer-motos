"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Spinner } from "@/components/ui/spinner";

type ConfirmacaoDestrutivaProps = {
  /** Elemento que abre o diálogo (normalmente um Button variant="destructive" com ícone). */
  children: ReactNode;
  /** Pergunta direta: "Cancelar a venda #000123?" */
  titulo: string;
  /** O que acontece depois: "O estoque dos itens volta para a loja. Não dá para desfazer." */
  descricao: ReactNode;
  /** Verbo da ação: "Cancelar venda", "Remover peça". */
  rotuloConfirmar: string;
  /** Padrão "Voltar", para não confundir com ações chamadas "Cancelar …". */
  rotuloVoltar?: string;
  /** Pode ser uma server action. O diálogo fica aberto e bloqueado até terminar. */
  aoConfirmar: () => void | Promise<void>;
};

/**
 * Confirmação para ação destrutiva (seção 2.1): cor --destructive, ícone e
 * texto com verbo. O botão de confirmar não recebe foco inicial, para um Enter
 * acidental não confirmar.
 */
export function ConfirmacaoDestrutiva({
  children,
  titulo,
  descricao,
  rotuloConfirmar,
  rotuloVoltar = "Voltar",
  aoConfirmar,
}: ConfirmacaoDestrutivaProps) {
  const [aberto, setAberto] = useState(false);
  const [pendente, iniciar] = useTransition();

  return (
    <AlertDialog open={aberto} onOpenChange={(valor) => !pendente && setAberto(valor)}>
      <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive-fundo text-destructive">
            <TriangleAlertIcon aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pendente}>{rotuloVoltar}</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive-solid"
            disabled={pendente}
            aria-busy={pendente}
            onClick={(evento) => {
              // Mantém o diálogo aberto até a ação terminar
              evento.preventDefault();
              iniciar(async () => {
                await aoConfirmar();
                setAberto(false);
              });
            }}
          >
            {pendente ? <Spinner data-icon="inline-start" /> : null}
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
