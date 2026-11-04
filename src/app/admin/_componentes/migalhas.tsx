import Link from "next/link";
import { ChevronRightIcon } from "lucide-react";

type Migalha = { rotulo: string; href?: string };

/** Trilha de navegação do `/admin` (o último item é a página atual). */
export function Migalhas({ itens }: { itens: Migalha[] }) {
  return (
    <nav aria-label="Você está em">
      <ol className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
        {itens.map((item, indice) => {
          const atual = indice === itens.length - 1;
          return (
            <li key={`${item.rotulo}-${indice}`} className="flex items-center gap-1">
              {item.href && !atual ? (
                <Link href={item.href} className="underline-offset-4 hover:text-foreground hover:underline">
                  {item.rotulo}
                </Link>
              ) : (
                <span aria-current={atual ? "page" : undefined} className={atual ? "text-foreground" : undefined}>
                  {item.rotulo}
                </span>
              )}
              {atual ? null : <ChevronRightIcon className="size-3.5" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
