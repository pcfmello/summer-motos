import { describe, expect, it } from "vitest";
import { papelDoApp } from "./instalar";
import { lerSchemaPgBoss, SCHEMA_PGBOSS_PADRAO } from "./schema";

describe("lerSchemaPgBoss", () => {
  it("vazio usa o padrão", () => {
    expect(lerSchemaPgBoss(undefined)).toBe(SCHEMA_PGBOSS_PADRAO);
    expect(lerSchemaPgBoss("  ")).toBe(SCHEMA_PGBOSS_PADRAO);
  });

  it("aceita identificador simples em minúsculas", () => {
    expect(lerSchemaPgBoss("pgboss_homolog")).toBe("pgboss_homolog");
  });

  it.each(["PgBoss", "pg-boss", "1fila", 'pgboss"; drop table x; --', "a".repeat(51)])(
    "recusa %s",
    (valor) => {
      expect(() => lerSchemaPgBoss(valor)).toThrow(/PGBOSS_SCHEMA inválido/);
    },
  );
});

describe("papelDoApp", () => {
  const dono = "postgres://summer_owner:x@db:5432/summer";

  it("usuário do app diferente do dono: recebe os privilégios", () => {
    expect(papelDoApp("postgres://summer_app:y@db:5432/summer", dono)).toBe("summer_app");
  });

  it("mesmo usuário (local e CI): nada a conceder", () => {
    expect(papelDoApp("postgres://summer_owner:z@db:5432/summer", dono)).toBeNull();
  });

  it("sem DATABASE_URL ou URL inválida: nada a conceder", () => {
    expect(papelDoApp(undefined, dono)).toBeNull();
    expect(papelDoApp("não é url", dono)).toBeNull();
  });
});
