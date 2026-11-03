import { Skeleton } from "@/components/ui/skeleton";

/** Fallback do <Suspense> da tabela: mantém o espaço enquanto a query roda. */
export function TabelaDadosCarregando({ linhas = 8 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando a lista">
      <div className="flex flex-col gap-0 rounded-lg border">
        <div className="border-b p-3">
          <Skeleton className="h-4 w-1/3" />
        </div>
        {Array.from({ length: linhas }, (_, indice) => (
          <div key={indice} className="flex items-center gap-4 border-b p-3 last:border-0">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-4 w-24" />
          </div>
        ))}
      </div>
      <span className="sr-only">Carregando…</span>
    </div>
  );
}
