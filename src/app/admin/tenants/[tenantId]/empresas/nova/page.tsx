import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import { esquemaIdAlvo } from "@/server/domain/plataforma";
import { obterTenant } from "@/server/queries/admin";

import { FormularioEmpresa } from "../../../../_componentes/formularios";
import { Migalhas } from "../../../../_componentes/migalhas";

export const metadata: Metadata = { title: "Nova empresa · Admin da plataforma" };

type Props = PageProps<"/admin/tenants/[tenantId]/empresas/nova">;

export default function NovaEmpresaPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: Props["params"] }) {
  await exigirAdminPlataforma();
  const { tenantId } = await params;
  if (!esquemaIdAlvo.safeParse(tenantId).success) notFound();
  const tenant = await obterTenant(tenantId);
  if (!tenant) notFound();

  return (
    <>
      <Migalhas
        itens={[
          { rotulo: "Tenants", href: "/admin" },
          { rotulo: tenant.nome, href: `/admin/tenants/${tenant.id}` },
          { rotulo: "Nova empresa" },
        ]}
      />
      <CabecalhoPagina titulo="Nova empresa" descricao={`Empresa (CNPJ) do tenant ${tenant.nome}.`} />
      <Card>
        <CardContent>
          <FormularioEmpresa tenantId={tenant.id} />
        </CardContent>
      </Card>
    </>
  );
}
