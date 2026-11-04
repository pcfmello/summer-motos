import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LogOutIcon, ShieldOffIcon } from "lucide-react";

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
import { getContext, obterSessao } from "@/server/auth/contexto";

export const metadata: Metadata = { title: "Sem acesso" };

/** Quem entrou, mas não é membro ativo de nenhuma empresa ativa. */
export default function SemAcessoPage() {
  return (
    <Suspense fallback={null}>
      <SemAcesso />
    </Suspense>
  );
}

async function SemAcesso() {
  const sessao = await obterSessao();
  if (!sessao) redirect("/login");
  if (await getContext()) redirect("/");
  if (sessao.usuario.adminPlataforma) redirect("/admin");

  return (
    <Empty className="max-w-md border bg-background">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="bg-alerta-fundo text-alerta">
          <ShieldOffIcon aria-hidden="true" />
        </EmptyMedia>
        <EmptyTitle>Nenhuma empresa liberada para você</EmptyTitle>
        <EmptyDescription>
          O seu usuário ({sessao.usuario.email}) não está ativo em nenhuma empresa. Peça ao dono da loja para
          liberar o seu acesso e entre de novo.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <form action={sair}>
          <Button type="submit" variant="outline" className="h-11 md:h-10">
            <LogOutIcon data-icon="inline-start" aria-hidden="true" />
            Sair
          </Button>
        </form>
      </EmptyContent>
    </Empty>
  );
}
