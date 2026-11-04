import { Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { exigirAdminPlataforma } from "@/server/auth/contexto";

/**
 * Área do admin da plataforma. Só entra quem tem `admin_plataforma`, conferido
 * no banco a cada requisição. A flag não dá acesso aos dados das empresas.
 * As telas (criar tenant, empresas e convidar o dono) chegam na fatia 0.10;
 * cada action delas também chama `exigirAdminPlataforma()`.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main className="min-h-svh bg-muted px-4 py-6 md:px-8">
      <Suspense fallback={<Skeleton className="h-40 w-full" />}>
        <SoAdmin>{children}</SoAdmin>
      </Suspense>
    </main>
  );
}

async function SoAdmin({ children }: { children: React.ReactNode }) {
  await exigirAdminPlataforma();
  return <>{children}</>;
}
