import Link from "next/link";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatarNumero } from "@/lib/formatacao";

import { hrefComParametros, type SearchParams } from "./parametros";

type PaginacaoProps = {
  total: number;
  pagina: number;
  tamanhoPagina: number;
  parametros: SearchParams;
};

export function Paginacao({ total, pagina, tamanhoPagina, parametros }: PaginacaoProps) {
  const totalPaginas = Math.max(1, Math.ceil(total / tamanhoPagina));
  const inicio = total === 0 ? 0 : (pagina - 1) * tamanhoPagina + 1;
  const fim = Math.min(total, pagina * tamanhoPagina);
  const temAnterior = pagina > 1;
  const temProxima = pagina < totalPaginas;

  return (
    <nav
      aria-label="Paginação"
      className="flex flex-col items-center justify-between gap-2 text-sm sm:flex-row"
    >
      <p className="text-muted-foreground" aria-live="polite">
        Mostrando {formatarNumero(inicio)}–{formatarNumero(fim)} de {formatarNumero(total)}
      </p>
      <div className="flex items-center gap-2">
        <BotaoPagina
          habilitado={temAnterior}
          href={hrefComParametros(parametros, { pagina: pagina - 1 === 1 ? null : pagina - 1 })}
          rotulo="Página anterior"
        >
          <ChevronLeftIcon data-icon="inline-start" aria-hidden="true" />
          Anterior
        </BotaoPagina>
        <span className="px-1 tabular-nums">
          Página {pagina} de {totalPaginas}
        </span>
        <BotaoPagina
          habilitado={temProxima}
          href={hrefComParametros(parametros, { pagina: pagina + 1 })}
          rotulo="Próxima página"
        >
          Próxima
          <ChevronRightIcon data-icon="inline-end" aria-hidden="true" />
        </BotaoPagina>
      </div>
    </nav>
  );
}

function BotaoPagina({
  habilitado,
  href,
  rotulo,
  children,
}: {
  habilitado: boolean;
  href: string;
  rotulo: string;
  children: React.ReactNode;
}) {
  // Alvo de 44 px no celular; compacto no desktop
  if (!habilitado) {
    return (
      <Button variant="outline" disabled aria-label={rotulo} className="max-md:h-11 max-md:px-4">
        {children}
      </Button>
    );
  }
  return (
    <Button variant="outline" asChild className="max-md:h-11 max-md:px-4">
      <Link href={href} aria-label={rotulo} scroll={false}>
        {children}
      </Link>
    </Button>
  );
}
