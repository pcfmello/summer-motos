import type { Metadata } from "next";
import { ContactIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Cadastros" };

export default function Page() {
  return <EmBreve titulo="Cadastros" entrega="Entrega 1 — Cadastros e consulta" icone={ContactIcon} />;
}
