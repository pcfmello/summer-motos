/**
 * Empacota os processos que rodam fora do Next (D020, D023): `pnpm build:scripts`.
 *
 *   dist/migrate.mjs  ← scripts/migrate.ts   (migrações do Drizzle + schema do pg-boss)
 *   dist/worker.mjs   ← src/worker/index.ts  (consumidor da fila pg-boss)
 *
 * - ESM para Node 22, com o alias "@/" resolvido pelo próprio esbuild (lê o
 *   `paths` do tsconfig.json).
 * - **Tudo embutido** (pg, pg-boss, drizzle-orm...), menos o `pg-native`, que é
 *   opcional e não é usado. Cada arquivo roda sozinho com `node`, sem
 *   node_modules: as imagens `worker` e `migrate` não precisam de um estágio de
 *   dependências de produção, e o `migrate.mjs` roda dentro da imagem standalone
 *   do app, cujo node_modules só tem o que o Next rastreou. O custo é um arquivo
 *   de alguns MB, bem menor que o node_modules de produção (ver o tamanho no log).
 * - O `server-only` é proibido nos dois bundles: se algum import o puxar, o
 *   build falha (o worker usa `criarPool` de `conexao.ts`, D024).
 * - Sem minificação: o stack trace de um erro em produção continua legível.
 */
import { build } from "esbuild";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const saida = path.join(raiz, "dist");

/** Recusa `server-only` (e `client-only`) no bundle, com a cadeia de imports no erro. */
const proibirServerOnly = {
  name: "proibir-server-only",
  setup(b) {
    b.onResolve({ filter: /^(server|client)-only$/ }, (args) => ({
      errors: [
        {
          text: `"${args.path}" não pode entrar em ${path.basename(b.initialOptions.outfile)} (importado por ${path.relative(raiz, args.importer)}). Use src/server/db/conexao.ts, não src/server/db/index.ts.`,
        },
      ],
    }));
  },
};

const alvos = [
  { entrada: "scripts/migrate.ts", saida: "migrate.mjs" },
  { entrada: "src/worker/index.ts", saida: "worker.mjs" },
];

await rm(saida, { recursive: true, force: true });
await mkdir(saida, { recursive: true });

for (const alvo of alvos) {
  const resultado = await build({
    absWorkingDir: raiz,
    entryPoints: [alvo.entrada],
    outfile: path.join(saida, alvo.saida),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    tsconfig: "tsconfig.json",
    external: ["pg-native"],
    // Dependências CommonJS (pg) usam require() de módulos do Node: num bundle ESM,
    // o require precisa existir.
    banner: {
      js: [
        "// Gerado por scripts/build-scripts.mjs. Não edite.",
        'import { createRequire as __summerCreateRequire } from "node:module";',
        "const require = __summerCreateRequire(import.meta.url);",
      ].join("\n"),
    },
    legalComments: "none",
    sourcemap: false,
    minify: false,
    metafile: true,
    logLevel: "warning",
    plugins: [proibirServerOnly],
  });
  const bytes = Object.values(resultado.metafile.outputs)[0].bytes;
  console.log(`[build:scripts] dist/${alvo.saida}: ${(bytes / 1024).toFixed(0)} kB`);
}
