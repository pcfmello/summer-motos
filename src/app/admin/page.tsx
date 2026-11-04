import type { Metadata } from "next";
import { LogOutIcon, ShieldIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { sair } from "@/server/actions/sessao";

export const metadata: Metadata = { title: "Admin da plataforma" };

/** Provisória: as telas do admin chegam na fatia 0.10. */
export default function AdminPage() {
  return (
    <Empty className="mx-auto max-w-lg border bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ShieldIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Área do admin da plataforma</EmptyTitle>
        <EmptyDescription>
          Aqui ficarão a criação de tenants e empresas e o convite do primeiro dono (em construção).
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form action={sair}>
          <Button type="submit" variant="outline">
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
            Sair
          </Button>
        </form>
      </EmptyContent>
    </Empty>
  );
}
