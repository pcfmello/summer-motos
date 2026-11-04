"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleAlertIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authCliente } from "@/lib/auth-cliente";
import { PARAM_DESTINO, destinoSeguro } from "@/lib/rotas-auth";

const esquemaLogin = z.object({
  email: z.email("Digite um e-mail válido, como nome@loja.com.br."),
  senha: z.string().min(1, "Digite a sua senha."),
});

type DadosLogin = z.infer<typeof esquemaLogin>;

// Mensagem única para e-mail inexistente e senha errada: não revela quem tem cadastro.
const MENSAGEM_CREDENCIAIS = "E-mail ou senha incorretos. Confira e tente de novo.";
const MENSAGEM_LIMITE = "Muitas tentativas seguidas. Aguarde um minuto e tente de novo.";
const MENSAGEM_FALHA = "Não foi possível entrar agora. Confira a conexão e tente de novo.";

/**
 * Login por e-mail e senha no Better Auth (`POST /api/auth/sign-in/email`,
 * com limite de tentativas por IP). Depois de entrar, volta para a página que
 * pediu o login (`?de=`), só se for um caminho interno.
 */
export function FormularioLogin() {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const form = useForm<DadosLogin>({
    resolver: zodResolver(esquemaLogin),
    defaultValues: { email: "", senha: "" },
  });

  async function entrar(dados: DadosLogin) {
    setErro(null);
    try {
      const { error } = await authCliente.signIn.email({ email: dados.email, password: dados.senha });
      if (error) {
        if (error.status === 429) setErro(MENSAGEM_LIMITE);
        else if (!error.status || error.status >= 500) setErro(MENSAGEM_FALHA);
        else setErro(MENSAGEM_CREDENCIAIS);
        form.setValue("senha", "");
        form.setFocus("senha");
        return;
      }
    } catch {
      setErro(MENSAGEM_FALHA);
      return;
    }
    const destino = destinoSeguro(new URLSearchParams(window.location.search).get(PARAM_DESTINO));
    router.replace(destino);
    router.refresh();
  }

  return (
    <form
      method="post"
      noValidate
      onSubmit={form.handleSubmit(entrar)}
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

      {erro ? (
        <Alert variant="destructive" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertTitle>Não foi possível entrar</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}

      <BotaoEnviar pendente={form.formState.isSubmitting} textoPendente="Entrando…" className="h-11 w-full md:h-10">
        Entrar
      </BotaoEnviar>
    </form>
  );
}
