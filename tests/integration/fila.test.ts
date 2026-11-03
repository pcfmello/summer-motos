/**
 * Fila pg-boss (fatia 0.11), Postgres real (summer_test), num schema próprio
 * (`pgboss_teste`) para não misturar com outra execução.
 *
 * - instalarPgBoss cria o schema na versão do pacote e é idempotente;
 * - migra de uma versão anterior (rollback do próprio pg-boss → migrate), o
 *   caminho de uma futura atualização do pacote;
 * - o worker sobe com `migrate: false`, grava o batimento, processa um job de
 *   `sistema.ping` e para de forma graciosa, apagando o batimento.
 */
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Client } from "pg";
import { getRollbackPlans } from "pg-boss";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { instalarPgBoss, VERSAO_SCHEMA_PGBOSS } from "../../src/server/fila/instalar";
import { FILAS } from "../../src/worker/filas";
import { iniciarWorker } from "../../src/worker/worker";
import { exigirBancoDeTeste, urlBancoTeste } from "./_banco";

const SCHEMA = "pgboss_teste";
const url = urlBancoTeste();
const cliente = new Client({ connectionString: url });

async function versaoInstalada(): Promise<number> {
  const r = await cliente.query<{ version: string }>(`select version from ${SCHEMA}.version`);
  return Number(r.rows[0]?.version);
}

beforeAll(async () => {
  await cliente.connect();
  await exigirBancoDeTeste(cliente);
  await cliente.query(`drop schema if exists ${SCHEMA} cascade`);
});

afterAll(async () => {
  await cliente.query(`drop schema if exists ${SCHEMA} cascade`);
  await cliente.end();
});

describe("instalarPgBoss", () => {
  it("cria o schema na versão do pacote e, de novo, não faz nada", async () => {
    const primeira = await instalarPgBoss(cliente, { schema: SCHEMA });
    expect(primeira).toEqual({
      acao: "instalado",
      versaoAntes: null,
      versaoDepois: VERSAO_SCHEMA_PGBOSS,
      papelApp: null,
    });
    expect(await versaoInstalada()).toBe(VERSAO_SCHEMA_PGBOSS);

    const segunda = await instalarPgBoss(cliente, { schema: SCHEMA });
    expect(segunda.acao).toBe("atual");
    expect(await versaoInstalada()).toBe(VERSAO_SCHEMA_PGBOSS);
  });

  it("migra a partir da versão anterior", async () => {
    await cliente.query(getRollbackPlans(SCHEMA, VERSAO_SCHEMA_PGBOSS));
    expect(await versaoInstalada()).toBe(VERSAO_SCHEMA_PGBOSS - 1);

    const resultado = await instalarPgBoss(cliente, { schema: SCHEMA });
    expect(resultado.acao).toBe("migrado");
    expect(resultado.versaoAntes).toBe(VERSAO_SCHEMA_PGBOSS - 1);
    expect(await versaoInstalada()).toBe(VERSAO_SCHEMA_PGBOSS);
  });
});

describe("worker", () => {
  it("processa sistema.ping, grava o batimento e para de forma graciosa", async () => {
    const mensagens: string[] = [];
    const arquivoBatimento = path.join(tmpdir(), `summer-worker-batimento-teste-${process.pid}`);
    const worker = await iniciarWorker({
      databaseUrl: url,
      poolMax: "2",
      schema: SCHEMA,
      concorrencia: 1,
      arquivoBatimento,
      intervaloBatimentoMs: 200,
      log: (m) => mensagens.push(m),
    });

    try {
      expect(existsSync(arquivoBatimento)).toBe(true);

      const id = await worker.boss.send(FILAS.ping, { origem: "teste" });
      expect(id).toBeTruthy();

      const prazo = Date.now() + 20_000;
      while (!mensagens.some((m) => m.includes(String(id))) && Date.now() < prazo) {
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(mensagens.some((m) => m.includes(`job ${id} recebido (origem: teste)`))).toBe(true);
    } finally {
      await worker.parar();
    }

    expect(existsSync(arquivoBatimento)).toBe(false);
    expect(mensagens.at(-1)).toBe("parado");
    // nenhum erro do pg-boss durante a execução
    expect(mensagens.filter((m) => m.startsWith("pg-boss: erro"))).toEqual([]);
  });
});
