import type { Metadata } from "next";
import { WarehouseIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Estoque" };

export default function Page() {
  return <EmBreve titulo="Estoque" entrega="Entrega 3 — A virada: estoque, vendas, OS e notas" icone={WarehouseIcon} />;
}
