"use client";

import { Trash2Icon } from "lucide-react";
import { useState } from "react";

import { ConfirmacaoDestrutiva } from "@/components/confirmacao-destrutiva";
import { Button } from "@/components/ui/button";

export function DemonstracaoDialogo() {
  const [cancelada, setCancelada] = useState(false);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <ConfirmacaoDestrutiva
        titulo="Cancelar a venda #000123?"
        descricao="Os itens voltam para o estoque e a venda fica marcada como cancelada. Essa ação vai para a auditoria e não pode ser desfeita."
        rotuloConfirmar="Cancelar venda"
        aoConfirmar={async () => {
          await new Promise((resolve) => setTimeout(resolve, 800));
          setCancelada(true);
        }}
      >
        <Button variant="destructive">
          <Trash2Icon data-icon="inline-start" aria-hidden="true" />
          Cancelar venda
        </Button>
      </ConfirmacaoDestrutiva>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {cancelada ? "Venda #000123 cancelada (simulação)." : "Nenhuma ação executada."}
      </p>
    </div>
  );
}
