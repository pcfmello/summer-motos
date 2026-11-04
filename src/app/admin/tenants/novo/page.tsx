import type { Metadata } from "next";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exigirAdminPlataforma } from "@/server/auth/contexto";

import { FormularioTenant } from "../../_componentes/formularios";
import { Migalhas } from "../../_componentes/migalhas";

export const metadata: Metadata = { title: "Novo tenant · Admin da plataforma" };

export default function NovoTenantPage() {
  return (
    <>
      <Migalhas itens={[{ rotulo: "Tenants", href: "/admin" }, { rotulo: "Novo tenant" }]} />
      <CabecalhoPagina titulo="Novo tenant" descricao="Depois de criar, cadastre as empresas e convide o dono." />
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <Conteudo />
      </Suspense>
    </>
  );
}

async function Conteudo() {
  await exigirAdminPlataforma();
  return (
    <Card>
      <CardContent>
        <FormularioTenant />
      </CardContent>
    </Card>
  );
}
