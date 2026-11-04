"use client";

/**
 * Ações de um clique da área `/admin`: suspender/reativar tenant e
 * ligar/desligar módulos da empresa. As destrutivas (suspender, desligar)
 * pedem confirmação (seção 2.1).
 */
import { CircleCheckIcon, CircleXIcon, PauseCircleIcon, PlayCircleIcon, PowerIcon, PowerOffIcon } from "lucide-react";
import { useState, useTransition } from "react";

import { ConfirmacaoDestrutiva } from "@/components/confirmacao-destrutiva";
import { StatusBadge } from "@/components/status-badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { alterarModuloAcao, definirStatusTenantAcao } from "@/server/actions/admin";
import type { Modulos } from "@/server/auth/permissoes";
import { MODULOS_EMPRESA, ROTULO_MODULO, type ModuloEmpresa, type StatusTenant } from "@/server/domain/plataforma";

type Aviso = { tipo: "sucesso" | "erro"; texto: string } | null;

const ERRO_INESPERADO = "Não foi possível concluir agora. Confira a conexão e tente de novo.";

function AvisoAcao({ aviso }: { aviso: Aviso }) {
  if (!aviso) return null;
  const erro = aviso.tipo === "erro";
  return (
    <Alert variant={erro ? "destructive" : "sucesso"} role={erro ? "alert" : "status"}>
      {erro ? <CircleXIcon aria-hidden="true" /> : <CircleCheckIcon aria-hidden="true" />}
      <AlertDescription>{aviso.texto}</AlertDescription>
    </Alert>
  );
}

// ---------------------------------------------------------------- Status do tenant

export function AcaoStatusTenant({ tenantId, nome, status }: { tenantId: string; nome: string; status: StatusTenant }) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [pendente, iniciar] = useTransition();

  async function aplicar(novo: StatusTenant) {
    setAviso(null);
    try {
      const resultado = await definirStatusTenantAcao(tenantId, novo);
      setAviso(
        resultado.ok
          ? { tipo: "sucesso", texto: resultado.mensagem ?? "Pronto." }
          : { tipo: "erro", texto: resultado.mensagem ?? ERRO_INESPERADO },
      );
    } catch {
      setAviso({ tipo: "erro", texto: ERRO_INESPERADO });
    }
  }

  return (
    <div className="flex flex-col items-start gap-3 sm:items-end">
      {status === "ativo" ? (
        <ConfirmacaoDestrutiva
          titulo={`Suspender o tenant “${nome}”?`}
          descricao="Todos os usuários das empresas dele perdem o acesso na hora (os dados ficam guardados). Dá para reativar depois. Fica registrado na auditoria de cada empresa."
          rotuloConfirmar="Suspender tenant"
          aoConfirmar={() => aplicar("suspenso")}
        >
          <Button variant="destructive" className="max-md:h-11">
            <PauseCircleIcon data-icon="inline-start" aria-hidden="true" />
            Suspender tenant
          </Button>
        </ConfirmacaoDestrutiva>
      ) : (
        <Button
          variant="outline"
          className="max-md:h-11"
          disabled={pendente}
          onClick={() => iniciar(() => aplicar("ativo"))}
        >
          {pendente ? (
            <Spinner data-icon="inline-start" />
          ) : (
            <PlayCircleIcon data-icon="inline-start" aria-hidden="true" />
          )}
          Reativar tenant
        </Button>
      )}
      <AvisoAcao aviso={aviso} />
    </div>
  );
}

// ---------------------------------------------------------------- Módulos da empresa

const DESCRICAO_MODULO: Record<ModuloEmpresa, string> = {
  balcao: "Vendas no balcão.",
  os: "Ordens de serviço da oficina.",
  fiscal: "Emissão de NF-e e NFC-e pelo Focus. Exige o código IBGE do município.",
  mercado_livre: "Integração com o Mercado Livre.",
  ecommerce: "API e sincronização com o e-commerce.",
  estoque: "Marca a virada: o estoque passa a ser controlado pelo SUMMER.",
};

export function ModulosEmpresa({ empresaId, modulos }: { empresaId: string; modulos: Modulos }) {
  const [atuais, setAtuais] = useState(modulos);
  const [aviso, setAviso] = useState<Aviso>(null);
  const [emAndamento, setEmAndamento] = useState<ModuloEmpresa | null>(null);
  const [, iniciar] = useTransition();

  async function alterar(modulo: ModuloEmpresa, ligado: boolean) {
    setAviso(null);
    setEmAndamento(modulo);
    try {
      const resultado = await alterarModuloAcao(empresaId, { modulo, ligado });
      if (resultado.ok) {
        setAtuais(resultado.dados.modulos);
        setAviso({
          tipo: "sucesso",
          texto: `${ROTULO_MODULO[modulo]} ${resultado.dados.modulos[modulo] ? "ligado" : "desligado"}.`,
        });
      } else {
        setAviso({ tipo: "erro", texto: resultado.mensagem ?? ERRO_INESPERADO });
      }
    } catch {
      setAviso({ tipo: "erro", texto: ERRO_INESPERADO });
    } finally {
      setEmAndamento(null);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y rounded-lg border bg-background" aria-label="Módulos da empresa">
        {MODULOS_EMPRESA.map((modulo) => {
          const ligado = atuais[modulo];
          const ocupado = emAndamento === modulo;
          return (
            <li key={modulo} className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 flex-col gap-1">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {ROTULO_MODULO[modulo]}
                  {ligado ? (
                    <StatusBadge variante="sucesso" icone={PowerIcon}>
                      Ligado
                    </StatusBadge>
                  ) : (
                    <StatusBadge variante="neutro" icone={PowerOffIcon}>
                      Desligado
                    </StatusBadge>
                  )}
                </span>
                <span className="text-sm text-muted-foreground">{DESCRICAO_MODULO[modulo]}</span>
              </div>
              {ligado ? (
                <ConfirmacaoDestrutiva
                  titulo={`Desligar ${ROTULO_MODULO[modulo]}?`}
                  descricao="As telas e ações deste módulo deixam de funcionar para todos os usuários da empresa na hora. Os dados ficam guardados. Fica registrado na auditoria."
                  rotuloConfirmar="Desligar módulo"
                  aoConfirmar={() => alterar(modulo, false)}
                >
                  <Button variant="destructive" className="shrink-0 max-md:h-11" disabled={emAndamento !== null}>
                    <PowerOffIcon data-icon="inline-start" aria-hidden="true" />
                    Desligar
                  </Button>
                </ConfirmacaoDestrutiva>
              ) : (
                <Button
                  variant="outline"
                  className="shrink-0 max-md:h-11"
                  disabled={emAndamento !== null}
                  aria-busy={ocupado}
                  onClick={() => iniciar(() => alterar(modulo, true))}
                >
                  {ocupado ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <PowerIcon data-icon="inline-start" aria-hidden="true" />
                  )}
                  Ligar
                </Button>
              )}
            </li>
          );
        })}
      </ul>
      <div aria-live="polite">
        <AvisoAcao aviso={aviso} />
      </div>
    </div>
  );
}
