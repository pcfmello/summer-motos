"use client";

import { useState, type ComponentProps, type Ref } from "react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@/components/ui/input-group";
import {
  decimalParaTextoEdicao,
  ehStringDecimal,
  formatarNumero,
  parseDecimalBR,
} from "@/lib/formatacao";

export type CampoDecimalProps = Omit<
  ComponentProps<"input">,
  "value" | "defaultValue" | "onChange" | "type" | "inputMode" | "prefix"
> & {
  /**
   * String decimal com ponto ("1234.56") ou "" quando vazio. Se o usuário
   * digitar algo inválido, o campo devolve o próprio texto, para o schema Zod
   * reprovar e mostrar o erro no campo.
   */
  value: string;
  onChange: (valor: string) => void;
  ref?: Ref<HTMLInputElement>;
  /** Máximo de casas decimais aceitas. */
  casas: number;
  /** Exibe e envia sempre com `casas` casas (dinheiro). */
  casasFixas?: boolean;
  permitirNegativo?: boolean;
  /** Texto à esquerda, ex.: "R$". */
  prefixo?: string;
  /** Texto à direita, ex.: a unidade "LT". */
  sufixo?: string;
};

/**
 * Campo numérico pt-BR. Enquanto o usuário digita, o texto fica como ele
 * escreveu ("1234,5"); ao sair do campo, mostra formatado ("1.234,50").
 * O valor do formulário é sempre string decimal com ponto, nunca `number`.
 */
export function CampoDecimal({
  value,
  onChange,
  onFocus,
  onBlur,
  casas,
  casasFixas = false,
  permitirNegativo = false,
  prefixo,
  sufixo,
  className,
  ...props
}: CampoDecimalProps) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState("");

  const exibido = editando
    ? texto
    : ehStringDecimal(value)
      ? formatarNumero(value, casasFixas ? casas : 0, casas)
      : value;

  const caracteresPermitidos = permitirNegativo ? /[^\d.,-]/g : /[^\d.,]/g;

  return (
    <InputGroup className={className}>
      {prefixo ? (
        <InputGroupAddon>
          <InputGroupText>{prefixo}</InputGroupText>
        </InputGroupAddon>
      ) : null}
      <InputGroupInput
        {...props}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        className="text-right tabular-nums"
        value={exibido}
        onFocus={(evento) => {
          const inicial = ehStringDecimal(value) ? decimalParaTextoEdicao(value) : value;
          setTexto(inicial);
          setEditando(true);
          onFocus?.(evento);
          // Seleciona tudo para o usuário sobrescrever direto, mas só se ele
          // ainda não começou a digitar (leitor e digitação rápida não perdem caractere)
          const alvo = evento.currentTarget;
          requestAnimationFrame(() => {
            if (inicial !== "" && alvo.value === inicial) alvo.select();
          });
        }}
        onChange={(evento) => {
          const novo = evento.target.value.replace(caracteresPermitidos, "");
          setTexto(novo);
          if (novo.trim() === "") {
            onChange("");
            return;
          }
          const decimal = parseDecimalBR(novo, {
            casas,
            fixo: casasFixas,
            permitirNegativo,
          });
          onChange(decimal ?? novo);
        }}
        onBlur={(evento) => {
          setEditando(false);
          onBlur?.(evento);
        }}
      />
      {sufixo ? (
        <InputGroupAddon align="inline-end">
          <InputGroupText>{sufixo}</InputGroupText>
        </InputGroupAddon>
      ) : null}
    </InputGroup>
  );
}
