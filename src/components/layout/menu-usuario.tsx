"use client";

import { LogOutIcon, UserIcon } from "lucide-react";
import Link from "next/link";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { ROTULO_PERFIL, type UsuarioResumo } from "./tipos";

type MenuUsuarioProps = {
  usuario: UsuarioResumo;
  /** Server action de logout. Sem ela, o item "Sair" fica desabilitado. */
  aoSair?: () => Promise<void>;
};

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/);
  const primeira = partes[0]?.[0] ?? "";
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? "") : "";
  return (primeira + ultima).toUpperCase() || "?";
}

export function MenuUsuario({ usuario, aoSair }: MenuUsuarioProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="h-11 gap-2 px-1.5 md:h-10"
          aria-label={`Menu do usuário ${usuario.nome}`}
        >
          <Avatar>
            {/* text-foreground: o padrão do shadcn (muted sobre muted) dá 4,4:1 */}
            <AvatarFallback className="bg-muted text-xs font-semibold text-foreground">
              {iniciais(usuario.nome)}
            </AvatarFallback>
          </Avatar>
          <span className="flex flex-col items-start leading-tight max-md:hidden">
            <span className="max-w-[10rem] truncate text-sm font-medium">{usuario.nome}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {ROTULO_PERFIL[usuario.perfil]}
            </span>
          </span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex flex-col gap-0.5 text-foreground">
          <span className="truncate text-sm font-semibold">{usuario.nome}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{usuario.email}</span>
          <span className="text-xs font-normal text-muted-foreground">
            Perfil nesta empresa: {ROTULO_PERFIL[usuario.perfil]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild className="min-h-11 md:min-h-8">
            <Link href="/conta">
              <UserIcon aria-hidden="true" />
              Minha conta
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!aoSair}
            className="min-h-11 md:min-h-8"
            onSelect={() => {
              void aoSair?.();
            }}
          >
            <LogOutIcon aria-hidden="true" />
            Sair
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
