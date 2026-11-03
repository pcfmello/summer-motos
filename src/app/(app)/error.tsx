"use client";

import { RotateCwIcon, TriangleAlertIcon } from "lucide-react";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

/** Erro inesperado numa tela do sistema (inclui falha ao carregar uma tabela). */
export default function ErroApp({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Empty className="border">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-destructive-fundo text-destructive">
          <TriangleAlertIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Não foi possível carregar esta tela</EmptyTitle>
        <EmptyDescription>
          Confira a conexão e tente de novo. Se o problema continuar, avise o responsável pelo sistema.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button onClick={() => retry()}>
          <RotateCwIcon data-icon="inline-start" aria-hidden="true" />
          Tentar de novo
        </Button>
      </EmptyContent>
    </Empty>
  );
}
