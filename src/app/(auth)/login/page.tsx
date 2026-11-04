import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { obterSessao } from "@/server/auth/contexto";

import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
      {/* lê o cookie: fica num limite próprio para o resto da tela ser estático */}
      <Suspense fallback={null}>
        <RedirecionarSeLogado />
      </Suspense>
      <Image
        src="/brand/logo.svg"
        alt="SUMMER"
        width={168}
        height={40}
        unoptimized
        priority
        className="h-10 w-auto"
      />
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="text-xl">Entrar no sistema</CardTitle>
          <CardDescription>Use o e-mail e a senha cadastrados pela loja.</CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioLogin />
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * Quem já tem sessão válida (conferida no banco, não só o cookie) vai para o
 * início; o layout do sistema decide entre empresa, `/admin` e `/sem-acesso`.
 */
async function RedirecionarSeLogado() {
  const sessao = await obterSessao();
  if (sessao) redirect("/");
  return null;
}
