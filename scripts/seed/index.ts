/**
 * Seed de demonstração (seção 8): `pnpm db:seed`.
 *
 * Cria o tenant "Moto Peças Demo" com 2 empresas (Simples Nacional e Lucro Real),
 * os usuários de demonstração, o catálogo, os cadastros, os canais e o estoque
 * inicial (pelo caminho oficial, `lancarSaldoInicial`). Idempotente: rodar de
 * novo não duplica nada nem muda saldos (ver `./executar.ts`).
 *
 * Só em local e homologação (`./ambiente.ts`). Senhas e PIN vêm das variáveis
 * `SEED_SENHA_*` e `SEED_PIN_DONO`; nada disso é impresso.
 *
 * URL: `DATABASE_URL` (sem DDL; o usuário do app basta). Rode `pnpm db:migrate` antes.
 * Imports só relativos e de pacotes (D020).
 */
import { parseArgs } from "node:util";

import { codigoErroPg, criarBanco, criarPool, criarWithTransaction } from "../../src/server/db/conexao";
import { ErroEstoque } from "../../src/server/domain/estoque";
import { ErroPlataforma } from "../../src/server/servicos/empresas";
import { carregarEnvLocal } from "../_ambiente";
import { REGRA_AMBIENTE, VARIAVEIS_SENHA, lerConfiguracaoSeed, verificarAmbienteSeed } from "./ambiente";
import { executarSeed, type ResumoSeed } from "./executar";

const AJUDA = `Uso: pnpm db:seed [--forcar-homologacao]

Cria (ou completa) os dados de demonstração: tenant "Moto Peças Demo", 2 empresas,
usuários, catálogo, cadastros, canais e estoque inicial. Pode rodar várias vezes:
o que já existe não é duplicado nem alterado.

${REGRA_AMBIENTE}

Variáveis obrigatórias:
  DATABASE_URL           banco onde gravar (rode pnpm db:migrate antes)
  SUMMER_AMBIENTE        local ou homologacao
  ${VARIAVEIS_SENHA.join(", ")}
                         senhas dos usuários de demonstração (10 a 128 caracteres)
  SEED_PIN_DONO          PIN de aprovação do dono (6 a 8 números)`;

const log = (mensagem: string) => console.log(`[seed] ${mensagem}`);

function imprimirResumo(resumo: ResumoSeed) {
  log("");
  log(`Resumo — tenant "${resumo.tenant.nome}"`);
  for (const e of resumo.empresas) {
    const c = e.contagens;
    log(`  ${e.nome} (CNPJ ${e.cnpj}) — ${e.criada ? "criada agora" : "já existia"}`);
    log(
      `    produtos ${c.produtos}, códigos de barras ${c.codigos_barras}, aplicações ${c.aplicacoes}, ` +
        `categorias ${c.categorias}, marcas ${c.marcas}, perfis tributários ${c.perfis_tributarios}`,
    );
    log(
      `    tabelas de preço ${c.tabelas_preco}, serviços ${c.servicos}, mecânicos ${c.mecanicos}, ` +
        `vendedores ${c.vendedores}, clientes ${c.clientes}, motos ${c.motos}`,
    );
    log(
      `    canais ${c.canais}, anúncios ${c.anuncios}, saldos ${c.saldos} (abaixo do mínimo: ${c.abaixo_do_minimo}), ` +
        `movimentos ${c.movimentos} (lançados agora: ${e.saldosLancados}), membros ${c.membros}`,
    );
  }
  log("");
  log("Logins de demonstração (senhas nas variáveis SEED_SENHA_*; PIN do dono em SEED_PIN_DONO):");
  for (const l of resumo.logins) log(`  ${l.email.padEnd(28)} ${l.perfis}`);
}

async function main(): Promise<number> {
  carregarEnvLocal();
  const { values } = parseArgs({
    args: process.argv.slice(2),
    strict: true,
    allowPositionals: false,
    options: {
      ajuda: { type: "boolean", short: "h" },
      "forcar-homologacao": { type: "boolean" },
    },
  });
  if (values.ajuda) {
    console.log(AJUDA);
    return 0;
  }

  const ambiente = verificarAmbienteSeed({
    ambiente: process.env.SUMMER_AMBIENTE,
    nodeEnv: process.env.NODE_ENV,
    forcarHomologacao: values["forcar-homologacao"] === true,
  });
  if (!ambiente.ok) {
    console.error(`[seed] ${ambiente.mensagem}`);
    return 2;
  }
  const leitura = lerConfiguracaoSeed(process.env);
  if (!leitura.ok) {
    console.error(`[seed] Variáveis do seed com problema (veja o .env.example):\n  - ${leitura.erros.join("\n  - ")}`);
    return 1;
  }
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("[seed] DATABASE_URL não está definida.");
    return 1;
  }

  const pool = criarPool({ connectionString: url, applicationName: "summer-seed" });
  try {
    const db = criarBanco(pool);
    const inicio = Date.now();
    log(`ambiente: ${process.env.SUMMER_AMBIENTE}`);
    const resumo = await executarSeed({ withTransaction: criarWithTransaction(db) }, leitura.config, log);
    imprimirResumo(resumo);
    log("");
    log(`concluído em ${Date.now() - inicio} ms`);
    return 0;
  } finally {
    await pool.end();
  }
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    if (erro instanceof ErroPlataforma || erro instanceof ErroEstoque) {
      console.error(`[seed] ${erro.message}`);
    } else if (erro instanceof Error && codigoErroPg(erro) === undefined) {
      console.error(`[seed] FALHOU: ${erro.message}`);
    } else {
      // só o tipo e o SQLSTATE: a mensagem do Drizzle traz os parâmetros (hash de senha)
      const codigo = codigoErroPg(erro);
      console.error(`[seed] FALHOU (${erro instanceof Error ? erro.name : "erro"}${codigo ? `, ${codigo}` : ""}).`);
    }
    console.error("[seed] A empresa que estava sendo gravada foi desfeita; rode de novo depois de corrigir.");
    process.exit(1);
  },
);
