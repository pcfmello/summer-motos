"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { BlocksIcon } from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

import { itemAtivo, menuDoPerfil, type ItemMenu } from "./navegacao";
import type { EmpresaResumo, Perfil } from "./tipos";

const LOGO_PADRAO = "/brand/logo.svg";
const SIMBOLO_PADRAO = "/brand/simbolo.svg";

type MenuLateralProps = {
  empresa: EmpresaResumo;
  perfil: Perfil;
};

/**
 * Menu lateral preto (--sidebar). Recolhe para ícones no desktop e vira gaveta
 * no celular. Item ativo: fundo --sidebar-accent + barra de 3 px --sidebar-primary.
 */
export function MenuLateral({ empresa, perfil }: MenuLateralProps) {
  return (
    <Sidebar collapsible="icon" aria-label="Menu principal">
      <SidebarHeader className="p-3 group-data-[collapsible=icon]:p-2">
        <LogoEmpresa empresa={empresa} />
      </SidebarHeader>
      <SidebarContent>
        <Suspense fallback={<Navegacao perfil={perfil} pathname={null} />}>
          <NavegacaoComRota perfil={perfil} />
        </Suspense>
      </SidebarContent>
      {process.env.NODE_ENV !== "production" ? (
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <ItemNavegacao
                item={{ titulo: "Componentes (dev)", href: "/dev/componentes", icone: BlocksIcon, perfis: [] }}
                ativo={false}
                secundario
              />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      ) : null}
      <SidebarRail />
    </Sidebar>
  );
}

function LogoEmpresa({ empresa }: { empresa: EmpresaResumo }) {
  // Com logo negativo, ele vai direto no fundo preto; sem ele, o original vai num bloco branco.
  const negativo = empresa.logoNegativoUrl;
  const logo = negativo ?? empresa.logoUrl ?? LOGO_PADRAO;

  return (
    <Link
      href="/"
      className="rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
      aria-label={`${empresa.nomeFantasia}: ir para o início`}
    >
      <span
        className={cn(
          "flex h-14 items-center justify-center rounded-lg px-3 group-data-[collapsible=icon]:hidden",
          !negativo && "bg-white",
        )}
      >
        <Image
          src={logo}
          alt={empresa.nomeFantasia}
          width={168}
          height={40}
          unoptimized
          priority
          className="h-10 w-auto max-w-full object-contain"
        />
      </span>
      <span className="hidden size-8 items-center justify-center rounded-md bg-white group-data-[collapsible=icon]:flex">
        <Image src={SIMBOLO_PADRAO} alt={empresa.nomeFantasia} width={20} height={20} unoptimized />
      </span>
    </Link>
  );
}

function NavegacaoComRota({ perfil }: { perfil: Perfil }) {
  const pathname = usePathname();
  return <Navegacao perfil={perfil} pathname={pathname} />;
}

function Navegacao({ perfil, pathname }: { perfil: Perfil; pathname: string | null }) {
  return (
    <nav aria-label="Seções do sistema">
      {menuDoPerfil(perfil).map((grupo, indice) => (
        <SidebarGroup key={grupo.titulo ?? indice}>
          {grupo.titulo ? (
            <SidebarGroupLabel className="text-sidebar-muted-foreground">{grupo.titulo}</SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {grupo.itens.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <ItemNavegacao item={item} ativo={pathname ? itemAtivo(item.href, pathname) : false} />
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </nav>
  );
}

function ItemNavegacao({
  item,
  ativo,
  secundario = false,
}: {
  item: ItemMenu;
  ativo: boolean;
  secundario?: boolean;
}) {
  const { isMobile, setOpenMobile } = useSidebar();
  const Icone = item.icone;
  return (
    <SidebarMenuButton
      asChild
      isActive={ativo}
      tooltip={item.titulo}
      className={cn(
        // Barra vermelha de 3 px à esquerda do item ativo
        "relative before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-r-full before:bg-sidebar-primary before:opacity-0 data-active:before:opacity-100",
        // Alvo de toque de 44 px na gaveta do celular
        "max-md:h-11",
        secundario && "text-sidebar-muted-foreground",
      )}
    >
      <Link
        href={item.href}
        aria-current={ativo ? "page" : undefined}
        onClick={() => {
          if (isMobile) setOpenMobile(false);
        }}
      >
        <Icone aria-hidden="true" />
        <span>{item.titulo}</span>
      </Link>
    </SidebarMenuButton>
  );
}
