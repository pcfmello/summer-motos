/**
 * Aplicação e status das migrações (D010, D020), usado por `scripts/migrate.ts`,
 * `scripts/db-status.ts` e pelos testes de integração.
 *
 * Como o migrador do drizzle-orm 0.45 funciona (conferido no código instalado):
 * - lê `meta/_journal.json` e os `<tag>.sql`, quebrando em `--> statement-breakpoint`;
 * - grava em `drizzle.__drizzle_migrations` (id, hash sha256 do arquivo, created_at =
 *   `when` do journal);
 * - aplica as entradas cujo `when` é maior que o `created_at` da última aplicada,
 *   **todas numa única transação** (falhou uma, nada é aplicado).
 *
 * Por isso este módulo confere, antes de aplicar:
 * - migração com `when` antigo que nunca foi aplicada ("ignorada"): o Drizzle a
 *   pularia em silêncio;
 * - migração aplicada cujo arquivo mudou ("alterada"): proibido editar migração aplicada.
 * Migrações aplicadas que não existem nos arquivos ("desconhecidas") só geram
 * aviso: é o caso da versão anterior do app subindo sobre o banco novo (rollback).
 *
 * Sem `server-only` e sem alias `@/`: o arquivo é empacotado em JS puro junto
 * com o script de migração (D020).
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

/** Pasta das migrações, relativa à raiz do projeto (ou ao WORKDIR do container). */
export const PASTA_MIGRACOES_PADRAO = "src/server/db/migrations";
export const SCHEMA_CONTROLE = "drizzle";
export const TABELA_CONTROLE = "__drizzle_migrations";

/**
 * Chave do advisory lock das migrações: os bytes ASCII de "SUMMER"
 * (0x53554D4D4552 = 91625834235218). Fixa e documentada na D023: qualquer
 * processo que aplique migrações usa a mesma chave.
 */
export const CHAVE_LOCK_MIGRACOES = "91625834235218";

export type MigracaoArquivo = {
  tag: string;
  /** `when` do journal (ms). É o que o Drizzle grava em `created_at`. */
  quando: number;
  hash: string;
};

export type MigracaoAplicada = { hash: string; quando: number };

export type StatusMigracoes = {
  aplicadas: MigracaoArquivo[];
  pendentes: MigracaoArquivo[];
  /** `when` anterior à última aplicada, mas nunca aplicada: o Drizzle pularia. */
  ignoradas: MigracaoArquivo[];
  /** Aplicada, mas o arquivo mudou depois. */
  alteradas: MigracaoArquivo[];
  /** No banco, sem arquivo correspondente (banco à frente do código). */
  desconhecidas: MigracaoAplicada[];
};

type Journal = { entries: { tag: string; when: number }[] };

export function lerMigracoesArquivo(pasta: string): MigracaoArquivo[] {
  const caminhoJournal = path.join(pasta, "meta", "_journal.json");
  if (!existsSync(caminhoJournal)) {
    throw new Error(`journal não encontrado: ${caminhoJournal}`);
  }
  const journal = JSON.parse(readFileSync(caminhoJournal, "utf8")) as Journal;
  return journal.entries.map((e) => {
    const sql = readFileSync(path.join(pasta, `${e.tag}.sql`)).toString();
    // mesmo hash que o readMigrationFiles do drizzle-orm
    return { tag: e.tag, quando: e.when, hash: createHash("sha256").update(sql).digest("hex") };
  });
}

/** Lê a tabela de controle. Sem a tabela (banco vazio), devolve lista vazia. */
export async function lerMigracoesAplicadas(cliente: Client): Promise<MigracaoAplicada[]> {
  const existe = await cliente.query<{ existe: boolean }>(
    "select to_regclass($1) is not null as existe",
    [`${SCHEMA_CONTROLE}.${TABELA_CONTROLE}`],
  );
  if (!existe.rows[0]?.existe) return [];
  const r = await cliente.query<{ hash: string; created_at: string }>(
    `select hash, created_at from "${SCHEMA_CONTROLE}"."${TABELA_CONTROLE}" order by created_at, id`,
  );
  return r.rows.map((l) => ({ hash: l.hash, quando: Number(l.created_at) }));
}

export function calcularStatus(
  arquivos: MigracaoArquivo[],
  aplicadas: MigracaoAplicada[],
): StatusMigracoes {
  const porQuando = new Map(aplicadas.map((a) => [a.quando, a]));
  const ultima = aplicadas.reduce((max, a) => Math.max(max, a.quando), Number.NEGATIVE_INFINITY);
  const status: StatusMigracoes = {
    aplicadas: [],
    pendentes: [],
    ignoradas: [],
    alteradas: [],
    desconhecidas: [],
  };
  for (const arquivo of arquivos) {
    const aplicada = porQuando.get(arquivo.quando);
    if (aplicada) {
      status.aplicadas.push(arquivo);
      if (aplicada.hash !== arquivo.hash) status.alteradas.push(arquivo);
    } else if (arquivo.quando > ultima) {
      status.pendentes.push(arquivo);
    } else {
      status.ignoradas.push(arquivo);
    }
  }
  const quandoArquivos = new Set(arquivos.map((a) => a.quando));
  status.desconhecidas = aplicadas.filter((a) => !quandoArquivos.has(a.quando));
  return status;
}

export async function lerStatus(connectionString: string, pasta: string): Promise<StatusMigracoes> {
  const cliente = new Client({ connectionString, application_name: "summer-db-status" });
  await cliente.connect();
  try {
    return calcularStatus(lerMigracoesArquivo(pasta), await lerMigracoesAplicadas(cliente));
  } finally {
    await cliente.end();
  }
}

export type ResultadoMigracao = {
  /** Tags aplicadas nesta execução, em ordem. */
  aplicadas: string[];
  /** Situação depois de aplicar. */
  status: StatusMigracoes;
};

export type OpcoesMigracao = {
  connectionString: string;
  pasta?: string;
  /** Tempo máximo esperando outro processo terminar de migrar. Padrão: 10 min. */
  esperaLockMs?: number;
  log?: (mensagem: string) => void;
};

/**
 * Aplica as migrações pendentes com advisory lock. Uma conexão só (`pg.Client`):
 * o lock é de sessão e fica preso até o `pg_advisory_unlock` ou o fim da conexão,
 * então, mesmo que o processo morra no meio, o Postgres o solta.
 */
export async function aplicarMigracoes(opcoes: OpcoesMigracao): Promise<ResultadoMigracao> {
  const pasta = opcoes.pasta ?? PASTA_MIGRACOES_PADRAO;
  const log = opcoes.log ?? (() => {});
  const esperaLockMs = opcoes.esperaLockMs ?? 10 * 60_000;
  const arquivos = lerMigracoesArquivo(pasta);

  const cliente = new Client({
    connectionString: opcoes.connectionString,
    application_name: "summer-migrate",
  });
  await cliente.connect();
  let travado = false;
  try {
    // lock_timeout também vale para advisory locks: não espera para sempre.
    await cliente.query(`set lock_timeout = ${Math.max(1, Math.floor(esperaLockMs))}`);
    log(`aguardando o advisory lock ${CHAVE_LOCK_MIGRACOES}...`);
    await cliente.query(`select pg_advisory_lock(${CHAVE_LOCK_MIGRACOES})`);
    travado = true;
    await cliente.query("reset lock_timeout");
    log("lock obtido");

    const antes = calcularStatus(arquivos, await lerMigracoesAplicadas(cliente));
    if (antes.alteradas.length > 0) {
      throw new Error(
        `migração aplicada foi alterada depois (proibido; crie uma nova): ${antes.alteradas.map((m) => m.tag).join(", ")}`,
      );
    }
    if (antes.ignoradas.length > 0) {
      throw new Error(
        `migração com data anterior à última aplicada nunca foi aplicada e seria ignorada: ${antes.ignoradas.map((m) => m.tag).join(", ")}. Gere-a de novo depois das existentes.`,
      );
    }
    for (const d of antes.desconhecidas) {
      log(`aviso: o banco tem uma migração sem arquivo (when=${d.quando}); o código é mais antigo que o banco`);
    }
    if (antes.pendentes.length === 0) {
      log("nenhuma migração pendente");
      return { aplicadas: [], status: antes };
    }
    for (const m of antes.pendentes) log(`pendente: ${m.tag}`);

    // todas as pendentes numa transação só (comportamento do migrate() do drizzle-orm 0.45)
    await migrate(drizzle({ client: cliente }), {
      migrationsFolder: pasta,
      migrationsSchema: SCHEMA_CONTROLE,
      migrationsTable: TABELA_CONTROLE,
    });

    const depois = calcularStatus(arquivos, await lerMigracoesAplicadas(cliente));
    const aplicadas = antes.pendentes
      .filter((m) => depois.aplicadas.some((a) => a.tag === m.tag))
      .map((m) => m.tag);
    for (const tag of aplicadas) log(`aplicada: ${tag}`);
    if (depois.pendentes.length > 0) {
      throw new Error(`ainda há migrações pendentes: ${depois.pendentes.map((m) => m.tag).join(", ")}`);
    }
    return { aplicadas, status: depois };
  } finally {
    if (travado) {
      await cliente.query(`select pg_advisory_unlock(${CHAVE_LOCK_MIGRACOES})`).catch(() => {});
    }
    await cliente.end();
  }
}

/** Mostra só host, porta e banco de uma URL do Postgres (nunca usuário e senha). */
export function descreverUrl(connectionString: string): string {
  try {
    const u = new URL(connectionString);
    return `${u.hostname}:${u.port || "5432"}${u.pathname}`;
  } catch {
    return "(URL inválida)";
  }
}
