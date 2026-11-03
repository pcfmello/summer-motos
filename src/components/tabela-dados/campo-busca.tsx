"use client";

import { SearchIcon } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, useTransition } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";

type CampoBuscaProps = {
  /** Rótulo acessível: "Buscar produtos". */
  rotulo: string;
  placeholder?: string;
  /** Nome do parâmetro na URL. Padrão: "busca". */
  parametro?: string;
  /** Espera depois da última tecla antes de atualizar a URL (ms). */
  atraso?: number;
  className?: string;
};

/**
 * Busca que atualiza `?busca=` na URL com debounce e volta para a página 1.
 * A filtragem é feita pela página no servidor. Enter busca na hora.
 */
export function CampoBusca(props: CampoBuscaProps) {
  return (
    <Suspense fallback={<CampoBuscaVisual {...props} valor="" desabilitado />}>
      <CampoBuscaComUrl {...props} />
    </Suspense>
  );
}

function CampoBuscaComUrl({ parametro = "busca", atraso = 300, ...props }: CampoBuscaProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pendente, iniciar] = useTransition();
  const temporizador = useRef<ReturnType<typeof setTimeout>>(undefined);

  const valorUrl = searchParams.get(parametro) ?? "";
  const [texto, setTexto] = useState(valorUrl);
  const [ultimoValorUrl, setUltimoValorUrl] = useState(valorUrl);

  // A URL mudou por fora (ex.: "Limpar busca"): o campo acompanha
  if (valorUrl !== ultimoValorUrl) {
    setUltimoValorUrl(valorUrl);
    setTexto(valorUrl);
  }

  useEffect(() => () => clearTimeout(temporizador.current), []);

  function aplicar(valor: string) {
    clearTimeout(temporizador.current);
    const params = new URLSearchParams(searchParams.toString());
    const limpo = valor.trim();
    if (limpo) params.set(parametro, limpo);
    else params.delete(parametro);
    params.delete("pagina");
    const consulta = params.toString();
    iniciar(() => {
      router.replace(consulta ? `${pathname}?${consulta}` : pathname, { scroll: false });
    });
  }

  return (
    <CampoBuscaVisual
      {...props}
      valor={texto}
      pendente={pendente}
      aoMudar={(valor) => {
        setTexto(valor);
        clearTimeout(temporizador.current);
        temporizador.current = setTimeout(() => aplicar(valor), atraso);
      }}
      aoEnter={() => aplicar(texto)}
    />
  );
}

function CampoBuscaVisual({
  rotulo,
  placeholder = "Buscar…",
  className,
  valor,
  pendente = false,
  desabilitado = false,
  aoMudar,
  aoEnter,
}: CampoBuscaProps & {
  valor: string;
  pendente?: boolean;
  desabilitado?: boolean;
  aoMudar?: (valor: string) => void;
  aoEnter?: () => void;
}) {
  return (
    <InputGroup className={className ?? "max-w-md max-md:h-11"}>
      <InputGroupAddon>
        <SearchIcon aria-hidden="true" />
      </InputGroupAddon>
      <InputGroupInput
        type="search"
        aria-label={rotulo}
        placeholder={placeholder}
        value={valor}
        disabled={desabilitado}
        autoComplete="off"
        enterKeyHint="search"
        onChange={(evento) => aoMudar?.(evento.target.value)}
        onKeyDown={(evento) => {
          if (evento.key === "Enter") {
            evento.preventDefault();
            aoEnter?.();
          }
        }}
      />
      {pendente ? (
        <InputGroupAddon align="inline-end">
          <Spinner />
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
