/**
 * Regras puras da OS ligadas ao perfil: transições de status e quem decide a
 * comissão do serviço. Sem banco; testadas em `os-regras.test.ts`.
 *
 * A action que muda o status (Entrega 3) lê a OS com `FOR UPDATE`, confere o
 * acesso com `exigirAcessoOS` e só então consulta `transicaoStatusOSPermitida`.
 * O banco ainda impede sair de `entregue`/`cancelada` (gatilho, D026).
 */
import type { STATUS_OS } from "../db/schema";
import { pode, type Perfil } from "./permissoes";

export type StatusOS = (typeof STATUS_OS)[number];

/** Status em que a OS está aberta e o mecânico pode mover o cartão. */
export const STATUS_INTERMEDIARIOS_OS = ["aberta", "aguardando_peca", "em_execucao", "pronta"] as const satisfies
  readonly StatusOS[];
export const STATUS_FINAIS_OS = ["entregue", "cancelada"] as const satisfies readonly StatusOS[];

function intermediario(status: StatusOS): boolean {
  return (STATUS_INTERMEDIARIOS_OS as readonly StatusOS[]).includes(status);
}

/**
 * Tabela de transições por perfil:
 * - entre `aberta`, `aguardando_peca`, `em_execucao` e `pronta`: `os.mudar_status`
 *   (dono e mecânico);
 * - para `entregue`: `os.entregar` (dono e balcão), e só a partir de `pronta`
 *   (conservador: a entrega registra pagamento e baixa as peças);
 * - para `cancelada`: `os.cancelar` (só o dono), de qualquer status aberto;
 * - `entregue` e `cancelada` são finais (D018-P3: a OS não reabre).
 */
export function transicaoStatusOSPermitida(perfil: Perfil, de: StatusOS, para: StatusOS): boolean {
  if (de === para || !intermediario(de)) return false;
  if (para === "entregue") return de === "pronta" && pode(perfil, "os.entregar");
  if (para === "cancelada") return pode(perfil, "os.cancelar");
  return pode(perfil, "os.mudar_status");
}

export type EntradaComissaoServico = {
  /** `servicos.comissao_valor` do serviço da tabela; `null` = serviço lançado à mão. */
  comissaoDoCadastro: string | null;
  /** Valor enviado pela tela. Só é considerado se quem lança é dono. */
  comissaoInformada?: string | null;
};

export type DecisaoComissaoServico =
  | { tipo: "valor"; valor: string }
  /** Dono lançando serviço à mão sem informar a comissão: a action recusa. */
  | { tipo: "obrigatoria" }
  /**
   * Serviço à mão lançado por quem não é dono: a comissão fica "a definir pelo
   * dono". Como o banco exige `comissao_valor` em item de serviço, a forma de
   * gravar isso (e se a OS pode ser entregue antes de o dono definir) depende de
   * uma pergunta ao diretor; a action da Entrega 3 implementa a resposta.
   */
  | { tipo: "a_definir_pelo_dono" };

/**
 * Quem decide a comissão do serviço lançado na OS (regra 4.13):
 * - o valor enviado só vale se o perfil tiver `os.definir_comissao_servico_manual`
 *   (só o dono); de qualquer outro perfil, é **sempre ignorado**;
 * - serviço da tabela: o valor do cadastro, salvo se o dono informar outro;
 * - serviço manual: obrigatório para o dono; "a definir pelo dono" para os demais.
 */
export function comissaoDoServicoLancado(perfil: Perfil, entrada: EntradaComissaoServico): DecisaoComissaoServico {
  const donoDecide = pode(perfil, "os.definir_comissao_servico_manual");
  const informada = donoDecide ? (entrada.comissaoInformada ?? null) : null;
  if (informada !== null) return { tipo: "valor", valor: informada };
  if (entrada.comissaoDoCadastro !== null) return { tipo: "valor", valor: entrada.comissaoDoCadastro };
  return donoDecide ? { tipo: "obrigatoria" } : { tipo: "a_definir_pelo_dono" };
}
