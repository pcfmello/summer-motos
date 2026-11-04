/**
 * Matriz de permissões por perfil (seção 3 da especificação) e módulos por
 * empresa (regra 4.1, modelo 11.2).
 *
 * Arquivo puro: sem banco, sem `server-only`. É importado pelo servidor
 * (actions, queries, páginas) e pelo menu lateral, que só esconde o que o
 * perfil não pode usar. **A permissão de verdade é sempre conferida no
 * servidor**, em toda action e query, com `exigirPermissao`/`verificarAcesso`
 * sobre o perfil lido do banco por `getContext()`.
 *
 * Onde a seção 3 não diz nada, a capacidade ficou com o perfil mais restrito
 * (só o dono). Essas escolhas estão marcadas com "conservador" e listadas no
 * relatório da fatia 0.6.
 */

export const PERFIS = ["dono", "balcao", "estoque", "mecanico"] as const;
export type Perfil = (typeof PERFIS)[number];

/** Chaves de `empresas.modulos` (modelo 11.2). Padrão: todas desligadas. */
export const MODULOS = ["balcao", "os", "fiscal", "mercado_livre", "ecommerce", "estoque"] as const;
export type Modulo = (typeof MODULOS)[number];
export type Modulos = Record<Modulo, boolean>;

const DONO = ["dono"] as const satisfies readonly Perfil[];
const TODOS = PERFIS;

/**
 * Capacidade → perfis que a têm. O dono tem todas (seção 3: "Tudo").
 * Acrescentar uma capacidade aqui é o único jeito de liberar algo a um perfil.
 */
const MATRIZ = {
  // Catálogo
  "produtos.consultar": ["dono", "balcao", "estoque"],
  /**
   * Buscar peça para lançar num documento (orçamento, venda, OS), com preço e
   * disponível. A query desta capacidade **nunca** devolve custo nem margem:
   * custo só com `custo.ver`.
   */
  "produtos.buscar_para_documento": ["dono", "balcao", "mecanico"],
  "produtos.gerir": ["dono", "estoque"],
  /** Regra 4.7: o código só muda pelo dono, com auditoria. */
  "produtos.alterar_codigo": DONO,
  /**
   * Preço de venda, preço em tabela e **markup** (do produto e da categoria):
   * markup decide o preço sugerido, então conta como preço (regra 4.9).
   * Conservador: a seção 3 não diz se o estoque altera preço (a confirmar com o
   * diretor). Quem tem `produtos.gerir` ou `catalogo.gerir` sem esta capacidade
   * edita o cadastro, mas não preço nem markup.
   */
  "precos.alterar": DONO,
  /** Categorias e marcas de peças (o markup padrão da categoria exige `precos.alterar`). */
  "catalogo.gerir": ["dono", "estoque"],
  /** Perfis tributários, tabelas de preço, serviços, mecânicos e vendedores. Conservador. */
  "cadastros.gerir": DONO,
  "pecas_por_moto.consultar": TODOS,
  "etiquetas.imprimir": ["dono", "estoque"],

  // Custo e margem: nunca para balcão e mecânico (seção 3)
  "custo.ver": ["dono", "estoque"],
  "margem.ver": ["dono", "estoque"],

  // Estoque
  "estoque.consultar": ["dono", "balcao", "estoque"],
  "estoque.entrada": ["dono", "estoque"],
  "estoque.ajustar": ["dono", "estoque"],
  "inventario.gerir": ["dono", "estoque"],

  // Pessoas
  "clientes.gerir": ["dono", "balcao"],
  "fornecedores.gerir": ["dono", "estoque"],

  // Vendas e orçamentos
  "vendas.criar": ["dono", "balcao"],
  "vendas.consultar": ["dono", "balcao"],
  "vendas.cancelar": DONO,
  "orcamentos.gerir": ["dono", "balcao"],
  /** Desconto acima do limite: autorizado pelo PIN de um dono (regra 3). */
  "desconto.autorizar": DONO,
  /** Conservador: devolução de cliente devolve dinheiro (D018). */
  "devolucoes.cliente": DONO,
  "devolucoes.fornecedor": ["dono", "estoque"],

  // OS
  "os.abrir": ["dono", "balcao"],
  /** Todas as OS da empresa. O mecânico só vê as dele (`os.ver_proprias`, D018-P9). */
  "os.ver_todas": ["dono", "balcao"],
  "os.ver_proprias": ["dono", "mecanico"],
  "os.mudar_status": ["dono", "mecanico"],
  "os.lancar_itens": ["dono", "balcao", "mecanico"],
  /**
   * Informar ou mudar `comissao_valor` de um serviço da OS, inclusive no serviço
   * lançado à mão (sem `servico_id`). Só o dono (regra 4.13). O serviço manual
   * lançado por outro perfil fica com a comissão "a definir pelo dono"; ver
   * `comissaoDoServicoLancado` em `./os-regras.ts`. O valor enviado por quem
   * não é dono é sempre ignorado.
   */
  "os.definir_comissao_servico_manual": DONO,
  /** Entrega: registra o pagamento e baixa as peças, como uma venda. */
  "os.entregar": ["dono", "balcao"],
  /** Conservador: cancelar libera reservas e encerra o documento. */
  "os.cancelar": DONO,

  // Comissões (regra 4.13 e D018)
  "comissao.editar": DONO,
  "comissoes.acertar": DONO,
  /** "Meus ganhos": cada um vê só os dados dele (filtro por usuário na query). */
  "ganhos.ver_proprios": TODOS,

  // Gestão
  "relatorios.ver": DONO,
  "auditoria.ver": DONO,
  "configuracoes.gerir": DONO,
  "canais.configurar": DONO,
  /** Cancelamento, carta de correção e inutilização. */
  "fiscal.gerir": DONO,
} as const satisfies Record<string, readonly Perfil[]>;

export type Capacidade = keyof typeof MATRIZ;
export const CAPACIDADES = Object.keys(MATRIZ) as Capacidade[];

/** Perfis que recebem custo e margem (seção 3). Balcão e mecânico, nunca. */
export const PERFIS_VEEM_CUSTO: readonly Perfil[] = MATRIZ["custo.ver"];

export function pode(perfil: Perfil, capacidade: Capacidade): boolean {
  const perfis: readonly Perfil[] = MATRIZ[capacidade];
  return perfis.includes(perfil);
}

/** Atalho para as queries decidirem se selecionam as colunas de custo e margem. */
export function veCusto(perfil: Perfil): boolean {
  return pode(perfil, "custo.ver");
}

/** Lê `empresas.modulos` com o padrão do modelo (11.2): chave ausente ou inválida = desligada. */
export function lerModulos(valor: unknown): Modulos {
  const origem = valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
  const modulos = {} as Modulos;
  for (const modulo of MODULOS) modulos[modulo] = origem[modulo] === true;
  return modulos;
}

export function moduloLigado(modulos: Modulos, modulo: Modulo): boolean {
  return modulos[modulo] === true;
}

// ---------------------------------------------------------------------------
// Checagens para actions, queries e páginas
// ---------------------------------------------------------------------------

/** O mínimo do contexto que as checagens usam (ver `Contexto` em `./contexto-nucleo`). */
export type ContextoAcesso = { perfil: Perfil; modulos: Modulos };

export const MENSAGEM_SEM_PERMISSAO = "O seu perfil nesta empresa não permite esta ação.";
export const MENSAGEM_MODULO_DESLIGADO = "Este recurso não está ligado para esta empresa.";

export const MENSAGEM_REGISTRO_INACESSIVEL = "Registro não encontrado.";

const MENSAGENS_ACESSO = {
  perfil: MENSAGEM_SEM_PERMISSAO,
  modulo: MENSAGEM_MODULO_DESLIGADO,
  registro: MENSAGEM_REGISTRO_INACESSIVEL,
} as const;

/**
 * Acesso negado. `registro`: o registro não existe na empresa ativa **ou** o
 * perfil não pode vê-lo (mesma mensagem, para não revelar que ele existe).
 */
export class ErroAcessoNegado extends Error {
  constructor(
    readonly motivo: "perfil" | "modulo" | "registro",
    readonly detalhe: string,
  ) {
    super(MENSAGENS_ACESSO[motivo]);
    this.name = "ErroAcessoNegado";
  }
}

/** Lança `ErroAcessoNegado` se o perfil não tiver a capacidade. Para queries e páginas. */
export function exigirPermissao(ctx: ContextoAcesso, capacidade: Capacidade): void {
  if (!pode(ctx.perfil, capacidade)) throw new ErroAcessoNegado("perfil", capacidade);
}

/** Lança `ErroAcessoNegado` se o módulo estiver desligado na empresa ativa. */
export function exigirModulo(ctx: ContextoAcesso, modulo: Modulo): void {
  if (!moduloLigado(ctx.modulos, modulo)) throw new ErroAcessoNegado("modulo", modulo);
}

/**
 * Para server actions, que devolvem resultado tipado em vez de lançar erro de
 * negócio: `null` se pode; senão a mensagem para o usuário.
 */
export function verificarAcesso(
  ctx: ContextoAcesso,
  exigencias: { capacidade?: Capacidade; modulo?: Modulo },
): string | null {
  if (exigencias.modulo && !moduloLigado(ctx.modulos, exigencias.modulo)) return MENSAGEM_MODULO_DESLIGADO;
  if (exigencias.capacidade && !pode(ctx.perfil, exigencias.capacidade)) return MENSAGEM_SEM_PERMISSAO;
  return null;
}
