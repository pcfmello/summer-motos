/**
 * Tipos que o shell da aplicação recebe por props. Hoje vêm de
 * `src/app/(app)/_dados-provisorios.ts`; depois, de `getContext()`.
 */
export type Perfil = "dono" | "balcao" | "estoque" | "mecanico";

export type RegimeTributario = "simples_nacional" | "lucro_presumido" | "lucro_real";

export type EmpresaResumo = {
  id: string;
  nomeFantasia: string;
  razaoSocial: string;
  /** 14 caracteres sem máscara (pode ser alfanumérico). */
  cnpj: string;
  regime: RegimeTributario;
  /** URL pública do logo (derivada de `empresas.logo`); null = logo padrão do sistema. */
  logoUrl: string | null;
  /** Logo para fundo escuro, se a empresa tiver. Sem ele, o logo vai num bloco branco. */
  logoNegativoUrl: string | null;
};

export type UsuarioResumo = {
  nome: string;
  email: string;
  /** Perfil na empresa ativa. */
  perfil: Perfil;
};

export const ROTULO_PERFIL: Record<Perfil, string> = {
  dono: "Dono",
  balcao: "Balcão",
  estoque: "Estoque",
  mecanico: "Mecânico",
};

export const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};
