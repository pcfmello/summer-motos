import type { Metadata } from "next";
import { WrenchIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Ordens de serviço" };

export default function Page() {
  return <EmBreve titulo="Ordens de serviço" entrega="Entrega 3 — A virada: estoque, vendas, OS e notas" icone={WrenchIcon} />;
}
