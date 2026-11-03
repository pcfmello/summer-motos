import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function NaoEncontrado() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-muted-foreground">O endereço pode estar errado ou a página foi removida.</p>
      <Button asChild>
        <Link href="/">Ir para o início</Link>
      </Button>
    </main>
  );
}
