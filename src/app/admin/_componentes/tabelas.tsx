"use client";

/**
 * Listas da área `/admin` (rolagem infinita, D017). As colunas ficam num módulo
 * cliente: funções de célula não atravessam a fronteira servidor → cliente; da
 * página só vêm dados simples e a server function de "carregar mais".
 */
import Link from "next/link";
import { Building2Icon, UsersIcon } from "lucide-react";

import { ROTULO_PERFIL } from "@/components/layout/tipos";
import { StatusBadge } from "@/components/status-badge";
import { TabelaInfinita, type ColunaTabela, type TabelaInfinitaProps } from "@/components/tabela-dados";
import { formatarCnpj, formatarData, formatarNumero } from "@/lib/formatacao";
import { MODULOS_EMPRESA, ROTULO_REGIME } from "@/server/domain/plataforma";
import type { LinhaEmpresa, LinhaMembro, LinhaTenant } from "@/server/queries/admin";

type PropsLista<L> = Pick<
  TabelaInfinitaProps<L>,
  "linhasIniciais" | "total" | "proximoCursor" | "carregarMais" | "busca" | "hrefLimparBusca"
>;

const linkLinha = "font-medium underline-offset-4 hover:underline focus-visible:underline";

// ---------------------------------------------------------------- Tenants

export function StatusTenantBadge({ status }: { status: LinhaTenant["status"] }) {
  return status === "ativo" ? (
    <StatusBadge variante="sucesso">Ativo</StatusBadge>
  ) : (
    <StatusBadge variante="alerta">Suspenso</StatusBadge>
  );
}

const COLUNAS_TENANTS: ColunaTabela<LinhaTenant>[] = [
  {
    id: "nome",
    cabecalho: "Tenant",
    celula: (t) => (
      <Link href={`/admin/tenants/${t.id}`} className={linkLinha}>
        {t.nome}
      </Link>
    ),
  },
  { id: "empresas", cabecalho: "Empresas", alinhar: "fim", celula: (t) => formatarNumero(t.empresas) },
  { id: "status", cabecalho: "Status", celula: (t) => <StatusTenantBadge status={t.status} /> },
  { id: "criado", cabecalho: "Criado em", alinhar: "fim", celula: (t) => formatarData(t.criadoEm) },
];

function CartaoTenant(t: LinhaTenant) {
  return (
    <Link
      href={`/admin/tenants/${t.id}`}
      className="flex flex-col gap-2 rounded-lg border bg-background p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      <span className="font-medium">{t.nome}</span>
      <span className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
        <span>
          {formatarNumero(t.empresas)} {t.empresas === 1 ? "empresa" : "empresas"}
        </span>
        <StatusTenantBadge status={t.status} />
      </span>
    </Link>
  );
}

export function TabelaTenants(props: PropsLista<LinhaTenant>) {
  return (
    <TabelaInfinita
      {...props}
      rotulo="Tenants da plataforma"
      colunas={COLUNAS_TENANTS}
      chaveLinha={(t) => t.id}
      cartao={CartaoTenant}
      vazio={{
        titulo: "Nenhum tenant ainda",
        descricao: "Crie o primeiro tenant para cadastrar as empresas e convidar o dono.",
        icone: Building2Icon,
      }}
    />
  );
}

// ---------------------------------------------------------------- Empresas

const TOTAL_MODULOS = MODULOS_EMPRESA.length;

function nomeEmpresa(e: Pick<LinhaEmpresa, "razaoSocial" | "nomeFantasia">) {
  return e.nomeFantasia ?? e.razaoSocial;
}

export function TabelaEmpresas({ tenantId, ...props }: PropsLista<LinhaEmpresa> & { tenantId: string }) {
  const href = (e: LinhaEmpresa) => `/admin/tenants/${tenantId}/empresas/${e.id}`;
  const colunas: ColunaTabela<LinhaEmpresa>[] = [
    {
      id: "empresa",
      cabecalho: "Empresa",
      celula: (e) => (
        <span className="flex flex-col">
          <Link href={href(e)} className={linkLinha}>
            {nomeEmpresa(e)}
          </Link>
          {e.nomeFantasia ? <span className="text-xs text-muted-foreground">{e.razaoSocial}</span> : null}
        </span>
      ),
    },
    { id: "cnpj", cabecalho: "CNPJ", celula: (e) => <span className="font-mono">{formatarCnpj(e.cnpj)}</span> },
    { id: "regime", cabecalho: "Regime", celula: (e) => ROTULO_REGIME[e.regimeTributario] },
    { id: "uf", cabecalho: "UF", celula: (e) => e.uf ?? "—" },
    {
      id: "modulos",
      cabecalho: "Módulos ligados",
      alinhar: "fim",
      celula: (e) => `${e.modulosLigados} de ${TOTAL_MODULOS}`,
    },
    { id: "membros", cabecalho: "Membros", alinhar: "fim", celula: (e) => formatarNumero(e.membros) },
    {
      id: "situacao",
      cabecalho: "Situação",
      celula: (e) =>
        e.ativo ? (
          <StatusBadge variante="sucesso">Ativa</StatusBadge>
        ) : (
          <StatusBadge variante="neutro">Desativada</StatusBadge>
        ),
    },
  ];

  return (
    <TabelaInfinita
      {...props}
      rotulo="Empresas do tenant"
      colunas={colunas}
      chaveLinha={(e) => e.id}
      cartao={(e) => (
        <Link
          href={href(e)}
          className="flex flex-col gap-1 rounded-lg border bg-background p-3 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <span className="font-medium">{nomeEmpresa(e)}</span>
          <span className="font-mono text-xs text-muted-foreground">{formatarCnpj(e.cnpj)}</span>
          <span className="text-sm text-muted-foreground">
            {ROTULO_REGIME[e.regimeTributario]} · {e.modulosLigados} de {TOTAL_MODULOS} módulos ·{" "}
            {formatarNumero(e.membros)} {e.membros === 1 ? "membro" : "membros"}
          </span>
        </Link>
      )}
      vazio={{
        titulo: "Nenhuma empresa neste tenant",
        descricao: "Cadastre as empresas (CNPJs) do tenant. Cada uma nasce com os módulos desligados.",
        icone: Building2Icon,
      }}
    />
  );
}

// ---------------------------------------------------------------- Membros

function SituacaoMembro({ ativo }: { ativo: boolean }) {
  return ativo ? (
    <StatusBadge variante="sucesso">Ativo</StatusBadge>
  ) : (
    <StatusBadge variante="neutro">Desativado</StatusBadge>
  );
}

const COLUNAS_MEMBROS: ColunaTabela<LinhaMembro>[] = [
  { id: "nome", cabecalho: "Nome", celula: (m) => <span className="font-medium">{m.nome}</span> },
  { id: "email", cabecalho: "E-mail", celula: (m) => m.email },
  { id: "perfil", cabecalho: "Perfil", celula: (m) => ROTULO_PERFIL[m.perfil] },
  { id: "situacao", cabecalho: "Situação", celula: (m) => <SituacaoMembro ativo={m.ativo} /> },
  { id: "desde", cabecalho: "Desde", alinhar: "fim", celula: (m) => formatarData(m.desde) },
];

export function TabelaMembros(props: PropsLista<LinhaMembro>) {
  return (
    <TabelaInfinita
      {...props}
      rotulo="Membros da empresa"
      colunas={COLUNAS_MEMBROS}
      chaveLinha={(m) => m.id}
      classeAltura="max-h-[min(50svh,32rem)]"
      cartao={(m) => (
        <div className="flex flex-col gap-1 rounded-lg border bg-background p-3">
          <span className="font-medium">{m.nome}</span>
          <span className="break-all text-sm text-muted-foreground">{m.email}</span>
          <span className="flex items-center justify-between gap-3 text-sm">
            {ROTULO_PERFIL[m.perfil]}
            <SituacaoMembro ativo={m.ativo} />
          </span>
        </div>
      )}
      vazio={{
        titulo: "Nenhum membro ainda",
        descricao: "Convide o dono da empresa no formulário ao lado.",
        icone: UsersIcon,
      }}
    />
  );
}
