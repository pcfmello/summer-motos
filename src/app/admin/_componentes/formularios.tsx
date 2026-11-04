"use client";

/**
 * Formulários da área `/admin`: novo tenant, nova empresa e convite do dono.
 * react-hook-form + o mesmo esquema Zod da action (`server/domain/plataforma`);
 * os erros do servidor aparecem no campo certo (`useEnvioFormulario`).
 */
import { zodResolver } from "@hookform/resolvers/zod";
import { BanIcon, CheckIcon, CircleCheckIcon, CircleXIcon, ClockIcon, CopyIcon, LinkIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";

import { ConfirmacaoDestrutiva } from "@/components/confirmacao-destrutiva";
import { BotaoEnviar } from "@/components/formulario/botao-enviar";
import { CampoFormulario } from "@/components/formulario/campo-formulario";
import { useEnvioFormulario } from "@/components/formulario/use-envio-formulario";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { formatarDataHora } from "@/lib/formatacao";
import {
  convidarDonoAcao,
  criarEmpresaAcao,
  criarTenantAcao,
  revogarConviteDonoAcao,
  type ResultadoConviteDono,
} from "@/server/actions/admin";
import {
  REGIMES_TRIBUTARIOS,
  ROTULO_REGIME,
  UFS,
  esquemaConviteDono,
  esquemaNovaEmpresa,
  esquemaNovoTenant,
  type ConviteDono,
  type NovaEmpresa,
  type NovoTenant,
} from "@/server/domain/plataforma";
import type { SituacaoDono } from "@/server/queries/admin";

function ErroGeral({ titulo, mensagem }: { titulo: string; mensagem: string | null }) {
  if (!mensagem) return null;
  return (
    <Alert variant="destructive">
      <CircleXIcon aria-hidden="true" />
      <AlertTitle>{titulo}</AlertTitle>
      <AlertDescription>{mensagem}</AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------- Tenant

export function FormularioTenant() {
  const router = useRouter();
  const form = useForm<NovoTenant>({ resolver: zodResolver(esquemaNovoTenant), defaultValues: { nome: "" } });
  const { enviar, pendente, erroGeral } = useEnvioFormulario(form, criarTenantAcao, {
    aoSucesso: ({ id }) => router.push(`/admin/tenants/${id}`),
  });

  return (
    <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex max-w-xl flex-col gap-5">
      <FieldGroup>
        <CampoFormulario
          control={form.control}
          name="nome"
          rotulo="Nome do tenant"
          obrigatorio
          descricao="O cliente que contratou o SUMMER (ex.: o grupo da loja). As empresas (CNPJs) vêm no passo seguinte."
        >
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="off" autoFocus />}
        </CampoFormulario>
      </FieldGroup>
      <ErroGeral titulo="Não foi possível criar o tenant" mensagem={erroGeral} />
      <div>
        <BotaoEnviar pendente={pendente} textoPendente="Criando…">
          Criar tenant
        </BotaoEnviar>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Empresa

export function FormularioEmpresa({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const form = useForm<NovaEmpresa>({
    resolver: zodResolver(esquemaNovaEmpresa),
    defaultValues: {
      razaoSocial: "",
      nomeFantasia: "",
      cnpj: "",
      regimeTributario: "" as NovaEmpresa["regimeTributario"],
      uf: "",
      codigoIbgeMunicipio: "",
    },
  });
  const { enviar, pendente, erroGeral } = useEnvioFormulario(form, (valores) => criarEmpresaAcao(tenantId, valores), {
    aoSucesso: ({ id }) => router.push(`/admin/tenants/${tenantId}/empresas/${id}`),
  });

  return (
    <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex max-w-2xl flex-col gap-5">
      <FieldGroup>
        <CampoFormulario control={form.control} name="razaoSocial" rotulo="Razão social" obrigatorio>
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="off" autoFocus />}
        </CampoFormulario>
        <CampoFormulario control={form.control} name="nomeFantasia" rotulo="Nome fantasia">
          {({ field, controle }) => <Input {...field} {...controle} autoComplete="off" />}
        </CampoFormulario>
        <div className="grid gap-5 sm:grid-cols-2">
          <CampoFormulario
            control={form.control}
            name="cnpj"
            rotulo="CNPJ"
            obrigatorio
            descricao="Com ou sem pontos. Aceita o CNPJ alfanumérico."
          >
            {({ field, controle }) => (
              <Input {...field} {...controle} autoComplete="off" inputMode="text" className="font-mono uppercase" />
            )}
          </CampoFormulario>
          <CampoFormulario control={form.control} name="regimeTributario" rotulo="Regime tributário" obrigatorio>
            {({ field, controle }) => (
              <NativeSelect {...field} {...controle} className="w-full">
                <NativeSelectOption value="" disabled>
                  Escolha…
                </NativeSelectOption>
                {REGIMES_TRIBUTARIOS.map((regime) => (
                  <NativeSelectOption key={regime} value={regime}>
                    {ROTULO_REGIME[regime]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </CampoFormulario>
        </div>
        <div className="grid gap-5 sm:grid-cols-[8rem_1fr]">
          <CampoFormulario control={form.control} name="uf" rotulo="UF">
            {({ field, controle }) => (
              <NativeSelect {...field} {...controle} className="w-full">
                <NativeSelectOption value="">—</NativeSelectOption>
                {UFS.map((uf) => (
                  <NativeSelectOption key={uf} value={uf}>
                    {uf}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            )}
          </CampoFormulario>
          <CampoFormulario
            control={form.control}
            name="codigoIbgeMunicipio"
            rotulo="Código IBGE do município"
            descricao="7 números. Obrigatório para ligar o módulo fiscal."
          >
            {({ field, controle }) => (
              <Input {...field} {...controle} autoComplete="off" inputMode="numeric" maxLength={7} className="font-mono" />
            )}
          </CampoFormulario>
        </div>
      </FieldGroup>
      <Alert variant="info">
        <CircleCheckIcon aria-hidden="true" />
        <AlertTitle>O que é criado junto</AlertTitle>
        <AlertDescription>
          Depósitos “Loja” e “Garantia”, o cliente “Consumidor final”, a tabela de preço “Balcão” e a numeração dos
          documentos. Todos os módulos nascem desligados.
        </AlertDescription>
      </Alert>
      <ErroGeral titulo="Não foi possível criar a empresa" mensagem={erroGeral} />
      <div>
        <BotaoEnviar pendente={pendente} textoPendente="Criando…">
          Criar empresa
        </BotaoEnviar>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- Convite do dono

function ConvitePendente({ empresaId, email, expiraEm }: { empresaId: string; email: string; expiraEm: string }) {
  const [erro, setErro] = useState<string | null>(null);
  return (
    <Alert variant="info">
      <ClockIcon aria-hidden="true" />
      <AlertTitle>Convite de dono pendente</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          Para <strong className="[overflow-wrap:anywhere]">{email}</strong>, vale até {formatarDataHora(expiraEm)}. Para
          gerar um link novo para o mesmo e-mail, convide de novo (o anterior deixa de valer). Para convidar outro
          e-mail, revogue este antes.
        </span>
        <span>
          <ConfirmacaoDestrutiva
            titulo="Revogar o convite pendente?"
            descricao={`O link enviado para ${email} deixa de valer na hora. Fica registrado na auditoria.`}
            rotuloConfirmar="Revogar convite"
            aoConfirmar={async () => {
              setErro(null);
              try {
                const resultado = await revogarConviteDonoAcao(empresaId);
                if (!resultado.ok) setErro(resultado.mensagem ?? "Não foi possível revogar agora.");
              } catch {
                setErro("Não foi possível revogar agora. Confira a conexão e tente de novo.");
              }
            }}
          >
            <Button type="button" variant="destructive" className="max-md:h-11">
              <BanIcon data-icon="inline-start" aria-hidden="true" />
              Revogar convite
            </Button>
          </ConfirmacaoDestrutiva>
        </span>
        {erro ? <span role="alert" className="text-destructive">{erro}</span> : null}
      </AlertDescription>
    </Alert>
  );
}

function LinkDoConvite({ email, link }: { email: string; link: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Alert variant="alerta">
      <LinkIcon aria-hidden="true" />
      <AlertTitle>Link do convite: copie agora, ele não aparece de novo</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>
          Envie para <strong className="[overflow-wrap:anywhere]">{email}</strong> por um canal seguro (WhatsApp ou
          e-mail). O link vale por 7 dias e só pode ser usado uma vez: a pessoa define a própria senha ou, se já tiver
          conta, entra e aceita.
        </span>
        <code className="rounded-md border bg-background px-3 py-1.5 font-mono text-sm select-all [overflow-wrap:anywhere]">
          {link}
        </code>
        <span>
          <Button
            type="button"
            variant="outline"
            className="max-md:h-11"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(link);
                setCopiado(true);
              } catch {
                setCopiado(false);
              }
            }}
          >
            {copiado ? (
              <CheckIcon data-icon="inline-start" aria-hidden="true" />
            ) : (
              <CopyIcon data-icon="inline-start" aria-hidden="true" />
            )}
            {copiado ? "Copiado" : "Copiar link"}
          </Button>
        </span>
      </AlertDescription>
    </Alert>
  );
}

/**
 * Convite do primeiro dono por link de uso único (D033). A resposta é a mesma
 * para e-mail novo e existente: só o link, guardado só no estado desta tela.
 */
export function FormularioConviteDono({ empresaId, situacao }: { empresaId: string; situacao: SituacaoDono }) {
  const [convite, setConvite] = useState<(ResultadoConviteDono & { email: string }) | null>(null);
  const form = useForm<ConviteDono>({
    resolver: zodResolver(esquemaConviteDono),
    defaultValues: { email: "" },
  });
  const { enviar, pendente, erroGeral } = useEnvioFormulario(
    form,
    async (valores) => {
      setConvite(null);
      const resultado = await convidarDonoAcao(empresaId, valores);
      if (resultado.ok) setConvite({ ...resultado.dados, email: valores.email.trim().toLowerCase() });
      return resultado;
    },
    { aoSucesso: () => form.reset() },
  );

  // o estado do link sobrevive à revalidação da página (mesma posição na árvore)
  const podeConvidar = !situacao.temMembros;

  return (
    <div className="flex flex-col gap-5">
      {situacao.temMembros ? (
        <Alert variant="info">
          <CircleCheckIcon aria-hidden="true" />
          <AlertTitle>Esta empresa já tem dono ou outros membros</AlertTitle>
          <AlertDescription>Os próximos donos e os demais usuários são convidados pelo dono da loja.</AlertDescription>
        </Alert>
      ) : situacao.convitePendente && !convite ? (
        <ConvitePendente empresaId={empresaId} {...situacao.convitePendente} />
      ) : null}

      {podeConvidar ? (
      <form noValidate onSubmit={form.handleSubmit(enviar)} className="flex flex-col gap-5">
        <FieldGroup>
          <CampoFormulario
            control={form.control}
            name="email"
            rotulo="E-mail do dono"
            obrigatorio
            descricao="A pessoa recebe um link para definir o nome e a senha, ou para aceitar com a conta que já tem."
          >
            {({ field, controle }) => (
              <Input {...field} {...controle} type="email" autoComplete="off" inputMode="email" spellCheck={false} />
            )}
          </CampoFormulario>
        </FieldGroup>
        <ErroGeral titulo="Não foi possível convidar" mensagem={erroGeral} />
        <div>
          <BotaoEnviar pendente={pendente} textoPendente="Gerando o link…">
            Gerar link de convite
          </BotaoEnviar>
        </div>
      </form>
      ) : null}

      {convite ? (
        <div className="flex flex-col gap-3" aria-live="polite">
          <Alert variant="sucesso">
            <CircleCheckIcon aria-hidden="true" />
            <AlertTitle>Convite criado</AlertTitle>
            <AlertDescription>
              Convite de dono para <span className="[overflow-wrap:anywhere]">{convite.email}</span>.
            </AlertDescription>
          </Alert>
          <LinkDoConvite email={convite.email} link={convite.link} />
        </div>
      ) : null}
    </div>
  );
}
