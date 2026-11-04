import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { StatusBadge } from "@/components/status-badge";
import { TabelaDadosCarregando } from "@/components/tabela-dados";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatarCnpj, formatarData } from "@/lib/formatacao";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import { ROTULO_REGIME, esquemaIdAlvo } from "@/server/domain/plataforma";
import {
  listarMembrosDaEmpresa,
  obterEmpresaDoTenant,
  obterSituacaoDono,
  obterTenant,
  ORDEM_MEMBROS,
  proximaLeva,
} from "@/server/queries/admin";

import { ModulosEmpresa } from "../../../../_componentes/acoes";
import { FormularioConviteDono } from "../../../../_componentes/formularios";
import { Migalhas } from "../../../../_componentes/migalhas";
import { TabelaMembros } from "../../../../_componentes/tabelas";

export const metadata: Metadata = { title: "Empresa · Admin da plataforma" };

type Props = PageProps<"/admin/tenants/[tenantId]/empresas/[empresaId]">;

export default function EmpresaPage({ params }: Props) {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <Conteudo params={params} />
    </Suspense>
  );
}

/**
 * Só dados de plataforma da empresa: identificação, módulos e membros. Nada de
 * produtos, clientes, documentos ou custos (seção 3).
 */
async function Conteudo({ params }: { params: Props["params"] }) {
  await exigirAdminPlataforma();
  const { tenantId, empresaId } = await params;
  if (!esquemaIdAlvo.safeParse(tenantId).success || !esquemaIdAlvo.safeParse(empresaId).success) notFound();
  const [tenant, empresa] = await Promise.all([obterTenant(tenantId), obterEmpresaDoTenant(tenantId, empresaId)]);
  if (!tenant || !empresa) notFound();
  const situacaoDono = await obterSituacaoDono(empresa.id);

  const nome = empresa.nomeFantasia ?? empresa.razaoSocial;
  return (
    <>
      <Migalhas
        itens={[
          { rotulo: "Tenants", href: "/admin" },
          { rotulo: tenant.nome, href: `/admin/tenants/${tenant.id}` },
          { rotulo: nome },
        ]}
      />
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-2xl font-bold tracking-tight">{nome}</h1>
        <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {empresa.ativo ? (
            <StatusBadge variante="sucesso">Ativa</StatusBadge>
          ) : (
            <StatusBadge variante="neutro">Desativada</StatusBadge>
          )}
          <span>Criada em {formatarData(empresa.criadoEm)}</span>
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dados da empresa</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-muted-foreground">Razão social</dt>
            <dd>{empresa.razaoSocial}</dd>
            <dt className="text-muted-foreground">Nome fantasia</dt>
            <dd>{empresa.nomeFantasia ?? "—"}</dd>
            <dt className="text-muted-foreground">CNPJ</dt>
            <dd className="font-mono">{formatarCnpj(empresa.cnpj)}</dd>
            <dt className="text-muted-foreground">Regime tributário</dt>
            <dd>{ROTULO_REGIME[empresa.regimeTributario]}</dd>
            <dt className="text-muted-foreground">UF / município (IBGE)</dt>
            <dd>
              {empresa.uf ?? "—"} / <span className="font-mono">{empresa.codigoIbgeMunicipio ?? "—"}</span>
            </dd>
          </dl>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Módulos</CardTitle>
            <CardDescription>
              Em produção, ligue um módulo só depois de ele ser aprovado na homologação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ModulosEmpresa empresaId={empresa.id} modulos={empresa.modulos} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Convidar dono</CardTitle>
            <CardDescription>
              O admin convida só o primeiro dono, por um link de uso único. Os demais usuários são convidados pelo
              dono da loja.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FormularioConviteDono empresaId={empresa.id} situacao={situacaoDono} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Membros</CardTitle>
          <CardDescription>Quem tem acesso a esta empresa e com qual perfil.</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<TabelaDadosCarregando linhas={3} />}>
            <ListaMembros empresaId={empresa.id} />
          </Suspense>
        </CardContent>
      </Card>
    </>
  );
}

async function ListaMembros({ empresaId }: { empresaId: string }) {
  const leva = await listarMembrosDaEmpresa({ empresaId, cursor: null });

  async function carregarMais(cursor: string) {
    "use server";
    return proximaLeva(cursor, ORDEM_MEMBROS, (c) => listarMembrosDaEmpresa({ empresaId, cursor: c }));
  }

  return (
    <TabelaMembros
      key={`membros-${leva.total}`}
      linhasIniciais={leva.linhas}
      total={leva.total}
      proximoCursor={leva.proximoCursor}
      carregarMais={carregarMais}
    />
  );
}
