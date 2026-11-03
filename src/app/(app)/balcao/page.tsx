import type { Metadata } from "next";
import { ShoppingCartIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Balcão" };

export default function Page() {
  return <EmBreve titulo="Balcão" entrega="Entrega 3 — A virada: estoque, vendas, OS e notas" icone={ShoppingCartIcon} />;
}
