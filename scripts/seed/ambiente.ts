/**
 * Regras de ambiente e variáveis do seed de demonstração (funções puras).
 *
 * O seed só roda em `local` e `homologacao` (seção 8):
 * - `SUMMER_AMBIENTE` precisa ser exatamente `local` ou `homologacao`;
 *   `producao`, vazio ou qualquer outro valor é recusado, sem exceção;
 * - com `NODE_ENV=production` também é recusado, salvo em `homologacao` com
 *   `--forcar-homologacao` (o container de homologação roda com
 *   `NODE_ENV=production`, como o de produção).
 */
import { SENHA_MAXIMO, SENHA_MINIMO } from "../../src/server/auth/usuarios";

export const AMBIENTES_PERMITIDOS = ["local", "homologacao"] as const;

export const REGRA_AMBIENTE = `O seed só roda com SUMMER_AMBIENTE=local ou SUMMER_AMBIENTE=homologacao.
Com NODE_ENV=production ele é recusado, salvo em homologação com --forcar-homologacao.
Em produção (SUMMER_AMBIENTE=producao) ele nunca roda.`;

export function verificarAmbienteSeed(entrada: {
  ambiente: string | undefined;
  nodeEnv: string | undefined;
  forcarHomologacao: boolean;
}): { ok: true } | { ok: false; mensagem: string } {
  const { ambiente, nodeEnv, forcarHomologacao } = entrada;
  if (!(AMBIENTES_PERMITIDOS as readonly string[]).includes(ambiente ?? "")) {
    return {
      ok: false,
      mensagem: `Seed recusado: SUMMER_AMBIENTE=${JSON.stringify(ambiente ?? "")}. ${REGRA_AMBIENTE}`,
    };
  }
  if (nodeEnv === "production" && !(ambiente === "homologacao" && forcarHomologacao)) {
    return {
      ok: false,
      mensagem: `Seed recusado: NODE_ENV=production com SUMMER_AMBIENTE=${ambiente}. ${REGRA_AMBIENTE}`,
    };
  }
  return { ok: true };
}

/** Variáveis das senhas dos usuários de demonstração (os nomes estão em `dados/empresas.ts`). */
export const VARIAVEIS_SENHA = [
  "SEED_SENHA_ADMIN",
  "SEED_SENHA_DONO",
  "SEED_SENHA_BALCAO",
  "SEED_SENHA_ESTOQUE",
  "SEED_SENHA_MECANICO",
] as const;
export type VariavelSenha = (typeof VARIAVEIS_SENHA)[number];

export type ConfiguracaoSeed = {
  senhas: Record<VariavelSenha, string>;
  /** PIN de aprovação do dono, nas duas empresas (6 a 8 números). */
  pinDono: string;
};

/** Lê as senhas e o PIN do ambiente. Os erros citam só o nome da variável, nunca o valor. */
export function lerConfiguracaoSeed(
  env: Record<string, string | undefined>,
): { ok: true; config: ConfiguracaoSeed } | { ok: false; erros: string[] } {
  const erros: string[] = [];
  const senhas = {} as Record<VariavelSenha, string>;
  for (const nome of VARIAVEIS_SENHA) {
    const valor = env[nome] ?? "";
    if (valor === "") erros.push(`${nome} não está definida.`);
    else if (valor.length < SENHA_MINIMO || valor.length > SENHA_MAXIMO) {
      erros.push(`${nome} precisa ter de ${SENHA_MINIMO} a ${SENHA_MAXIMO} caracteres.`);
    }
    senhas[nome] = valor;
  }
  const pinDono = env.SEED_PIN_DONO ?? "";
  if (pinDono === "") erros.push("SEED_PIN_DONO não está definida.");
  else if (!/^\d{6,8}$/.test(pinDono)) erros.push("SEED_PIN_DONO precisa ter de 6 a 8 números.");
  return erros.length > 0 ? { ok: false, erros } : { ok: true, config: { senhas, pinDono } };
}
