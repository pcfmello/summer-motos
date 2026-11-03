import type { LucideIcon } from "lucide-react";
import {
  BikeIcon,
  ChartColumnIcon,
  ContactIcon,
  FileTextIcon,
  HouseIcon,
  PackageIcon,
  SettingsIcon,
  ShoppingCartIcon,
  WarehouseIcon,
  WrenchIcon,
} from "lucide-react";

import type { Perfil } from "./tipos";

export type ItemMenu = {
  titulo: string;
  href: string;
  icone: LucideIcon;
  /**
   * Perfis que veem o item. Só esconde na tela: o bloqueio de verdade é no
   * servidor (matriz de permissões em `server/auth`). Revisar quando ela existir.
   */
  perfis: readonly Perfil[];
};

export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };

const TODOS: readonly Perfil[] = ["dono", "balcao", "estoque", "mecanico"];

export const MENU: GrupoMenu[] = [
  {
    titulo: null,
    itens: [{ titulo: "Início", href: "/", icone: HouseIcon, perfis: TODOS }],
  },
  {
    titulo: "Vendas e oficina",
    itens: [
      { titulo: "Balcão", href: "/balcao", icone: ShoppingCartIcon, perfis: ["dono", "balcao"] },
      { titulo: "Orçamentos", href: "/orcamentos", icone: FileTextIcon, perfis: ["dono", "balcao"] },
      { titulo: "OS", href: "/os", icone: WrenchIcon, perfis: ["dono", "balcao", "mecanico"] },
    ],
  },
  {
    titulo: "Catálogo",
    itens: [
      { titulo: "Produtos", href: "/produtos", icone: PackageIcon, perfis: ["dono", "balcao", "estoque"] },
      { titulo: "Peças por moto", href: "/pecas-por-moto", icone: BikeIcon, perfis: TODOS },
      { titulo: "Estoque", href: "/estoque", icone: WarehouseIcon, perfis: ["dono", "estoque"] },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      { titulo: "Cadastros", href: "/cadastros", icone: ContactIcon, perfis: ["dono", "balcao", "estoque"] },
      { titulo: "Relatórios", href: "/relatorios", icone: ChartColumnIcon, perfis: ["dono"] },
      { titulo: "Configurações", href: "/configuracoes", icone: SettingsIcon, perfis: ["dono"] },
    ],
  },
];

export function menuDoPerfil(perfil: Perfil): GrupoMenu[] {
  return MENU.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter((item) => item.perfis.includes(perfil)),
  })).filter((grupo) => grupo.itens.length > 0);
}

/** O item "/" só fica ativo na própria home; os demais também nas subpáginas. */
export function itemAtivo(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
