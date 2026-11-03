/**
 * globalSetup do projeto `integration`: recria o schema do `summer_test` e
 * aplica as migrações do zero, uma vez antes da suíte (D011).
 */
import { aplicarMigracoes } from "../../src/server/db/migracoes";
import { recriarSchema, urlBancoTeste } from "./_banco";

export default async function setup(): Promise<void> {
  const url = urlBancoTeste();
  await recriarSchema(url);
  await aplicarMigracoes({ connectionString: url });
}
