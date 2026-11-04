import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PARAM_DESTINO, ROTA_LOGIN } from "@/lib/rotas-auth";
import { obterSessao } from "@/server/auth/contexto";

import { FormularioTrocaSenha } from "./formulario-troca-senha";

export const metadata: Metadata = { title: "Minha conta" };

/**
 * "Minha conta" (D033): troca de senha de qualquer usuário logado, inclusive o
 * admin da plataforma (por isso fica fora do shell `(app)`, que exige empresa).
 * A troca usa a rota `/change-password` do Better Auth, com limite de tentativas.
 */
export default function ContaPage() {
  return (
    <main className="flex min-h-svh justify-center bg-muted px-4 py-10">
      <div className="flex w-full max-w-md flex-col gap-6">
        <Image src="/brand/logo.svg" alt="SUMMER" width={168} height={40} unoptimized className="h-10 w-auto self-center" />
        <Suspense fallback={<Skeleton className="h-96 w-full" />}>
          <Conteudo />
        </Suspense>
      </div>
    </main>
  );
}

async function Conteudo() {
  const sessao = await obterSessao();
  if (!sessao) redirect(`${ROTA_LOGIN}?${PARAM_DESTINO}=${encodeURIComponent("/conta")}`);
  const voltar = sessao.usuario.adminPlataforma ? "/admin" : "/";

  return (
    <>
      <div>
        <Button asChild variant="ghost" className="max-md:h-11">
          <Link href={voltar}>
            <ArrowLeftIcon data-icon="inline-start" aria-hidden="true" />
            Voltar
          </Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Minha conta</CardTitle>
          <CardDescription>
            {sessao.usuario.nome} · <span className="[overflow-wrap:anywhere]">{sessao.usuario.email}</span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioTrocaSenha />
        </CardContent>
      </Card>
    </>
  );
}
