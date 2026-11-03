import type { Metadata } from "next";
import { PackageIcon } from "lucide-react";

import { EmBreve } from "@/components/layout/em-breve";

export const metadata: Metadata = { title: "Produtos" };

export default function Page() {
  return <EmBreve titulo="Produtos" entrega="Entrega 1 — Cadastros e consulta" icone={PackageIcon} />;
}
