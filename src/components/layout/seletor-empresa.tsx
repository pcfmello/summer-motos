"use client";

import { BuildingIcon, ChevronsUpDownIcon } from "lucide-react";
import { useState, useTransition } from "react";

import type { ResultadoAcao } from "@/components/formulario/resultado-acao";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { formatarCnpj } from "@/lib/formatacao";

import { ROTULO_REGIME, type EmpresaResumo } from "./tipos";

type SeletorEmpresaProps = {
  /** Só as empresas em que o usuário é membro. */
  empresas: EmpresaResumo[];
  empresaAtivaId: string;
  /**
   * Server action que grava a empresa ativa na sessão (`trocarEmpresa`). No
   * sucesso ela redireciona para o início; na recusa devolve a mensagem.
   * Sem ela, o seletor só mostra as empresas.
   */
  aoTrocar?: (empresaId: string) => Promise<ResultadoAcao | void>;
};

/** Seletor da empresa ativa. Apresentacional: a troca de verdade é a server action. */
export function SeletorEmpresa({ empresas, empresaAtivaId, aoTrocar }: SeletorEmpresaProps) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const ativa = empresas.find((empresa) => empresa.id === empresaAtivaId) ?? empresas[0];
  if (!ativa) return null;

  const conteudoBotao = (
    <>
      {pendente ? <Spinner data-icon="inline-start" /> : <BuildingIcon data-icon="inline-start" aria-hidden="true" />}
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-[12rem] truncate font-semibold">{ativa.nomeFantasia}</span>
        <span className="text-xs font-normal text-muted-foreground max-sm:hidden">
          {ROTULO_REGIME[ativa.regime]}
        </span>
      </span>
    </>
  );

  if (empresas.length < 2) {
    return (
      <div className="flex h-10 items-center gap-2 px-2 text-sm [&_svg]:size-4" aria-label="Empresa ativa">
        {conteudoBotao}
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-11 gap-2 px-2 md:h-10"
            aria-label={`Empresa ativa: ${ativa.nomeFantasia}. Trocar de empresa`}
            disabled={pendente}
          >
            {conteudoBotao}
            <ChevronsUpDownIcon data-icon="inline-end" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-80">
          <DropdownMenuLabel>Trocar de empresa</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={ativa.id}
              onValueChange={(id) => {
                if (!aoTrocar || id === ativa.id) return;
                setErro(null);
                iniciar(async () => {
                  const resultado = await aoTrocar(id);
                  if (resultado && !resultado.ok) {
                    setErro(resultado.mensagem ?? "Não foi possível trocar de empresa.");
                  }
                });
              }}
            >
              {empresas.map((empresa) => (
                <DropdownMenuRadioItem
                  key={empresa.id}
                  value={empresa.id}
                  disabled={!aoTrocar && empresa.id !== ativa.id}
                  className="min-h-11 items-start py-2"
                >
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{empresa.nomeFantasia}</span>
                    <span className="text-xs text-muted-foreground">
                      {ROTULO_REGIME[empresa.regime]} · CNPJ {formatarCnpj(empresa.cnpj)}
                    </span>
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
          {!aoTrocar ? (
            <>
              <DropdownMenuSeparator />
              <p className="px-1.5 py-1 text-xs text-muted-foreground">
                A troca de empresa não está disponível nesta tela.
              </p>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {erro ? (
        <p role="alert" className="max-w-[16rem] text-xs text-destructive">
          {erro}
        </p>
      ) : null}
    </div>
  );
}
