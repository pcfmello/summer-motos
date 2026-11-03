import type { Metadata } from "next";
import { SettingsIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Configurações" };

export default function Page() {
  return <EmBreve titulo="Configurações" entrega="Entrega 0 — Fundação" icone={SettingsIcon} />;
}
