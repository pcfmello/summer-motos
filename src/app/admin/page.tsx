import type { Metadata } from "next";
import Link from "next/link";
import { PlusIcon } from "lucide-react";
import { Suspense } from "react";

import { CabecalhoPagina } from "@/components/layout/cabecalho-pagina";
import {
  CampoBusca,
  chaveDaLista,
  hrefComParametros,
  lerParametrosLista,
  TabelaDadosCarregando,
  type SearchParams,
} from "@/components/tabela-dados";
import { Button } from "@/components/ui/button";
import { exigirAdminPlataforma } from "@/server/auth/contexto";
import { listarTenants, ORDEM_TENANTS, proximaLeva } from "@/server/queries/admin";

import { TabelaTenants } from "./_componentes/tabelas";

export const metadata: Metadata = { title: "Tenants · Admin da plataforma" };

export default function AdminPage({ searchParams }: PageProps<"/admin">) {
  return (
    <>
      <CabecalhoPagina
        titulo="Tenants"
        descricao="Cada cliente que contrata o SUMMER. Aqui você cria o tenant, as empresas dele e convida o dono."
        acoes={
          <Button asChild className="max-md:h-11">
            <Link href="/admin/tenants/novo">
              <PlusIcon data-icon="inline-start" aria-hidden="true" />
              Novo tenant
            </Link>
          </Button>
        }
      />
      <CampoBusca rotulo="Buscar tenants" placeholder="Nome do tenant, empresa ou CNPJ" />
      <Suspense fallback={<TabelaDadosCarregando linhas={8} />}>
        <ListaTenants searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const ORDENS = [ORDEM_TENANTS] as const;

/**
 * Primeira leva no servidor; as próximas pela server function `carregarMais`,
 * com a busca presa na closure (o Next a criptografa) e só o cursor vindo do
 * cliente (D017).
 */
async function ListaTenants({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await exigirAdminPlataforma();
  const parametros = await searchParams;
  const { busca } = lerParametrosLista(parametros, { ordens: ORDENS, ordemPadrao: ORDEM_TENANTS });
  const leva = await listarTenants({ busca, cursor: null });

  async function carregarMais(cursor: string) {
    "use server";
    return proximaLeva(cursor, ORDEM_TENANTS, (c) => listarTenants({ busca, cursor: c }));
  }

  return (
    <TabelaTenants
      // busca nova ou lista alterada (tenant criado) = lista nova, do zero
      key={chaveDaLista({ busca, total: String(leva.total) })}
      linhasIniciais={leva.linhas}
      total={leva.total}
      proximoCursor={leva.proximoCursor}
      carregarMais={carregarMais}
      busca={busca}
      hrefLimparBusca={hrefComParametros(parametros, { busca: null })}
    />
  );
}
