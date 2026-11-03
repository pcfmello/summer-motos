import type { Metadata } from "next";
import { ChartColumnIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Relatórios" };

export default function Page() {
  return <EmBreve titulo="Relatórios" entrega="Entrega 8 — Relatórios do dono" icone={ChartColumnIcon} />;
}
