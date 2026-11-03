import type { Metadata } from "next";
import Image from "next/image";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { FormularioLogin } from "./formulario-login";

export const metadata: Metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6">
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
