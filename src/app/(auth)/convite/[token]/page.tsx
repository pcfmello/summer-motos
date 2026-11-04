import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { LinkIcon, LogOutIcon, TriangleAlertIcon } from "lucide-react";
import { Suspense } from "react";

import { ROTULO_PERFIL } from "@/components/layout/tipos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PARAM_DESTINO, ROTA_LOGIN } from "@/lib/rotas-auth";
import { sair } from "@/server/actions/sessao";
import { obterSessao } from "@/server/auth/contexto";
import { MENSAGEM_LIMITE_CONVITE, consumirLimiteConvite } from "@/server/auth/limite-convite";
import { db } from "@/server/db";
import { MENSAGEM_CONVITE_INVALIDO, lerConviteValido, type ConviteValido } from "@/server/servicos/convites";

import { BotaoAceitarConvite, FormularioNovaConta } from "./formulario-convite";

export const metadata: Metadata = {
  title: "Convite",
  // o token está na URL: não vai para outros sites pelo Referer, nem para buscadores
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

/**
 * Página pública do convite por link de uso único (D033). O `proxy.ts` deixa
 * passar sem sessão; tudo é decidido aqui, no servidor, a cada acesso:
 * - convite inválido, vencido, revogado ou usado: mensagem única;
 * - logado com o e-mail do convite: botão "Aceitar";
 * - logado com outro e-mail (ou admin da plataforma): mensagem genérica e "Sair";
 * - sem sessão, e-mail com conta: vai para o login e volta para cá;
 * - sem sessão, e-mail sem conta: define nome e senha.
 */
export default function ConvitePage({ params }: PageProps<"/convite/[token]">) {
  return (
    <div className="flex w-full max-w-md flex-col items-center gap-6">
      <Image src="/brand/logo.svg" alt="SUMMER" width={168} height={40} unoptimized priority className="h-10 w-auto" />
      <Suspense fallback={<Skeleton className="h-72 w-full" />}>
        <Conteudo params={params} />
      </Suspense>
    </div>
  );
}

function Aviso({ titulo, texto, children }: { titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl">
          <TriangleAlertIcon className="size-5 shrink-0 text-alerta" aria-hidden="true" />
          {titulo}
        </CardTitle>
        <CardDescription>{texto}</CardDescription>
      </CardHeader>
      {children ? <CardContent>{children}</CardContent> : null}
    </Card>
  );
}

function descricaoConvite(convite: ConviteValido): string {
  if (convite.tipo === "admin_plataforma") return "Convite para administrar a plataforma SUMMER.";
  return `Convite para ${convite.empresaNome ?? "a empresa"} como ${ROTULO_PERFIL[convite.perfil!]}.`;
}

async function Conteudo({ params }: { params: PageProps<"/convite/[token]">["params"] }) {
  // tudo aqui depende da requisição (limite por IP com relógio, sessão, banco)
  await connection();
  const { token } = await params;
  if (!(await consumirLimiteConvite())) return <Aviso titulo="Aguarde um pouco" texto={MENSAGEM_LIMITE_CONVITE} />;

  const convite = await lerConviteValido(db, token);
  if (!convite) return <Aviso titulo="Convite indisponível" texto={MENSAGEM_CONVITE_INVALIDO} />;

  const sessao = await obterSessao();
  if (sessao) {
    const mesmoEmail = sessao.usuario.email.trim().toLowerCase() === convite.email;
    if (convite.tipo !== "empresa" || !mesmoEmail || sessao.usuario.adminPlataforma) {
      return (
        <Aviso
          titulo="Este convite é para outra conta"
          texto="Você entrou com uma conta diferente da convidada. Saia e abra o link de novo para entrar com a conta certa."
        >
          <form action={sair}>
            <Button type="submit" variant="outline" className="max-md:h-11">
              <LogOutIcon data-icon="inline-start" aria-hidden="true" />
              Sair
            </Button>
          </form>
        </Aviso>
      );
    }
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-xl">
            <LinkIcon className="size-5 shrink-0 text-marca" aria-hidden="true" />
            Aceitar convite
          </CardTitle>
          <CardDescription>{descricaoConvite(convite)}</CardDescription>
        </CardHeader>
        <CardContent>
          <BotaoAceitarConvite token={token} empresa={convite.empresaNome ?? "a empresa"} perfil={ROTULO_PERFIL[convite.perfil!]} />
        </CardContent>
      </Card>
    );
  }

  if (convite.contaExiste) {
    // a conta de admin da plataforma só nasce nova: e-mail com conta não aceita esse convite
    if (convite.tipo !== "empresa") return <Aviso titulo="Convite indisponível" texto={MENSAGEM_CONVITE_INVALIDO} />;
    redirect(`${ROTA_LOGIN}?${PARAM_DESTINO}=${encodeURIComponent(`/convite/${token}`)}`);
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="text-xl">Criar a sua conta</CardTitle>
        <CardDescription>
          {descricaoConvite(convite)} Você vai entrar com o e-mail{" "}
          <strong className="text-foreground [overflow-wrap:anywhere]">{convite.email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormularioNovaConta token={token} />
      </CardContent>
    </Card>
  );
}
