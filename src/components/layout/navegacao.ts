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

import { moduloLigado, pode, type Capacidade, type Modulo, type Modulos, type Perfil } from "@/server/auth/permissoes";

export type ItemMenu = {
  titulo: string;
  href: string;
  icone: LucideIcon;
  /**
   * O item aparece se o perfil tiver **alguma** destas capacidades (matriz de
   * `server/auth/permissoes`). Lista vazia = todos os perfis. Só esconde na
   * tela: a página e as actions conferem a permissão de novo no servidor.
   */
  capacidades: readonly Capacidade[];
  /** Módulo de `empresas.modulos` que precisa estar ligado. */
  modulo?: Modulo;
};

export type GrupoMenu = { titulo: string | null; itens: ItemMenu[] };

export const MENU: GrupoMenu[] = [
  {
    titulo: null,
    itens: [{ titulo: "Início", href: "/", icone: HouseIcon, capacidades: [] }],
  },
  {
    titulo: "Vendas e oficina",
    itens: [
      { titulo: "Balcão", href: "/balcao", icone: ShoppingCartIcon, capacidades: ["vendas.criar"], modulo: "balcao" },
      { titulo: "Orçamentos", href: "/orcamentos", icone: FileTextIcon, capacidades: ["orcamentos.gerir"] },
      {
        titulo: "OS",
        href: "/os",
        icone: WrenchIcon,
        capacidades: ["os.ver_todas", "os.ver_proprias"],
        modulo: "os",
      },
    ],
  },
  {
    titulo: "Catálogo",
    itens: [
      { titulo: "Produtos", href: "/produtos", icone: PackageIcon, capacidades: ["produtos.consultar"] },
      { titulo: "Peças por moto", href: "/pecas-por-moto", icone: BikeIcon, capacidades: ["pecas_por_moto.consultar"] },
      {
        titulo: "Estoque",
        href: "/estoque",
        icone: WarehouseIcon,
        capacidades: ["estoque.entrada", "estoque.ajustar", "inventario.gerir"],
        modulo: "estoque",
      },
    ],
  },
  {
    titulo: "Gestão",
    itens: [
      {
        titulo: "Cadastros",
        href: "/cadastros",
        icone: ContactIcon,
        capacidades: ["clientes.gerir", "fornecedores.gerir", "catalogo.gerir", "cadastros.gerir"],
      },
      { titulo: "Relatórios", href: "/relatorios", icone: ChartColumnIcon, capacidades: ["relatorios.ver"] },
      { titulo: "Configurações", href: "/configuracoes", icone: SettingsIcon, capacidades: ["configuracoes.gerir"] },
    ],
  },
];

export function itemVisivel(item: ItemMenu, perfil: Perfil, modulos: Modulos): boolean {
  if (item.modulo && !moduloLigado(modulos, item.modulo)) return false;
  return item.capacidades.length === 0 || item.capacidades.some((c) => pode(perfil, c));
}

export function menuDoPerfil(perfil: Perfil, modulos: Modulos): GrupoMenu[] {
  return MENU.map((grupo) => ({
    ...grupo,
    itens: grupo.itens.filter((item) => itemVisivel(item, perfil, modulos)),
  })).filter((grupo) => grupo.itens.length > 0);
}

/** O item "/" só fica ativo na própria home; os demais também nas subpáginas. */
export function itemAtivo(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
