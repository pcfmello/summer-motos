"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CheckIcon, CircleXIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";

import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { useEnvioFormulario } from "@/components/formulario/use-envio-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { aceitarConviteAcao, aceitarConviteNovaContaAcao } from "@/server/actions/convites";
import { SENHA_MINIMO, esquemaAceiteNovaConta, type AceiteNovaConta } from "@/server/domain/plataforma";

function ErroGeral({ mensagem }: { mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <Alert variant="destructive">
      <CircleXIcon aria-hidden="true" />
      <AlertTitle>Não foi possível aceitar</AlertTitle>
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}

/** Quem não tem conta: nome, senha e confirmação. A conta nasce vinculada e a pessoa já entra. */
export function FormularioNovaConta({ token }: { token: string }) {
  const router = useRouter();
  const form = useForm<AceiteNovaConta>({
    resolver: zodResolver(esquemaAceiteNovaConta),
    defaultValues: { nome: "", senha: "", confirmacao: "" },
  });
  const { enviar, pendente, erroGeral } = useEnvioFormulario(
    form,
    (valores) => aceitarConviteNovaContaAcao(token, valores),
    {
      aoSucesso: ({ destino }) => {
        router.replace(destino);
        router.refresh();
      },
    },
  );

  return (
    <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-5">
      <FieldGroup>
        <CampoFormulario control={form.control} name="nome" rotulo="Seu nome" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="name" autoFocus />}
        </CampoFormulario>
        <CampoFormulario
          control={form.control}
          name="senha"
          rotulo="Senha"
          obrigatorio
          descricao={`Pelo menos ${SENHA_MINIMO} caracteres. Uma frase curta é fácil de lembrar e difícil de adivinhar.`}
        >
          {({ field, controle }) => <Input {...field} {...controle} type="password" autoComplete="new-password" />}
        </CampoFormulario>
        <CampoFormulario control={form.control} name="confirmacao" rotulo="Repita a senha" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} type="password" autoComplete="new-password" />}
        </CampoFormulario>
      </FieldGroup>
      <ErroGeral mensagem={erroGeral} />
      <BotaoEnviar pendente={pendente} textoPendente="Criando a conta…" className="w-full max-md:h-11">
        Criar conta e entrar
      </BotaoEnviar>
    </form>
  );
}

/** Quem já entrou com o e-mail do convite: um clique para aceitar. */
export function BotaoAceitarConvite({ token, empresa, perfil }: { token: string; empresa: string; perfil: string }) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <ErroGeral mensagem={erro} />
      <Button
        className="h-auto min-h-11 w-full py-2 whitespace-normal md:min-h-9"
        disabled={pendente}
        aria-busy={pendente}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            try {
              const resultado = await aceitarConviteAcao(token);
              if (!resultado.ok) {
                setErro(resultado.mensagem ?? "Não foi possível aceitar agora.");
                return;
              }
              router.replace(resultado.dados.destino);
              router.refresh();
            } catch {
              setErro("Não foi possível aceitar agora. Confira a conexão e tente de novo.");
            }
          })
        }
      >
        {pendente ? <Spinner data-icon="inline-start" /> : <CheckIcon data-icon="inline-start" aria-hidden="true" />}
        Aceitar convite para {empresa} como {perfil}
      </Button>
    </div>
  );
}
