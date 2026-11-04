"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { authCliente } from "@/lib/auth-cliente";
import { SENHA_MINIMO, esquemaTrocaSenha, type TrocaSenha } from "@/server/domain/plataforma";

const MENSAGEM_LIMITE = "Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.";
const MENSAGEM_FALHA = "Não foi possível trocar a senha agora. Confira a conexão e tente de novo.";

/**
 * Troca de senha pelo Better Auth (`POST /api/auth/change-password`, com o
 * limite de tentativas da rota). Encerra as outras sessões da conta.
 */
export function FormularioTrocaSenha() {
  const [erro, setErro] = useState<string | null>(null);
  const [trocada, setTrocada] = useState(false);
  const form = useForm<TrocaSenha>({
    resolver: zodResolver(esquemaTrocaSenha),
    defaultValues: { senhaAtual: "", novaSenha: "", confirmacao: "" },
  });

  async function trocar(dados: TrocaSenha) {
    setErro(null);
    setTrocada(false);
    try {
      const { error } = await authCliente.changePassword({
        currentPassword: dados.senhaAtual,
        newPassword: dados.novaSenha,
        revokeOtherSessions: true,
      });
      if (error) {
        if (error.status === 429) setErro(MENSAGEM_LIMITE);
        else if (error.status === 400 || error.status === 401) {
          form.setError("senhaAtual", { type: "server", message: "Senha atual incorreta." }, { shouldFocus: true });
        } else setErro(MENSAGEM_FALHA);
        return;
      }
      form.reset();
      setTrocada(true);
    } catch {
      setErro(MENSAGEM_FALHA);
    }
  }

  return (
    <form noValidate onSubmit={form.handleSubmit(trocar)} className="flex flex-col gap-5">
      <FieldGroup>
        <CampoFormulario control={form.control} name="senhaAtual" rotulo="Senha atual" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} type="password" autoComplete="current-password" />}
        </CampoFormulario>
        <CampoFormulario
          control={form.control}
          name="novaSenha"
          rotulo="Nova senha"
          obrigatorio
          descricao={`Pelo menos ${SENHA_MINIMO} caracteres.`}
        >
          {({ field, controle }) => <Input {...field} {...controle} type="password" autoComplete="new-password" />}
        </CampoFormulario>
        <CampoFormulario control={form.control} name="confirmacao" rotulo="Repita a nova senha" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} type="password" autoComplete="new-password" />}
        </CampoFormulario>
      </FieldGroup>
      {erro ? (
        <Alert variant="destructive">
          <CircleXIcon aria-hidden="true" />
          <AlertTitle>Senha não trocada</AlertTitle>
          <AlertDescription>{erro}</AlertDescription>
        </Alert>
      ) : null}
      {trocada ? (
        <Alert variant="sucesso" aria-live="polite">
          <CircleCheckIcon aria-hidden="true" />
          <AlertTitle>Senha trocada</AlertTitle>
          <AlertDescription>As outras sessões desta conta foram encerradas.</AlertDescription>
        </Alert>
      ) : null}
      <div>
        <BotaoEnviar pendente={form.formState.isSubmitting} textoPendente="Trocando…">
          Trocar senha
        </BotaoEnviar>
      </div>
    </form>
  );
}
