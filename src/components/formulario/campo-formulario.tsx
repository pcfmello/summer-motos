"use client";

import type { ReactNode } from "react";
import {
  Controller,
  type Control,
  type ControllerFieldState,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";

import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";

type PropsControle<V extends FieldValues, N extends FieldPath<V>> = {
  field: ControllerRenderProps<V, N>;
  fieldState: ControllerFieldState;
  /** Props de acessibilidade para espalhar no controle: id, aria-invalid, aria-describedby. */
  controle: {
    id: string;
    "aria-invalid": boolean;
    "aria-describedby"?: string;
  };
};

type CampoFormularioProps<V extends FieldValues, N extends FieldPath<V>> = {
  control: Control<V>;
  name: N;
  rotulo: string;
  descricao?: ReactNode;
  /** Campo obrigatório: mostra um asterisco no rótulo (o schema é quem valida). */
  obrigatorio?: boolean;
  className?: string;
  children: (props: PropsControle<V, N>) => ReactNode;
};

/**
 * Campo de formulário padrão: Controller do react-hook-form + Field do shadcn.
 * Erros do cliente (Zod) e do servidor (`setError`) aparecem no mesmo lugar.
 *
 * <CampoFormulario control={form.control} name="preco" rotulo="Preço de venda">
 *   {({ field, controle }) => <CampoMoeda {...field} {...controle} />}
 * </CampoFormulario>
 */
export function CampoFormulario<V extends FieldValues, N extends FieldPath<V>>({
  control,
  name,
  rotulo,
  descricao,
  obrigatorio,
  className,
  children,
}: CampoFormularioProps<V, N>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const id = `campo-${name}`;
        const idDescricao = descricao ? `${id}-descricao` : undefined;
        const idErro = fieldState.invalid ? `${id}-erro` : undefined;
        const descritoPor = [idDescricao, idErro].filter(Boolean).join(" ") || undefined;
        return (
          <Field data-invalid={fieldState.invalid} className={className}>
            <FieldLabel htmlFor={id}>
              {rotulo}
              {obrigatorio ? (
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              ) : null}
            </FieldLabel>
            {children({
              field,
              fieldState,
              controle: { id, "aria-invalid": fieldState.invalid, "aria-describedby": descritoPor },
            })}
            {descricao ? <FieldDescription id={idDescricao}>{descricao}</FieldDescription> : null}
            {fieldState.invalid ? <FieldError id={idErro} errors={[fieldState.error]} /> : null}
          </Field>
        );
      }}
    />
  );
}
