import type { Metadata } from "next";
import { FileTextIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Orçamentos" };

export default function Page() {
  return <EmBreve titulo="Orçamentos" entrega="Entrega 2 — Orçamentos" icone={FileTextIcon} />;
}
