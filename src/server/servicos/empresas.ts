/**
 * Nascimento de tenants e empresas e vínculo de membros (fatia 0.10).
 *
 * Usado pela área `/admin` (actions), pelo `scripts/criar-tenant.ts` e pelo
 * seed. Como os outros serviços (D027): recebe o `tx` de quem chama (nunca abre
 * transação própria), sem `server-only` e só com imports relativos, para o
 * script poder ser empacotado em JS puro.
 *
 * O que uma empresa precisa para nascer (`criarEmpresa`):
 * - `config` e `config_fiscal` com o padrão do banco (modelo 11.1 e 11.3; o
 *   padrão está num só lugar, o `DEFAULT` da coluna);
 * - `modulos` explícito: **todos desligados**, salvo os que o chamador pedir
 *   (regra 4.1 e seção 6: em produção, módulo novo nasce desligado). O admin e o
 *   script ligam módulo por escolha explícita; o seed liga todos;
 * - depósitos "Loja" (padrão e vendável) e "Garantia" (não vendável) (D28);
 * - cliente "Consumidor final" (modelo 5.1);
 * - tabela de preço padrão "Balcão" (base `preco_base`, 0%) (D14 do modelo);
 * - as 7 linhas de `sequencias` (modelo 10.1);
 * - auditoria `empresa_criada` e, na primeira empresa do tenant, `tenant_criado`.
 *
 * A auditoria exige `empresa_id` (modelo 10.2): o tenant recém-criado, ainda
 * sem empresa, é auditado junto com a primeira empresa dele. Mudanças de status
 * do tenant são auditadas em cada empresa dele.
 *
 * Convites por link de uso único (D033) ficam em `./convites.ts`.
 *
 * Erros de negócio (nome ou CNPJ repetido, membro repetido...) saem como
 * `ErroPlataforma`, com mensagem em pt-BR e o campo do formulário. A transação
 * de quem chama é desfeita; a action converte o erro em resultado tipado.
 */
import { and, asc, eq, sql } from "drizzle-orm";

import { lerModulos, type Modulo, type Modulos, type Perfil } from "../auth/permissoes";
import type { Transacao } from "../db/conexao";
import {
  CHAVES_SEQUENCIA,
  clientes,
  depositos,
  empresas,
  membros,
  sequencias,
  tabelasPreco,
  tenants,
  usuarios,
} from "../db/schema";
import {
  esquemaNovaEmpresa,
  esquemaNovoTenant,
  textoOuNulo,
  type RegimeTributario,
  type StatusTenant,
} from "../domain/plataforma";
import { registrarAuditoria } from "./auditoria";

/** Quem fez. `null` = o sistema (script de produção, seed). */
export type Autor = { id: string } | null;

export type CodigoErroPlataforma =
  | "tenant_duplicado"
  | "tenant_inexistente"
  | "cnpj_duplicado"
  | "empresa_inexistente"
  | "ja_membro"
  | "admin_nao_pode_ser_membro"
  | "usuario_inexistente"
  | "empresa_com_dono"
  | "convite_pendente"
  | "convite_invalido"
  | "conta_existente"
  | "email_em_uso"
  | "fiscal_sem_ibge";

/** Erro de negócio da plataforma: a mensagem pode ir para a tela; `campo` é o do formulário. */
export class ErroPlataforma extends Error {
  constructor(
    readonly codigo: CodigoErroPlataforma,
    mensagem: string,
    readonly campo?: string,
  ) {
    super(mensagem);
    this.name = "ErroPlataforma";
  }
}

export const MENSAGEM_CNPJ_DUPLICADO = "Já existe uma empresa com este CNPJ no SUMMER. Confira o número.";
export const MENSAGEM_TENANT_DUPLICADO = "Já existe um cliente (tenant) com este nome. Use outro nome.";

/** Módulos de uma empresa nova: todos desligados, menos os pedidos explicitamente. */
export function modulosIniciais(ligar: Partial<Modulos> = {}): Modulos {
  return lerModulos(ligar);
}

/** Nome dos depósitos criados com a empresa (D28 do modelo). */
export const DEPOSITO_LOJA = "Loja";
export const DEPOSITO_GARANTIA = "Garantia";
export const CLIENTE_CONSUMIDOR_FINAL = "Consumidor final";
export const TABELA_PRECO_PADRAO = "Balcão";

/** Constraint violada num erro do `pg` (também dentro do `DrizzleQueryError`). */
function erroDeUnicidade(erro: unknown, constraint: string): boolean {
  let atual: unknown = erro;
  for (let i = 0; i < 5 && atual && typeof atual === "object"; i++) {
    const { code, constraint: nome } = atual as { code?: unknown; constraint?: unknown };
    if (code === "23505" && nome === constraint) return true;
    atual = (atual as { cause?: unknown }).cause;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

/**
 * Serializa a criação de tenants (nome único sem índice no banco): a trava some
 * no fim da transação. Criar tenant é raro; a fila não atrapalha ninguém.
 */
async function travarCriacaoDeTenant(tx: Transacao) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('summer:criar-tenant'))`);
}

/** Nome comparado sem acento, sem caixa e sem espaços nas pontas. */
const nomeNormalizado = (valor: unknown) => sql`public.f_unaccent(lower(btrim(${valor})))`;

export async function tenantComNomeExiste(tx: Transacao, nome: string): Promise<boolean> {
  const [linha] = await tx
    .select({ id: tenants.id })
    .from(tenants)
    .where(sql`${nomeNormalizado(tenants.nome)} = ${nomeNormalizado(nome)}`)
    .limit(1);
  return linha !== undefined;
}

export async function cnpjEmUso(tx: Transacao, cnpj: string): Promise<boolean> {
  const [linha] = await tx.select({ id: empresas.id }).from(empresas).where(eq(empresas.cnpj, cnpj)).limit(1);
  return linha !== undefined;
}

/**
 * Cria o tenant (status `ativo`). Recusa nome repetido (sem acento e sem caixa).
 * Sem auditoria aqui: ela é gravada com a primeira empresa (ver o topo).
 */
export async function criarTenant(tx: Transacao, dados: { nome: string }) {
  const { nome } = esquemaNovoTenant.parse(dados);
  await travarCriacaoDeTenant(tx);
  if (await tenantComNomeExiste(tx, nome)) {
    throw new ErroPlataforma("tenant_duplicado", MENSAGEM_TENANT_DUPLICADO, "nome");
  }
  const [tenant] = await tx
    .insert(tenants)
    .values({ nome })
    .returning({ id: tenants.id, nome: tenants.nome, status: tenants.status, createdAt: tenants.createdAt });
  if (!tenant) throw new Error("Falha ao criar o tenant");
  return tenant;
}

/**
 * Suspende ou reativa o tenant. Suspenso bloqueia o acesso de todos os membros
 * na próxima requisição (`getContext()` confere o status). Auditado em cada
 * empresa do tenant; tenant sem empresa não tem onde auditar.
 */
export async function definirStatusTenant(
  tx: Transacao,
  entrada: { tenantId: string; status: StatusTenant; usuario: Autor },
): Promise<{ alterado: boolean }> {
  const [tenant] = await tx
    .select({ id: tenants.id, nome: tenants.nome, status: tenants.status })
    .from(tenants)
    .where(eq(tenants.id, entrada.tenantId))
    .for("update");
  if (!tenant) throw new ErroPlataforma("tenant_inexistente", "Cliente (tenant) não encontrado.");
  if (tenant.status === entrada.status) return { alterado: false };

  await tx.update(tenants).set({ status: entrada.status }).where(eq(tenants.id, tenant.id));

  const daEmpresa = await tx
    .select({ id: empresas.id })
    .from(empresas)
    .where(eq(empresas.tenantId, tenant.id))
    .orderBy(asc(empresas.id));
  for (const empresa of daEmpresa) {
    await registrarAuditoria(
      tx,
      { empresaId: empresa.id, usuario: entrada.usuario },
      {
        entidade: "tenants",
        entidadeId: tenant.id,
        acao: entrada.status === "suspenso" ? "tenant_suspenso" : "tenant_reativado",
        antes: { status: tenant.status },
        depois: { status: entrada.status },
      },
    );
  }
  return { alterado: true };
}

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

export type DadosNovaEmpresa = {
  tenantId: string;
  razaoSocial: string;
  nomeFantasia?: string | null;
  /** Com ou sem máscara; numérico ou alfanumérico (validado com `validarCnpj`). */
  cnpj: string;
  regimeTributario: RegimeTributario;
  uf?: string | null;
  codigoIbgeMunicipio?: string | null;
  /** Módulos a ligar. Omitido = todos desligados (padrão de produção). */
  modulos?: Partial<Modulos>;
  usuario: Autor;
};

export type EmpresaCriada = {
  empresa: {
    id: string;
    tenantId: string;
    razaoSocial: string;
    nomeFantasia: string | null;
    cnpj: string;
    regimeTributario: RegimeTributario;
    modulos: Modulos;
  };
  depositoLojaId: string;
  depositoGarantiaId: string;
  tabelaPrecoPadraoId: string;
  consumidorFinalId: string;
};

export async function criarEmpresa(tx: Transacao, entrada: DadosNovaEmpresa): Promise<EmpresaCriada> {
  // mesmo esquema do formulário e do script: CNPJ com dígito verificador, UF × IBGE
  const dados = esquemaNovaEmpresa.parse({
    razaoSocial: entrada.razaoSocial,
    nomeFantasia: entrada.nomeFantasia ?? "",
    cnpj: entrada.cnpj,
    regimeTributario: entrada.regimeTributario,
    uf: entrada.uf ?? "",
    codigoIbgeMunicipio: entrada.codigoIbgeMunicipio ?? "",
  });

  // trava o tenant: a decisão "primeira empresa" (auditoria) não corre com outra criação
  const [tenant] = await tx
    .select({ id: tenants.id, nome: tenants.nome, status: tenants.status, createdAt: tenants.createdAt })
    .from(tenants)
    .where(eq(tenants.id, entrada.tenantId))
    .for("update");
  if (!tenant) throw new ErroPlataforma("tenant_inexistente", "Cliente (tenant) não encontrado.");

  if (await cnpjEmUso(tx, dados.cnpj)) {
    throw new ErroPlataforma("cnpj_duplicado", MENSAGEM_CNPJ_DUPLICADO, "cnpj");
  }
  const [{ quantidade }] = await tx
    .select({ quantidade: sql<number>`count(*)::int` })
    .from(empresas)
    .where(eq(empresas.tenantId, tenant.id));

  const modulos = modulosIniciais(entrada.modulos);
  let empresa: EmpresaCriada["empresa"] | undefined;
  try {
    [empresa] = await tx
      .insert(empresas)
      .values({
        tenantId: tenant.id,
        razaoSocial: dados.razaoSocial,
        nomeFantasia: textoOuNulo(dados.nomeFantasia),
        cnpj: dados.cnpj,
        regimeTributario: dados.regimeTributario,
        uf: textoOuNulo(dados.uf),
        codigoIbgeMunicipio: textoOuNulo(dados.codigoIbgeMunicipio),
        modulos,
        // config e config_fiscal: DEFAULT da coluna (modelo 11.1 e 11.3)
      })
      .returning({
        id: empresas.id,
        tenantId: empresas.tenantId,
        razaoSocial: empresas.razaoSocial,
        nomeFantasia: empresas.nomeFantasia,
        cnpj: empresas.cnpj,
        regimeTributario: empresas.regimeTributario,
        modulos: empresas.modulos,
      })
      .then((linhas) => linhas.map((l) => ({ ...l, modulos: lerModulos(l.modulos) })));
  } catch (erro) {
    // corrida com outra criação do mesmo CNPJ entre a conferência e o INSERT
    if (erroDeUnicidade(erro, "empresas_cnpj_key")) {
      throw new ErroPlataforma("cnpj_duplicado", MENSAGEM_CNPJ_DUPLICADO, "cnpj");
    }
    throw erro;
  }
  if (!empresa) throw new Error("Falha ao criar a empresa");
  const empresaId = empresa.id;

  const [loja, garantia] = await tx
    .insert(depositos)
    .values([
      { empresaId, nome: DEPOSITO_LOJA, padrao: true, vendavel: true },
      { empresaId, nome: DEPOSITO_GARANTIA, padrao: false, vendavel: false },
    ])
    .returning({ id: depositos.id });
  const [tabela] = await tx
    .insert(tabelasPreco)
    .values({ empresaId, nome: TABELA_PRECO_PADRAO, base: "preco_base", percentual: "0", padrao: true })
    .returning({ id: tabelasPreco.id });
  const [consumidor] = await tx
    .insert(clientes)
    .values({ empresaId, tipoPessoa: "pf", nome: CLIENTE_CONSUMIDOR_FINAL, consumidorFinalPadrao: true })
    .returning({ id: clientes.id });
  await tx.insert(sequencias).values(CHAVES_SEQUENCIA.map((chave) => ({ empresaId, chave, ultimoValor: 0 })));
  if (!loja || !garantia || !tabela || !consumidor) throw new Error("Falha ao criar os cadastros da empresa");

  const ctxAuditoria = { empresaId, usuario: entrada.usuario };
  if (quantidade === 0) {
    await registrarAuditoria(tx, ctxAuditoria, {
      entidade: "tenants",
      entidadeId: tenant.id,
      acao: "tenant_criado",
      depois: { nome: tenant.nome, status: tenant.status, criado_em: tenant.createdAt },
    });
  }
  await registrarAuditoria(tx, ctxAuditoria, {
    entidade: "empresas",
    entidadeId: empresaId,
    acao: "empresa_criada",
    depois: {
      tenant_id: tenant.id,
      razao_social: empresa.razaoSocial,
      nome_fantasia: empresa.nomeFantasia,
      cnpj: empresa.cnpj,
      regime_tributario: empresa.regimeTributario,
      uf: textoOuNulo(dados.uf),
      codigo_ibge_municipio: textoOuNulo(dados.codigoIbgeMunicipio),
      modulos,
    },
  });

  return {
    empresa,
    depositoLojaId: loja.id,
    depositoGarantiaId: garantia.id,
    tabelaPrecoPadraoId: tabela.id,
    consumidorFinalId: consumidor.id,
  };
}

/**
 * Liga ou desliga um módulo da empresa, com auditoria `modulos_alterados`.
 * Ligar o fiscal exige o código IBGE do município (modelo 2.2).
 */
export async function alterarModulo(
  tx: Transacao,
  entrada: { empresaId: string; modulo: Modulo; ligado: boolean; usuario: Autor },
): Promise<Modulos> {
  const [empresa] = await tx
    .select({ id: empresas.id, modulos: empresas.modulos, ibge: empresas.codigoIbgeMunicipio })
    .from(empresas)
    .where(eq(empresas.id, entrada.empresaId))
    .for("update");
  if (!empresa) throw new ErroPlataforma("empresa_inexistente", "Empresa não encontrada.");

  const antes = lerModulos(empresa.modulos);
  if (antes[entrada.modulo] === entrada.ligado) return antes;
  if (entrada.modulo === "fiscal" && entrada.ligado && !empresa.ibge) {
    throw new ErroPlataforma(
      "fiscal_sem_ibge",
      "Para ligar o fiscal, a empresa precisa do código IBGE do município. Cadastre-o antes de ligar.",
    );
  }

  const depois: Modulos = { ...antes, [entrada.modulo]: entrada.ligado };
  await tx.update(empresas).set({ modulos: depois }).where(eq(empresas.id, empresa.id));
  await registrarAuditoria(
    tx,
    { empresaId: empresa.id, usuario: entrada.usuario },
    { entidade: "empresas", entidadeId: empresa.id, acao: "modulos_alterados", antes, depois },
  );
  return depois;
}

// ---------------------------------------------------------------------------
// Membros (o convite por link fica em `./convites.ts`, D033)
// ---------------------------------------------------------------------------

/** Mensagem genérica para vínculo recusado (não revela o tipo da conta). */
export const MENSAGEM_VINCULO_RECUSADO = "Não foi possível vincular este e-mail a esta empresa. Use outro e-mail.";

/** Colunas do PIN zeradas na reativação do membro. */
export const PIN_ZERADO = { pinHash: null, pinFalhas: 0, pinBloqueadoAte: null, pinBloqueios: 0 } as const;

export type ResultadoMembro = { membroId: string; situacao: "criado" | "reativado" };

/**
 * Vincula o usuário à empresa com o perfil dado (auditoria `membro_criado`).
 * - Admin da plataforma não vira membro: ele acessa só o `/admin` (seção 3).
 *   A mensagem é genérica: não diz que a conta é de um admin.
 * - Membro ativo repetido: `ja_membro`. Membro desativado: reativado com o
 *   perfil novo (auditoria `membro_alterado`) e com o PIN **zerado** (hash,
 *   falhas e bloqueios): quem volta define um PIN novo.
 */
export async function adicionarMembro(
  tx: Transacao,
  entrada: { empresaId: string; usuarioId: string; perfil: Perfil; usuario: Autor },
): Promise<ResultadoMembro> {
  const [usuario] = await tx
    .select({ id: usuarios.id, admin: usuarios.adminPlataforma })
    .from(usuarios)
    .where(eq(usuarios.id, entrada.usuarioId));
  if (!usuario) throw new ErroPlataforma("usuario_inexistente", "Usuário não encontrado.");
  if (usuario.admin) {
    throw new ErroPlataforma(
      "admin_nao_pode_ser_membro",
      MENSAGEM_VINCULO_RECUSADO,
      "email",
    );
  }
  const ctxAuditoria = { empresaId: entrada.empresaId, usuario: entrada.usuario };

  const [novo] = await tx
    .insert(membros)
    .values({ empresaId: entrada.empresaId, usuarioId: usuario.id, perfil: entrada.perfil })
    .onConflictDoNothing({ target: [membros.empresaId, membros.usuarioId] })
    .returning({ id: membros.id });
  if (novo) {
    await registrarAuditoria(tx, ctxAuditoria, {
      entidade: "membros",
      entidadeId: novo.id,
      acao: "membro_criado",
      depois: { usuario_id: usuario.id, perfil: entrada.perfil, ativo: true },
    });
    return { membroId: novo.id, situacao: "criado" };
  }

  const [existente] = await tx
    .select({ id: membros.id, perfil: membros.perfil, ativo: membros.ativo })
    .from(membros)
    .where(and(eq(membros.empresaId, entrada.empresaId), eq(membros.usuarioId, usuario.id)))
    .for("update");
  if (!existente) throw new Error("Membro não encontrado depois do conflito");
  if (existente.ativo) {
    throw new ErroPlataforma("ja_membro", "Esta pessoa já é membro desta empresa.", "email");
  }
  await tx
    .update(membros)
    .set({ ativo: true, perfil: entrada.perfil, ...PIN_ZERADO })
    .where(and(eq(membros.id, existente.id), eq(membros.empresaId, entrada.empresaId)));
  await registrarAuditoria(tx, ctxAuditoria, {
    entidade: "membros",
    entidadeId: existente.id,
    acao: "membro_alterado",
    antes: { perfil: existente.perfil, ativo: false },
    depois: { perfil: entrada.perfil, ativo: true },
  });
  return { membroId: existente.id, situacao: "reativado" };
}
