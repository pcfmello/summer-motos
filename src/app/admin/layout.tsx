import Image from "next/image";
import Link from "next/link";
import { LogOutIcon, ShieldIcon, UserIcon } from "lucide-react";
import { Suspense } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { sair } from "@/server/actions/sessao";
import { exigirAdminPlataforma } from "@/server/auth/contexto";

/**
 * Área do admin da plataforma. Só entra quem tem `admin_plataforma`, conferido
 * no banco a cada requisição. A flag não dá acesso aos dados das empresas: as
 * telas mostram só dados de plataforma (tenant, empresa, módulos e membros).
 *
 * O layout não roda de novo na navegação pelo cliente: **cada página** e cada
 * action do admin chamam `exigirAdminPlataforma()` por conta própria.
 */
export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="flex min-h-svh flex-col bg-muted">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 md:h-16 md:px-8">
          <Link href="/admin" className="flex items-center gap-3 rounded-md outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
            <Image src="/brand/logo.svg" alt="SUMMER" width={120} height={28} unoptimized className="h-7 w-auto" />
            <span className="hidden items-center gap-1.5 text-sm font-medium text-muted-foreground sm:flex">
              <ShieldIcon className="size-4" aria-hidden="true" />
              Admin da plataforma
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Suspense fallback={<Skeleton className="h-5 w-40" />}>
              <UsuarioAdmin />
            </Suspense>
            <Button asChild variant="ghost" className="max-md:h-11">
              <Link href="/conta">
                <UserIcon data-icon="inline-start" aria-hidden="true" />
                Minha conta
              </Link>
            </Button>
            <form action={sair}>
              <Button type="submit" variant="outline" className="max-md:h-11">
                <LogOutIcon data-icon="inline-start" aria-hidden="true" />
                Sair
              </Button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:px-8">
        <Suspense fallback={<Skeleton className="h-40 w-full" />}>
          <SoAdmin>{children}</SoAdmin>
        </Suspense>
      </main>
    </div>
  );
}

async function SoAdmin({ children }: { children: React.ReactNode }) {
  await exigirAdminPlataforma();
  return <>{children}</>;
}

async function UsuarioAdmin() {
  const usuario = await exigirAdminPlataforma();
  return <span className="hidden max-w-56 truncate text-sm text-muted-foreground md:inline">{usuario.email}</span>;
}
