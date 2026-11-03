import type { Metadata } from "next";
import { HouseIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Início" };

export default function InicioPage() {
  return (
    <EmBreve
      titulo="Início"
      entrega="Entrega 8 — Relatórios do dono"
      icone={HouseIcon}
      descricao="O painel com vendas do dia, OS em andamento e itens abaixo do mínimo aparece aqui conforme as entregas forem aprovadas."
    />
  );
}
