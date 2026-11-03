"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { CircleCheckIcon, CircleXIcon } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { CampoMoeda } from "@/components/campos/campo-moeda";
import { CampoQuantidade } from "@/components/campos/campo-quantidade";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { useEnvioFormulario } from "@/components/formulario/use-envio-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

import { salvarProdutoExemplo } from "./acoes";
import { esquemaProdutoExemplo, type ProdutoExemplo } from "./esquema-exemplo";

export function FormularioExemplo() {
  const [salvo, setSalvo] = useState<{ codigo: string; valores: ProdutoExemplo } | null>(null);
  const form = useForm<ProdutoExemplo>({
    resolver: zodResolver(esquemaProdutoExemplo),
    defaultValues: { descricao: "", codigo: "", preco: "", quantidade: "" },
  });
  const { enviar, pendente, erroGeral } = useEnvioFormulario(form, salvarProdutoExemplo, {
    aoSucesso: (dados) => setSalvo({ codigo: dados.codigo, valores: form.getValues() }),
  });

  return (
    <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex max-w-xl flex-col gap-5">
      <FieldGroup>
        <CampoFormulario control={form.control} name="descricao" rotulo="Descrição" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoFormulario>
        <CampoFormulario
          control={form.control}
          name="codigo"
          rotulo="Código interno"
          descricao="Deixe em branco para gerar. Digite 000001 para ver um erro vindo do servidor."
        >
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoFormulario>
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario control={form.control} name="preco" rotulo="Preço de venda" obrigatorio>
            {({ field, controle }) => <CampoMoeda {...field} {...controle} placeholder="0,00" />}
          </CampoFormulario>
          <CampoFormulario
            control={form.control}
            name="quantidade"
            rotulo="Quantidade"
            obrigatorio
            descricao="Até 4 casas: 1,5 litro."
          >
            {({ field, controle }) => <CampoQuantidade {...field} {...controle} unidade="LT" placeholder="0" />}
          </CampoFormulario>
        </div>
      </FieldGroup>

      {erroGeral ? (
        <Alert variant="destructive">
          <CircleXIcon aria-hidden="true" />
          <AlertTitle>Não foi possível salvar</AlertTitle>
          <AlertDescription>{erroGeral}</AlertDescription>
        </Alert>
      ) : null}

      {salvo ? (
        <Alert variant="sucesso">
          <CircleCheckIcon aria-hidden="true" />
          <AlertTitle>Produto salvo (simulação)</AlertTitle>
          <AlertDescription>
            Código {salvo.codigo}. Enviado ao servidor:{" "}
            <code className="font-mono text-xs">{JSON.stringify(salvo.valores)}</code>
          </AlertDescription>
        </Alert>
      ) : null}

      <div>
        <BotaoEnviar pendente={pendente}>Salvar produto</BotaoEnviar>
      </div>
    </form>
  );
}
