"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useId, useTransition } from "react";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";

type Opcao = { valor: string; rotulo: string };

type SeletorOrdemProps = {
  opcoes: readonly Opcao[];
  /** Ordem usada quando a URL não tem `?ordem=`. */
  padrao: string;
  /** Nome do parâmetro na URL. Padrão: "ordem". */
  parametro?: string;
};

/** Escolhe a ordenação da lista pela URL. Mudar a ordem recomeça a lista. */
export function SeletorOrdem(props: SeletorOrdemProps) {
  return (
    <Suspense fallback={<Visual {...props} valor={props.padrao} desabilitado />}>
      <SeletorComUrl {...props} />
    </Suspense>
  );
}

function SeletorComUrl({ parametro = "ordem", ...props }: SeletorOrdemProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const atual = searchParams.get(parametro) ?? props.padrao;

  return (
    <Visual
      {...props}
      valor={atual}
      pendente={pendente}
      aoMudar={(valor) => {
        const params = new URLSearchParams(searchParams.toString());
        if (valor === props.padrao) params.delete(parametro);
        else params.set(parametro, valor);
        const consulta = params.toString();
        iniciar(() => router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false }));
      }}
    />
  );
}

function Visual({
  opcoes,
  valor,
  pendente = false,
  desabilitado = false,
  aoMudar,
}: SeletorOrdemProps & {
  valor: string;
  pendente?: boolean;
  desabilitado?: boolean;
  aoMudar?: (valor: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm">
      <label htmlFor={id} className="whitespace-nowrap text-muted-foreground">
        Ordenar por
      </label>
      <NativeSelect
        id={id}
        value={valor}
        disabled={desabilitado}
        onChange={(evento) => aoMudar?.(evento.target.value)}
        className="max-md:[&_select]:h-11"
      >
        {opcoes.map((opcao) => (
          <NativeSelectOption key={opcao.valor} value={opcao.valor}>
            {opcao.rotulo}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      {pendente ? <Spinner /> : null}
    </div>
  );
}
