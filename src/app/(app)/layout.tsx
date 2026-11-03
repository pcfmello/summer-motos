import { MenuLateral } from "@/components/layout/menu-lateral";
import { MenuUsuario } from "@/components/layout/menu-usuario";
import { SeletorEmpresa } from "@/components/layout/seletor-empresa";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Separator } from "@/components/ui/separator";

import {
  EMPRESA_ATIVA_ID_PROVISORIA,
  EMPRESAS_PROVISORIAS,
  USUARIO_PROVISORIO,
} from "./_dados-provisorios";

/**
 * Shell das telas do sistema (empresa ativa): menu lateral preto + cabeçalho
 * com o seletor de empresa e o menu do usuário.
 *
 * TODO(0.6): trocar os dados provisórios por getContext(). Como ele lê a
 * sessão (cookies), o trecho que depende dele deve ficar dentro de <Suspense>
 * (Cache Components), mantendo o resto do shell pré-renderizado.
 */
export default function AppLayout({ children }: LayoutProps<"/">) {
  const empresas = EMPRESAS_PROVISORIAS;
  const empresaAtiva = empresas.find((e) => e.id === EMPRESA_ATIVA_ID_PROVISORIA) ?? empresas[0]!;
  const usuario = USUARIO_PROVISORIO;

  return (
    <SidebarProvider>
      <MenuLateral empresa={empresaAtiva} perfil={usuario.perfil} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b bg-background px-2 md:h-16 md:px-4">
          <SidebarTrigger className="max-md:size-11" />
          <Separator orientation="vertical" className="mr-1 data-vertical:h-6 data-vertical:self-center" />
          <SeletorEmpresa empresas={empresas} empresaAtivaId={empresaAtiva.id} />
          <div className="ml-auto">
            <MenuUsuario usuario={usuario} />
          </div>
        </header>
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
