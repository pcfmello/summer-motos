/**
 * Perfis tributários de exemplo (seção 8). **Todos são EXEMPLO e precisam ser
 * validados pelo contador** antes de emitir nota de verdade: o nome já avisa.
 *
 * - Empresa do Simples Nacional (`simples`): perfis de regime `simples` (CSOSN).
 * - Empresa do Lucro Real (`real`): perfis de regime `normal` (CST do ICMS).
 *
 * Cada produto do catálogo tem um `grupoFiscal`; o seed liga o produto ao perfil
 * do mesmo grupo na empresa dele:
 * - `st_monofasico`: autopeças, pneus e lubrificantes com ICMS-ST já retido e
 *   PIS/COFINS monofásico (CSOSN 500 ou CST 60; PIS/COFINS CST 04);
 * - `tributado`: acessórios, capacetes e vestuário, sem ST (CSOSN 102 ou CST 00;
 *   PIS/COFINS no Simples pelo DAS, no Lucro Real não cumulativo CST 01).
 *
 * IBS/CBS (reforma): só nos perfis do regime normal, com as alíquotas de teste de
 * 2026 (CBS 0,9% e IBS 0,1%), CST 000 e cClassTrib 000001. No Simples ficam vazios.
 * Tudo isso é exemplo; o plano do Focus (Entrega 3) confere os campos.
 */
import type { perfisTributarios } from "../../../src/server/db/schema/catalogo";
import type { ChaveEmpresaDemo } from "./tipos";

export const GRUPOS_FISCAIS = ["st_monofasico", "tributado"] as const;
export type GrupoFiscal = (typeof GRUPOS_FISCAIS)[number];

type PerfilInsert = Omit<typeof perfisTributarios.$inferInsert, "id" | "empresaId" | "createdAt" | "updatedAt">;

export interface PerfilTributarioSeed {
  empresa: ChaveEmpresaDemo;
  grupoFiscal: GrupoFiscal;
  dados: PerfilInsert & { nome: string };
}

const AVISO = "EXEMPLO — validar com o contador";

export const PERFIS_TRIBUTARIOS = [
  {
    empresa: "simples",
    grupoFiscal: "st_monofasico",
    dados: {
      nome: `${AVISO}: Simples com ST retida (CSOSN 500) e PIS/COFINS monofásico`,
      descricao: "Autopeças, pneus e lubrificantes com ICMS-ST retido anteriormente. PIS/COFINS monofásico (CST 04).",
      regime: "simples",
      csosn: "500",
      stRetidoAnteriormente: true,
      cstPis: "04",
      aliqPis: "0.0000",
      cstCofins: "04",
      aliqCofins: "0.0000",
      monofasico: true,
    },
  },
  {
    empresa: "simples",
    grupoFiscal: "tributado",
    dados: {
      nome: `${AVISO}: Simples sem ST (CSOSN 102)`,
      descricao: "Acessórios, capacetes e vestuário. ICMS e PIS/COFINS recolhidos no DAS.",
      regime: "simples",
      csosn: "102",
      stRetidoAnteriormente: false,
      cstPis: "49",
      aliqPis: "0.0000",
      cstCofins: "49",
      aliqCofins: "0.0000",
      monofasico: false,
    },
  },
  {
    empresa: "real",
    grupoFiscal: "st_monofasico",
    dados: {
      nome: `${AVISO}: Normal com ST retida (CST 60) e PIS/COFINS monofásico`,
      descricao: "Autopeças, pneus e lubrificantes com ICMS-ST retido anteriormente. PIS/COFINS monofásico (CST 04).",
      regime: "normal",
      cstIcms: "60",
      stRetidoAnteriormente: true,
      cstPis: "04",
      aliqPis: "0.0000",
      cstCofins: "04",
      aliqCofins: "0.0000",
      monofasico: true,
      cstIbsCbs: "000",
      cclasstrib: "000001",
      aliqCbs: "0.9000",
      aliqIbsUf: "0.1000",
      aliqIbsMun: "0.0000",
    },
  },
  {
    empresa: "real",
    grupoFiscal: "tributado",
    dados: {
      nome: `${AVISO}: Normal sem ST (CST 00) e PIS/COFINS não cumulativo`,
      descricao: "Acessórios, capacetes e vestuário. ICMS 18% (SP) e PIS/COFINS não cumulativo (CST 01).",
      regime: "normal",
      cstIcms: "00",
      aliquotaIcms: "18.0000",
      reducaoBaseIcms: "0.0000",
      stRetidoAnteriormente: false,
      cstPis: "01",
      aliqPis: "1.6500",
      cstCofins: "01",
      aliqCofins: "7.6000",
      monofasico: false,
      cstIbsCbs: "000",
      cclasstrib: "000001",
      aliqCbs: "0.9000",
      aliqIbsUf: "0.1000",
      aliqIbsMun: "0.0000",
    },
  },
] as const satisfies readonly PerfilTributarioSeed[];
