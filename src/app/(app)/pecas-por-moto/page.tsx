import type { Metadata } from "next";
import { BikeIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Peças por moto" };

export default function Page() {
  return <EmBreve titulo="Peças por moto" entrega="Entrega 1 — Cadastros e consulta" icone={BikeIcon} />;
}
