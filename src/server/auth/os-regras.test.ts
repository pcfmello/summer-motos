import { describe, expect, it } from "vitest";

import { PERFIS } from "./permissoes";
import {
  STATUS_INTERMEDIARIOS_OS,
  comissaoDoServicoLancado,
  transicaoStatusOSPermitida,
  type StatusOS,
} from "./os-regras";

const TODOS: StatusOS[] = ["aberta", "aguardando_peca", "em_execucao", "pronta", "entregue", "cancelada"];

describe("transições de status da OS por perfil", () => {
  it("mecânico só move entre aberta, aguardando peça, em execução e pronta", () => {
    for (const de of STATUS_INTERMEDIARIOS_OS) {
      for (const para of STATUS_INTERMEDIARIOS_OS) {
        expect(transicaoStatusOSPermitida("mecanico", de, para), `${de}→${para}`).toBe(de !== para);
      }
      expect(transicaoStatusOSPermitida("mecanico", de, "entregue")).toBe(false);
      expect(transicaoStatusOSPermitida("mecanico", de, "cancelada")).toBe(false);
    }
  });

  it("entregue só com os.entregar (dono e balcão) e só a partir de pronta", () => {
    expect(transicaoStatusOSPermitida("dono", "pronta", "entregue")).toBe(true);
    expect(transicaoStatusOSPermitida("balcao", "pronta", "entregue")).toBe(true);
    expect(transicaoStatusOSPermitida("estoque", "pronta", "entregue")).toBe(false);
    expect(transicaoStatusOSPermitida("dono", "em_execucao", "entregue")).toBe(false);
    expect(transicaoStatusOSPermitida("dono", "aberta", "entregue")).toBe(false);
  });

  it("cancelada só com os.cancelar (dono), de qualquer status aberto", () => {
    for (const de of STATUS_INTERMEDIARIOS_OS) {
      expect(transicaoStatusOSPermitida("dono", de, "cancelada")).toBe(true);
      for (const perfil of ["balcao", "estoque", "mecanico"] as const) {
        expect(transicaoStatusOSPermitida(perfil, de, "cancelada")).toBe(false);
      }
    }
  });

  it("balcão e estoque não arrastam o kanban entre os status intermediários", () => {
    expect(transicaoStatusOSPermitida("balcao", "aberta", "em_execucao")).toBe(false);
    expect(transicaoStatusOSPermitida("estoque", "aberta", "em_execucao")).toBe(false);
    expect(transicaoStatusOSPermitida("dono", "aberta", "em_execucao")).toBe(true);
  });

  it("entregue e cancelada são finais para todos; mesmo status não é transição", () => {
    for (const perfil of PERFIS) {
      for (const para of TODOS) {
        expect(transicaoStatusOSPermitida(perfil, "entregue", para)).toBe(false);
        expect(transicaoStatusOSPermitida(perfil, "cancelada", para)).toBe(false);
        expect(transicaoStatusOSPermitida(perfil, para, para)).toBe(false);
      }
    }
  });
});

describe("comissão do serviço lançado na OS", () => {
  it("serviço da tabela: vale a comissão do cadastro; quem não é dono não muda", () => {
    expect(
      comissaoDoServicoLancado("mecanico", { comissaoDoCadastro: "20.00", comissaoInformada: "999.00" }),
    ).toEqual({ tipo: "valor", valor: "20.00" });
    expect(comissaoDoServicoLancado("balcao", { comissaoDoCadastro: "20.00" })).toEqual({
      tipo: "valor",
      valor: "20.00",
    });
  });

  it("o dono pode informar a comissão, no serviço da tabela ou no manual", () => {
    expect(comissaoDoServicoLancado("dono", { comissaoDoCadastro: "20.00", comissaoInformada: "25.00" })).toEqual({
      tipo: "valor",
      valor: "25.00",
    });
    expect(comissaoDoServicoLancado("dono", { comissaoDoCadastro: null, comissaoInformada: "15.00" })).toEqual({
      tipo: "valor",
      valor: "15.00",
    });
  });

  it("serviço manual do dono sem comissão: obrigatória", () => {
    expect(comissaoDoServicoLancado("dono", { comissaoDoCadastro: null })).toEqual({ tipo: "obrigatoria" });
  });

  it("serviço manual de quem não é dono: comissão a definir pelo dono, ignorando o valor enviado", () => {
    for (const perfil of ["balcao", "mecanico", "estoque"] as const) {
      expect(comissaoDoServicoLancado(perfil, { comissaoDoCadastro: null, comissaoInformada: "50.00" })).toEqual({
        tipo: "a_definir_pelo_dono",
      });
    }
  });
});
