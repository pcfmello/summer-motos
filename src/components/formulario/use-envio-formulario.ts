"use client";

import { useRef, useState } from "react";
import type { FieldValues, Path, UseFormReturn } from "react-hook-form";

import type { ResultadoAcao } from "./resultado-acao";

type Opcoes<T> = {
  aoSucesso?: (dados: T) => void;
};

const ERRO_INESPERADO =
  "Não foi possível salvar agora. Confira a conexão e tente de novo; se continuar, avise o responsável pelo sistema.";

/**
 * Liga um formulário react-hook-form a uma server action que devolve
 * `ResultadoAcao`. Bloqueia envio duplicado (duplo clique ou Enter repetido),
 * coloca os erros do servidor nos campos e foca o primeiro campo com erro.
 *
 * Uso: `<form onSubmit={form.handleSubmit(enviar)}>` e `<BotaoEnviar pendente={pendente}>`.
 */
export function useEnvioFormulario<V extends FieldValues, T>(
  form: UseFormReturn<V>,
  acao: (valores: V) => Promise<ResultadoAcao<T>>,
  opcoes: Opcoes<T> = {},
) {
  const enviando = useRef(false);
  const [pendente, setPendente] = useState(false);
  const [erroGeral, setErroGeral] = useState<string | null>(null);

  async function enviar(valores: V) {
    if (enviando.current) return;
    enviando.current = true;
    setPendente(true);
    setErroGeral(null);
    try {
      const resultado = await acao(valores);
      if (resultado.ok) {
        opcoes.aoSucesso?.(resultado.dados);
        return;
      }
      const camposConhecidos = new Set(Object.keys(form.getValues()));
      const semCampo: string[] = [];
      let primeiro = true;
      for (const [campo, mensagens] of Object.entries(resultado.erros ?? {})) {
        const mensagem = mensagens?.[0];
        if (!mensagem) continue;
        const raiz = campo.split(".")[0];
        if (camposConhecidos.has(raiz)) {
          form.setError(campo as Path<V>, { type: "server", message: mensagem }, { shouldFocus: primeiro });
          primeiro = false;
        } else {
          semCampo.push(mensagem);
        }
      }
      setErroGeral(resultado.mensagem ?? (semCampo.length ? semCampo.join(" ") : null));
    } catch {
      setErroGeral(ERRO_INESPERADO);
    } finally {
      enviando.current = false;
      setPendente(false);
    }
  }

  return { enviar, pendente, erroGeral };
}
