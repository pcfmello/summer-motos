import { Suspense } from "react";

import { MenuLateral } from "@/components/layout/menu-lateral";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { SeletorEmpresa } from "@/components/layout/seletor-empresa";
import type { EmpresaResumo } from "@/components/layout/tipos";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import { sair, trocarEmpresa } from "@/server/actions/sessao";
import { exigirContexto, listarEmpresasDaSessao, type EmpresaDoUsuario } from "@/server/auth/contexto";

/**
 * Shell das telas do sistema (empresa ativa): menu lateral preto + cabeçalho
 * com o seletor de empresa e o menu do usuário.
 *
 * Com Cache Components, a leitura da sessão (cookies) fica dentro de
 * <Suspense>: o fallback é o esqueleto do shell. As páginas ficam dentro do
 * shell autenticado, então nada delas renderiza sem `exigirContexto()`. Cada
 * página e action continua chamando `getContext()` (cache por requisição).
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellCarregando />}>
      <ShellAutenticado>{children}</ShellAutenticado>
    </Suspense>
  );
}

function paraResumo(empresa: EmpresaDoUsuario): EmpresaResumo {
  return {
    id: empresa.empresaId,
    nomeFantasia: empresa.nomeFantasia ?? empresa.razaoSocial,
    razaoSocial: empresa.razaoSocial,
    cnpj: empresa.cnpj,
    regime: empresa.regimeTributario,
    // TODO(storage): URL do logo a partir de `logo_chave`, quando o storage existir
    logoUrl: null,
    logoNegativoUrl: null,
  };
}

async function ShellAutenticado({ children }: { children: React.ReactNode }) {
  const ctx = await exigirContexto();
  const empresas = (await listarEmpresasDaSessao()).map(paraResumo);
  const empresaAtiva = empresas.find((e) => e.id === ctx.empresaId)!;
  const usuario = { nome: ctx.usuario.nome, email: ctx.usuario.email, perfil: ctx.perfil };

  return (
    <SidebarProvider>
      <MenuLateral empresa={empresaAtiva} perfil={ctx.perfil} modulos={ctx.modulos} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 md:h-16 md:px-4">
          <SidebarTrigger className="max-md:size-11" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-6 data-vertical:self-center" />
          <SeletorEmpresa empresas={empresas} empresaAtivaId={empresaAtiva.id} aoTrocar={trocarEmpresa} />
          <div className="ml-auto">
            <MenuUsuario usuario={usuario} aoSair={sair} />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}

function ShellCarregando() {
  return (
    <div className="flex min-h-svh" aria-busy="true" aria-label="Carregando">
      <div className="hidden w-64 shrink-0 bg-sidebar md:block" />
      <div className="flex flex-1 flex-col">
        <div className="flex h-14 items-center gap-3 border-b px-4 md:h-16">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="ml-auto size-8 rounded-full" />
        </div>
        <div className="flex flex-col gap-4 p-4 md:p-6">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
