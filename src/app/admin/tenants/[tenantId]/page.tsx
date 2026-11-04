import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PlusIcon } from "lucide-react";
import { Suspense } from "react";

import { TabelaDadosCarregando } from "@/components/tabela-dados";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarData } from "@/lib/formatacao";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import { esquemaIdAlvo } from "@/server/domain/plataforma";
import { listarEmpresasDoTenant, obterTenant, ORDEM_EMPRESAS, proximaLeva } from "@/server/queries/admin";

import { AcaoStatusTenant } from "../../_componentes/acoes";
import { Migalhas } from "../../_componentes/migalhas";
import { StatusTenantBadge, TabelaEmpresas } from "../../_componentes/tabelas";

export const metadata: Metadata = { title: "Tenant · Admin da plataforma" };

export default function TenantPage({ params }: PageProps<"/admin/tenants/[tenantId]">) {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

async function Conteudo({ params }: { params: PageProps<"/admin/tenants/[tenantId]">["params"] }) {
  await exigirAdminPlataforma();
  const { tenantId } = await params;
  if (!esquemaIdAlvo.safeParse(tenantId).success) notFound();
  const tenant = await obterTenant(tenantId);
  if (!tenant) notFound();

  return (
    <>
      <Migalhas itens={[{ rotulo: "Tenants", href: "/admin" }, { rotulo: tenant.nome }]} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-2xl font-bold tracking-tight">{tenant.nome}</h1>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <StatusTenantBadge status={tenant.status} />
            <span>Criado em {formatarData(tenant.criadoEm)}</span>
          </p>
        </div>
        <AcaoStatusTenant tenantId={tenant.id} nome={tenant.nome} status={tenant.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Empresas</CardTitle>
          <CardDescription>
            Cada CNPJ do tenant, com cadastro, estoque e documentos próprios. Abra a empresa para ligar módulos e convidar
            o dono.
          </CardDescription>
          <CardAction>
            <Button asChild className="max-md:h-11">
              <Link href={`/admin/tenants/${tenant.id}/empresas/nova`}>
                <PlusIcon data-icon="inline-start" aria-hidden="true" />
                Nova empresa
              </Link>
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<TabelaDadosCarregando linhas={3} />}>
            <ListaEmpresas tenantId={tenant.id} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function ListaEmpresas({ tenantId }: { tenantId: string }) {
  const leva = await listarEmpresasDoTenant({ tenantId, cursor: null });

  async function carregarMais(cursor: string) {
    "use server";
    return proximaLeva(cursor, ORDEM_EMPRESAS, (c) => listarEmpresasDoTenant({ tenantId, cursor: c }));
  }

  return (
    <TabelaEmpresas
      key={`empresas-${leva.total}`}
      tenantId={tenantId}
      linhasIniciais={leva.linhas}
      total={leva.total}
      proximoCursor={leva.proximoCursor}
      carregarMais={carregarMais}
    />
  );
}
