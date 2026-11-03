/**
 * Compara as migrações do diretório com a tabela de controle do Drizzle
 * (`drizzle.__drizzle_migrations`): `pnpm db:status`.
 *
 * Lista as aplicadas e as pendentes, e acusa as situações que o `db:migrate`
 * recusa (migração alterada depois de aplicada, migração que seria ignorada).
 * Termina com código 1 se houver pendência ou problema, para servir no CI.
 */
import {
  PASTA_MIGRACOES_PADRAO,
  descreverUrl,
  lerStatus,
} from "../src/server/db/migracoes";
import { carregarEnvLocal, pastaMigracoes, urlDoBanco } from "./_ambiente";

async function main(): Promise<number> {
  carregarEnvLocal();
  const alvo = urlDoBanco(process.argv.slice(2));
  const pasta = pastaMigracoes(PASTA_MIGRACOES_PADRAO);
  const status = await lerStatus(alvo.url, pasta);

  console.log(`banco: ${descreverUrl(alvo.url)} (${alvo.nome})`);
  console.log(`pasta: ${pasta}\n`);
  for (const m of status.aplicadas) {
    const alterada = status.alteradas.includes(m) ? "  << ALTERADA depois de aplicada" : "";
    console.log(`  [aplicada]  ${m.tag}${alterada}`);
  }
  for (const m of status.pendentes) console.log(`  [pendente]  ${m.tag}`);
  for (const m of status.ignoradas) console.log(`  [IGNORADA]  ${m.tag}  << data anterior à última aplicada`);
  for (const d of status.desconhecidas) {
    console.log(`  [sem arquivo] when=${d.quando} hash=${d.hash.slice(0, 12)}…  << banco mais novo que o código`);
  }
  console.log(
    `\n${status.aplicadas.length} aplicada(s), ${status.pendentes.length} pendente(s)` +
      (status.ignoradas.length ? `, ${status.ignoradas.length} ignorada(s)` : "") +
      (status.alteradas.length ? `, ${status.alteradas.length} alterada(s)` : "") +
      (status.desconhecidas.length ? `, ${status.desconhecidas.length} sem arquivo` : ""),
  );
  const problema =
    status.pendentes.length + status.ignoradas.length + status.alteradas.length > 0;
  return problema ? 1 : 0;
}

main().then(
  (codigo) => process.exit(codigo),
  (erro: unknown) => {
    console.error(`[db:status] FALHOU: ${erro instanceof Error ? erro.message : String(erro)}`);
    process.exit(1);
  },
);
