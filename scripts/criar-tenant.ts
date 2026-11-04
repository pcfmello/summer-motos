/**
 * Cria tenant, empresas e o convite do dono em produção (seção 7, Entrega 0):
 * `pnpm tenant:criar`. Também convida o primeiro admin da plataforma
 * (`--admin-plataforma`).
 *
 * Não interativo. Três formas:
 *
 *   pnpm tenant:criar --arquivo tenant.json
 *   pnpm tenant:criar --tenant "Moto Peças X" --razao-social "Moto Peças X Ltda" \
 *     --cnpj 11.222.333/0001-81 --regime simples_nacional [--nome-fantasia "..."] \
 *     [--uf SP] [--ibge 3550308] [--modulos balcao,os] --dono-email ana@x.com
 *   pnpm tenant:criar --admin-plataforma admin@x.com
 *
 * Arquivo JSON (várias empresas, um dono para todas):
 *   { "tenant": "Moto Peças X",
 *     "empresas": [{ "razaoSocial": "...", "nomeFantasia": "...", "cnpj": "...",
 *                    "regimeTributario": "lucro_real", "uf": "SP",
 *                    "codigoIbgeMunicipio": "3550308", "modulos": [] }],
 *     "dono": { "email": "..." } }
 *
 * Regras:
 * - tudo numa transação só, pelos mesmos serviços do `/admin`
 *   (`src/server/servicos/empresas.ts` e `convites.ts`): ou cria tudo, ou nada;
 * - recusa se já existir tenant com o mesmo nome (sem acento e sem caixa) ou
 *   qualquer um dos CNPJs;
 * - módulos nascem desligados, salvo os pedidos em `modulos`/`--modulos`;
 * - **nenhuma senha é criada nem impressa** (D033): o dono recebe um link de
 *   convite de uso único por empresa, válido por 7 dias, impresso **uma vez**
 *   no fim. Quem abre o link define a própria senha ou, se já tiver conta,
 *   entra e aceita;
 * - `--admin-plataforma` cria um convite de admin da plataforma (sem empresa,
 *   tipo `admin_plataforma`): o link cria a conta de admin com a senha que a
 *   pessoa escolher. Recusa e-mail que já tem conta;
 * - a auditoria registra o sistema como autor (`usuario_id` nulo).
 *
 * Variáveis: `DATABASE_URL` (o usuário do app basta: não há DDL) e
 * `BETTER_AUTH_URL` (base do link). No container de produção roda empacotado:
 * `node dist/criar-tenant.mjs ...` (`pnpm build:scripts`).
 * Imports só relativos e de pacotes (D020).
 */
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import type { Modulos } from "../src/server/auth/permissoes";
import { codigoErroPg, criarBanco, criarPool, criarWithTransaction } from "../src/server/db/conexao";
import { esquemaConviteDono, validarPlanoTenant, type PlanoTenant } from "../src/server/domain/plataforma";
import {
  VALIDADE_CONVITE_DIAS,
  convidarDono,
  criarConviteAdminPlataforma,
  linkDoConvite,
} from "../src/server/servicos/convites";
import {
  ErroPlataforma,
  MENSAGEM_CNPJ_DUPLICADO,
  MENSAGEM_TENANT_DUPLICADO,
  cnpjEmUso,
  criarEmpresa,
  criarTenant,
  tenantComNomeExiste,
} from "../src/server/servicos/empresas";
import { carregarEnvLocal } from "./_ambiente";

const AJUDA = `Uso:
  pnpm tenant:criar --arquivo tenant.json
  pnpm tenant:criar --tenant "Nome" --razao-social "Razão" --cnpj 00000000000000 --regime simples_nacional|lucro_presumido|lucro_real
                    [--nome-fantasia "Fantasia"] [--uf SP] [--ibge 3550308] [--modulos balcao,os]
                    --dono-email email@exemplo.com
  pnpm tenant:criar --admin-plataforma email@exemplo.com

Imprime o link de convite (uso único, ${VALIDADE_CONVITE_DIAS} dias). Nenhuma senha é criada.
Módulos: balcao, os, fiscal, mercado_livre, ecommerce, estoque (padrão: todos desligados).`;

class ErroUso extends Error {}

function lerArgumentos(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    strict: true,
    allowPositionals: false,
    options: {
      ajuda: { type: "boolean", short: "h" },
      arquivo: { type: "string" },
      tenant: { type: "string" },
      "razao-social": { type: "string" },
      "nome-fantasia": { type: "string" },
      cnpj: { type: "string" },
      regime: { type: "string" },
      uf: { type: "string" },
      ibge: { type: "string" },
      modulos: { type: "string" },
      "dono-email": { type: "string" },
      "admin-plataforma": { type: "string" },
    },
  });
  return values;
}

type Argumentos = ReturnType<typeof lerArgumentos>;
type WithTransaction = ReturnType<typeof criarWithTransaction>;

/** Monta o plano a partir do JSON ou dos argumentos e valida com os esquemas do `/admin`. */
function montarPlano(args: Argumentos): PlanoTenant {
  let bruto: unknown;
  if (args.arquivo) {
    const avulsos = ["tenant", "razao-social", "cnpj", "regime", "dono-email"] as const;
    if (avulsos.some((chave) => args[chave] !== undefined)) {
      throw new ErroUso("Use --arquivo OU os argumentos avulsos, não os dois.");
    }
    try {
      bruto = JSON.parse(readFileSync(args.arquivo, "utf8"));
    } catch (erro) {
      throw new ErroUso(`Não foi possível ler o JSON de ${args.arquivo}: ${erro instanceof Error ? erro.message : erro}`);
    }
  } else {
    bruto = {
      tenant: args.tenant ?? "",
      empresas: [
        {
          razaoSocial: args["razao-social"] ?? "",
          nomeFantasia: args["nome-fantasia"] ?? "",
          cnpj: args.cnpj ?? "",
          regimeTributario: args.regime ?? "",
          uf: args.uf ?? "",
          codigoIbgeMunicipio: args.ibge ?? "",
          modulos: (args.modulos ?? "")
            .split(",")
            .map((m) => m.trim())
            .filter(Boolean),
        },
      ],
      dono: { email: args["dono-email"] ?? "" },
    };
  }
  const resultado = validarPlanoTenant(bruto);
  if (!resultado.ok) throw new ErroUso(`Dados inválidos:\n  - ${resultado.erros.join("\n  - ")}`);
  return resultado.plano;
}

function modulosLigados(lista: readonly string[]): Partial<Modulos> {
  return Object.fromEntries(lista.map((m) => [m, true]));
}

function lerUrlBase(): string {
  const url = process.env.BETTER_AUTH_URL;
  if (!url) throw new ErroUso("BETTER_AUTH_URL não está definida (é a base do link do convite).");
  try {
    new URL(url);
  } catch {
    throw new ErroUso("BETTER_AUTH_URL não é uma URL válida.");
  }
  return url;
}

async function criarTudo(withTransaction: WithTransaction, plano: PlanoTenant) {
  return withTransaction(async (tx) => {
    // confere tudo antes, para listar todos os conflitos de uma vez
    const conflitos: string[] = [];
    if (await tenantComNomeExiste(tx, plano.tenant.nome)) {
      conflitos.push(`tenant "${plano.tenant.nome}": ${MENSAGEM_TENANT_DUPLICADO}`);
    }
    for (const empresa of plano.empresas) {
      if (await cnpjEmUso(tx, empresa.cnpj)) conflitos.push(`CNPJ ${empresa.cnpj}: ${MENSAGEM_CNPJ_DUPLICADO}`);
    }
    if (conflitos.length > 0) throw new ErroUso(`Nada foi criado:\n  - ${conflitos.join("\n  - ")}`);

    // daqui em diante, criarTenant/criarEmpresa travam e conferem de novo (corrida)
    const tenant = await criarTenant(tx, plano.tenant);
    const criadas = [];
    for (const dados of plano.empresas) {
      const { modulos, ...empresa } = dados;
      const criada = await criarEmpresa(tx, {
        ...empresa,
        tenantId: tenant.id,
        modulos: modulosLigados(modulos),
        usuario: null,
      });
      const convite = await convidarDono(tx, { empresaId: criada.empresa.id, email: plano.dono.email, usuario: null });
      criadas.push({ ...criada.empresa, token: convite.token, expiraEm: convite.expiraEm });
    }
    return { tenant, empresas: criadas };
  });
}

async function convidarAdmin(withTransaction: WithTransaction, email: string | undefined) {
  const entrada = esquemaConviteDono.safeParse({ email });
  if (!entrada.success) {
    throw new ErroUso(`Dados inválidos:\n  - ${entrada.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n  - ")}`);
  }
  return withTransaction((tx) => criarConviteAdminPlataforma(tx, { email: entrada.data.email, usuario: null }));
}

function imprimirLink(rotulo: string, email: string, link: string, expiraEm: Date) {
  console.log("");
  console.log(`  ${rotulo} (aparece só agora; copie e envie por um canal seguro):`);
  console.log(`    para:   ${email}`);
  console.log(`    link:   ${link}`);
  console.log(`    vale até ${expiraEm.toISOString()} e só pode ser usado uma vez.`);
  console.log("");
}

async function main(): Promise<number> {
  carregarEnvLocal();
  let args: Argumentos;
  try {
    args = lerArgumentos(process.argv.slice(2));
  } catch (erro) {
    throw new ErroUso(`${erro instanceof Error ? erro.message : String(erro)}\n\n${AJUDA}`);
  }
  if (args.ajuda || process.argv.length <= 2) {
    console.log(AJUDA);
    return args.ajuda ? 0 : 1;
  }
  if (args["admin-plataforma"] !== undefined && (args.arquivo || args.tenant)) {
    throw new ErroUso("--admin-plataforma não se mistura com a criação de tenant: rode duas vezes.");
  }

  const urlBase = lerUrlBase();
  const url = process.env.DATABASE_URL;
  if (!url) throw new ErroUso("DATABASE_URL não está definida.");
  const plano = args["admin-plataforma"] === undefined ? montarPlano(args) : null;

  const pool = criarPool({ connectionString: url, applicationName: "summer-criar-tenant" });
  const withTransaction = criarWithTransaction(criarBanco(pool));
  try {
    if (!plano) {
      const convite = await convidarAdmin(withTransaction, args["admin-plataforma"]);
      const email = args["admin-plataforma"]!.trim().toLowerCase();
      console.log(`[criar-tenant] convite de admin da plataforma criado para ${email}`);
      imprimirLink("Link para criar a conta de admin", email, linkDoConvite(urlBase, convite.token), convite.expiraEm);
      return 0;
    }

    const resultado = await criarTudo(withTransaction, plano);
    console.log(`[criar-tenant] tenant criado: ${resultado.tenant.nome} (${resultado.tenant.id})`);
    for (const empresa of resultado.empresas) {
      const ligados = Object.entries(empresa.modulos)
        .filter(([, ligado]) => ligado)
        .map(([modulo]) => modulo);
      const nome = empresa.nomeFantasia ?? empresa.razaoSocial;
      console.log(
        `[criar-tenant] empresa: ${nome} — CNPJ ${empresa.cnpj} (${empresa.id}); ` +
          `módulos ligados: ${ligados.length ? ligados.join(", ") : "nenhum"}`,
      );
      imprimirLink(`Convite de dono para ${nome}`, plano.dono.email, linkDoConvite(urlBase, empresa.token), empresa.expiraEm);
    }
    if (resultado.empresas.length > 1) {
      console.log("[criar-tenant] um link por empresa: o primeiro cria a conta; nos demais, o dono entra e aceita.");
    }
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    if (erro instanceof ErroUso || erro instanceof ErroPlataforma) {
      console.error(`[criar-tenant] ${erro.message}`);
    } else {
      // só o tipo e o SQLSTATE: a mensagem do Drizzle traz os parâmetros da query
      const codigo = codigoErroPg(erro);
      console.error(
        `[criar-tenant] FALHOU (${erro instanceof Error ? erro.name : "erro"}${codigo ? `, ${codigo}` : ""}). ` +
          "O resultado é incerto: confira no /admin (ou no banco) o que foi criado antes de repetir.",
      );
    }
    process.exit(1);
  },
);
