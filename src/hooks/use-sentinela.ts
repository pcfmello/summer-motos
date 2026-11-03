"use client";

import { useEffect, useEffectEvent, type RefObject } from "react";

/**
 * Chama `aoVer` quando o elemento sentinela entra na área visível (com folga
 * de `margem` abaixo). O observador é recriado quando `versao` muda (ex.: a
 * quantidade de linhas), para disparar de novo se o sentinela continuar
 * visível depois de uma leva curta.
 */
export function useSentinela({
  alvo,
  raiz,
  ativo,
  versao,
  aoVer,
  margem = "400px",
}: {
  alvo: RefObject<Element | null>;
  /** Contêiner com rolagem própria; null = a janela. */
  raiz?: RefObject<Element | null>;
  ativo: boolean;
  versao: number;
  aoVer: () => void;
  margem?: string;
}) {
  const aoVerEvento = useEffectEvent(aoVer);

  useEffect(() => {
    const elemento = alvo.current;
    if (!ativo || !elemento || typeof IntersectionObserver === "undefined") return;
    const observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((entrada) => entrada.isIntersecting)) aoVerEvento();
      },
      { root: raiz?.current ?? null, rootMargin: `0px 0px ${margem} 0px` },
    );
    observador.observe(elemento);
    return () => observador.disconnect();
  }, [alvo, raiz, ativo, versao, margem]);
}
