"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { InfoIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

const esquemaLogin = z.object({
  email: z.email("Digite um e-mail válido, como nome@loja.com.br."),
  senha: z.string().min(1, "Digite a sua senha."),
});

type DadosLogin = z.infer<typeof esquemaLogin>;

/**
 * Só a tela. A autenticação de verdade (Better Auth) chega na fatia 0.6;
 * até lá o envio apenas avisa que o login ainda não está disponível.
 */
export function FormularioLogin() {
  const [aviso, setAviso] = useState(false);
  const form = useForm<DadosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: "", senha: "" },
  });

  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(() => setAviso(true))}
      className="flex flex-col gap-5"
    >
      <FieldGroup>
        <CampoFormulario control={form.control} name="email" rotulo="E-mail">
          {({ field, controle }) => (
            <Input
              {...field}
              {...controle}
              type="email"
              autoComplete="username"
              inputMode="email"
              autoFocus
              className="h-11 md:h-10"
            />
          )}
        </CampoFormulario>
        <CampoFormulario control={form.control} name="senha" rotulo="Senha">
          {({ field, controle }) => (
            <Input
              {...field}
              {...controle}
              type="password"
              autoComplete="current-password"
              className="h-11 md:h-10"
            />
          )}
        </CampoFormulario>
      </FieldGroup>

      {aviso ? (
        <Alert variant="info">
          <InfoIcon aria-hidden="true" />
          <AlertTitle>Login ainda não disponível</AlertTitle>
          <AlertDescription>
            Esta tela é só a aparência. O acesso com e-mail e senha será liberado na próxima etapa.
          </AlertDescription>
        </Alert>
      ) : null}

      <BotaoEnviar pendente={form.formState.isSubmitting} textoPendente="Entrando…" className="h-11 w-full md:h-10">
        Entrar
      </BotaoEnviar>
    </form>
  );
}
