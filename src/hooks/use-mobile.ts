import * as React from "react"

const MOBILE_BREAKPOINT = 768
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

function assinar(aoMudar: () => void) {
  const mql = window.matchMedia(CONSULTA)
  mql.addEventListener("change", aoMudar)
  return () => mql.removeEventListener("change", aoMudar)
}

/**
 * true abaixo de 768 px. Usa useSyncExternalStore em vez de setState dentro de
 * effect (regra react-hooks/set-state-in-effect). No servidor, assume desktop.
 */
export function useIsMobile() {
  return React.useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false
  )
}
