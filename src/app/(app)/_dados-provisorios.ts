/**
 * ⚠️ DADOS PROVISÓRIOS — SUBSTITUIR POR getContext().
 *
 * O banco e a autenticação ainda não existem (o modelo de dados aguarda
 * aprovação). Este arquivo é a única fonte de empresa e usuário do shell até a
 * fatia 0.6. Quando `getContext()` existir em `src/server/auth`:
 *   1. o layout `(app)/layout.tsx` passa a ler a sessão (dentro de <Suspense>);
 *   2. as empresas vêm só das que o usuário é membro;
 *   3. a troca de empresa vira server action passada em `aoTrocar`;
 *   4. este arquivo é apagado.
 * Nada aqui é confiável para permissão: o bloqueio de verdade é no servidor.
 */
import type { EmpresaResumo, UsuarioResumo } from "@/components/layout/tipos";

export const EMPRESAS_PROVISORIAS: EmpresaResumo[] = [
  {
    id: "00000000-0000-4000-8000-000000000001",
    nomeFantasia: "Moto Peças Demo",
    razaoSocial: "Moto Peças Demo Ltda",
    cnpj: "11222333000181",
    regime: "simples_nacional",
    logoUrl: null,
    logoNegativoUrl: null,
  },
  {
    id: "00000000-0000-4000-8000-000000000002",
    nomeFantasia: "Moto Peças Demo Distribuidora",
    razaoSocial: "Moto Peças Demo Distribuidora S.A.",
    cnpj: "12ABC34501DE35",
    regime: "lucro_real",
    logoUrl: null,
    logoNegativoUrl: null,
  },
];

export const EMPRESA_ATIVA_ID_PROVISORIA = EMPRESAS_PROVISORIAS[0]!.id;

export const USUARIO_PROVISORIO: UsuarioResumo = {
  nome: "Dono Demonstração",
  email: "dono@demo.local",
  perfil: "dono",
};
