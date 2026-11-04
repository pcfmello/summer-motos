import { describe, expect, it } from "vitest";

import { MODULOS } from "../../auth/permissoes";
import { SENHA_MAXIMO as SENHA_MAXIMO_AUTH, SENHA_MINIMO as SENHA_MINIMO_AUTH } from "../../auth/usuarios";
import { REGIMES_TRIBUTARIOS as REGIMES_BANCO, STATUS_TENANT as STATUS_BANCO } from "../../db/schema/plataforma";
import { calcularDigitosCnpj } from "../documentos";

import {
  CODIGO_IBGE_UF,
  MODULOS_EMPRESA,
  REGIMES_TRIBUTARIOS,
  STATUS_TENANT,
  UFS,
  esquemaAlterarModulo,
  esquemaAceiteNovaConta,
  esquemaConviteDono,
  esquemaTrocaSenha,
  SENHA_MAXIMO,
  SENHA_MINIMO,
  esquemaIdAlvo,
  esquemaNovaEmpresa,
  esquemaNovoTenant,
  esquemaStatusTenant,
  abreviarUserAgent,
  textoOuNulo,
  truncarIp,
  validarPlanoTenant,
} from ".";

const CNPJ_NUMERICO = "11222333000181";
const BASE_ALFA = "12ABC34501DE";
const CNPJ_ALFA = BASE_ALFA + calcularDigitosCnpj(BASE_ALFA);

const empresaValida = {
  razaoSocial: "Moto Peças Exemplo Ltda",
  nomeFantasia: "Moto Peças Exemplo",
  cnpj: "11.222.333/0001-81",
  regimeTributario: "simples_nacional",
  uf: "sp",
  codigoIbgeMunicipio: "3550308",
};

function mensagens(resultado: { success: boolean; error?: { issues: { path: PropertyKey[]; message: string }[] } }) {
  return Object.fromEntries((resultado.error?.issues ?? []).map((i) => [i.path.join("."), i.message]));
}

describe("listas sincronizadas com o banco e as permissões", () => {
  it("regimes, status e módulos são os mesmos do schema e da matriz", () => {
    expect([...REGIMES_TRIBUTARIOS]).toEqual([...REGIMES_BANCO]);
    expect([...STATUS_TENANT]).toEqual([...STATUS_BANCO]);
    expect([...MODULOS_EMPRESA]).toEqual([...MODULOS]);
  });

  it("27 UFs com código IBGE de 2 dígitos", () => {
    expect(UFS).toHaveLength(27);
    for (const uf of UFS) expect(CODIGO_IBGE_UF[uf]).toMatch(/^\d{2}$/);
  });
});

describe("esquemaNovoTenant", () => {
  it("apara o nome e exige pelo menos 2 caracteres", () => {
    expect(esquemaNovoTenant.parse({ nome: "  Moto Peças X  " })).toEqual({ nome: "Moto Peças X" });
    expect(esquemaNovoTenant.safeParse({ nome: " a " }).success).toBe(false);
    expect(esquemaNovoTenant.safeParse({ nome: "x".repeat(121) }).success).toBe(false);
  });

  it("descarta campos extras (nada de tenantId vindo do cliente)", () => {
    expect(esquemaNovoTenant.parse({ nome: "Loja", tenantId: "x", status: "suspenso" })).toEqual({ nome: "Loja" });
  });
});

describe("esquemaStatusTenant", () => {
  it("só ativo ou suspenso", () => {
    expect(esquemaStatusTenant.parse("suspenso")).toBe("suspenso");
    expect(esquemaStatusTenant.safeParse("apagado").success).toBe(false);
  });
});

describe("esquemaNovaEmpresa", () => {
  it("normaliza CNPJ com máscara e UF em minúsculas", () => {
    const empresa = esquemaNovaEmpresa.parse(empresaValida);
    expect(empresa.cnpj).toBe(CNPJ_NUMERICO);
    expect(empresa.uf).toBe("SP");
  });

  it("aceita CNPJ alfanumérico, inclusive digitado em minúsculas", () => {
    const empresa = esquemaNovaEmpresa.parse({ ...empresaValida, cnpj: CNPJ_ALFA.toLowerCase() });
    expect(empresa.cnpj).toBe(CNPJ_ALFA);
  });

  it("recusa CNPJ com dígito verificador errado, com a mensagem no campo", () => {
    const resultado = esquemaNovaEmpresa.safeParse({ ...empresaValida, cnpj: "11222333000182" });
    expect(resultado.success).toBe(false);
    expect(mensagens(resultado).cnpj).toMatch(/dígito verificador/);
  });

  it("recusa CNPJ vazio e regime desconhecido", () => {
    const resultado = esquemaNovaEmpresa.safeParse({ ...empresaValida, cnpj: "", regimeTributario: "mei" });
    const erros = mensagens(resultado);
    expect(erros.cnpj).toBe("Informe o CNPJ.");
    expect(erros.regimeTributario).toBe("Escolha o regime tributário.");
  });

  it("UF e código IBGE são opcionais", () => {
    const empresa = esquemaNovaEmpresa.parse({ ...empresaValida, nomeFantasia: "", uf: "", codigoIbgeMunicipio: "" });
    expect(empresa.uf).toBe("");
    expect(empresa.codigoIbgeMunicipio).toBe("");
  });

  it("recusa UF inexistente e IBGE fora do formato", () => {
    const erros = mensagens(esquemaNovaEmpresa.safeParse({ ...empresaValida, uf: "XX", codigoIbgeMunicipio: "355030" }));
    expect(erros.uf).toBe("UF inválida.");
    expect(erros.codigoIbgeMunicipio).toMatch(/7 números/);
  });

  it("o código IBGE precisa ser de um município da UF informada", () => {
    const erros = mensagens(esquemaNovaEmpresa.safeParse({ ...empresaValida, uf: "MG" }));
    expect(erros.codigoIbgeMunicipio).toMatch(/MG começa com 31/);
    const semUf = mensagens(esquemaNovaEmpresa.safeParse({ ...empresaValida, uf: "" }));
    expect(semUf.uf).toMatch(/Informe a UF/);
  });

  it("descarta empresaId, tenantId e módulos enviados pelo cliente", () => {
    const empresa = esquemaNovaEmpresa.parse({
      ...empresaValida,
      empresaId: "00000000-0000-0000-0000-000000000000",
      tenantId: "00000000-0000-0000-0000-000000000000",
      modulos: { balcao: true },
    });
    expect(Object.keys(empresa).sort()).toEqual(
      ["cnpj", "codigoIbgeMunicipio", "nomeFantasia", "razaoSocial", "regimeTributario", "uf"].sort(),
    );
  });
});

describe("esquemaAlterarModulo", () => {
  it("só módulos conhecidos e booleano de verdade", () => {
    expect(esquemaAlterarModulo.parse({ modulo: "fiscal", ligado: true })).toEqual({ modulo: "fiscal", ligado: true });
    expect(esquemaAlterarModulo.safeParse({ modulo: "financeiro", ligado: true }).success).toBe(false);
    expect(esquemaAlterarModulo.safeParse({ modulo: "os", ligado: "true" }).success).toBe(false);
  });
});

describe("esquemaConviteDono", () => {
  it("só o e-mail, normalizado; nome, senha e perfil do cliente são descartados", () => {
    expect(esquemaConviteDono.parse({ email: "  Ana@Loja.COM.br " })).toEqual({ email: "ana@loja.com.br" });
    const convite = esquemaConviteDono.parse({ nome: "Ana", email: "a@b.co", senha: "x", perfil: "balcao", adminPlataforma: true });
    expect(convite).toEqual({ email: "a@b.co" });
  });

  it("recusa e-mail inválido ou vazio", () => {
    expect(mensagens(esquemaConviteDono.safeParse({ email: "ana@" })).email).toBe("E-mail inválido.");
    expect(mensagens(esquemaConviteDono.safeParse({ email: " " })).email).toBe("Informe o e-mail.");
  });
});

describe("esquemaAceiteNovaConta e esquemaTrocaSenha", () => {
  it("a política de senha é a mesma do Better Auth (D027)", () => {
    expect(SENHA_MINIMO).toBe(SENHA_MINIMO_AUTH);
    expect(SENHA_MAXIMO).toBe(SENHA_MAXIMO_AUTH);
  });

  it("aceite: nome, senha de 10 a 128 e confirmação igual", () => {
    expect(esquemaAceiteNovaConta.parse({ nome: " Ana ", senha: "senha-forte-1", confirmacao: "senha-forte-1" })).toEqual({
      nome: "Ana",
      senha: "senha-forte-1",
      confirmacao: "senha-forte-1",
    });
    const erros = mensagens(esquemaAceiteNovaConta.safeParse({ nome: "A", senha: "curta", confirmacao: "outra" }));
    expect(erros.nome).toMatch(/nome/);
    expect(erros.senha).toMatch(/pelo menos 10/);
    expect(erros.confirmacao).toMatch(/não é igual/);
    expect(esquemaAceiteNovaConta.safeParse({ nome: "Ana", senha: "x".repeat(129), confirmacao: "x".repeat(129) }).success).toBe(false);
  });

  it("troca: nova senha diferente da atual e confirmada", () => {
    expect(esquemaTrocaSenha.safeParse({ senhaAtual: "a", novaSenha: "nova-senha-123", confirmacao: "nova-senha-123" }).success).toBe(true);
    const igual = mensagens(esquemaTrocaSenha.safeParse({ senhaAtual: "nova-senha-123", novaSenha: "nova-senha-123", confirmacao: "nova-senha-123" }));
    expect(igual.novaSenha).toMatch(/diferente/);
    const errada = mensagens(esquemaTrocaSenha.safeParse({ senhaAtual: "", novaSenha: "nova-senha-123", confirmacao: "x" }));
    expect(errada.senhaAtual).toMatch(/senha atual/);
    expect(errada.confirmacao).toMatch(/não é igual/);
  });
});

describe("esquemaIdAlvo e textoOuNulo", () => {
  it("id precisa ser uuid", () => {
    expect(esquemaIdAlvo.safeParse("1").success).toBe(false);
    expect(esquemaIdAlvo.safeParse("5f0c7a3e-8c1b-4a5e-9a7d-2b9c1d3e4f50").success).toBe(true);
  });

  it("vazio vira nulo", () => {
    expect(textoOuNulo("  ")).toBeNull();
    expect(textoOuNulo(undefined)).toBeNull();
    expect(textoOuNulo(" SP ")).toBe("SP");
  });
});

describe("validarPlanoTenant (scripts/criar-tenant.ts)", () => {
  const plano = {
    tenant: " Moto Peças Grupo ",
    empresas: [
      { ...empresaValida, modulos: ["balcao", "balcao"] },
      { razaoSocial: "Filial Real Ltda", cnpj: CNPJ_ALFA, regimeTributario: "lucro_real" },
    ],
    dono: { nome: "Ana", email: "ANA@LOJA.COM" },
  };

  it("normaliza tudo com os esquemas do /admin; módulos padrão = nenhum", () => {
    const resultado = validarPlanoTenant(plano);
    expect(resultado.ok).toBe(true);
    if (!resultado.ok) return;
    expect(resultado.plano.tenant.nome).toBe("Moto Peças Grupo");
    expect(resultado.plano.dono.email).toBe("ana@loja.com");
    expect(resultado.plano.empresas[0]).toMatchObject({ cnpj: CNPJ_NUMERICO, uf: "SP", modulos: ["balcao"] });
    expect(resultado.plano.empresas[1]).toMatchObject({ cnpj: CNPJ_ALFA, uf: "", nomeFantasia: "", modulos: [] });
  });

  it("o nome do dono é opcional e ignorado (definido no convite)", () => {
    const resultado = validarPlanoTenant({ ...plano, dono: { email: "ana@loja.com" } });
    expect(resultado.ok && resultado.plano.dono).toEqual({ email: "ana@loja.com" });
  });

  it("devolve todos os erros de uma vez, com o caminho do campo", () => {
    const resultado = validarPlanoTenant({
      ...plano,
      tenant: "",
      empresas: [{ ...empresaValida, cnpj: "11222333000182" }, { ...empresaValida, regimeTributario: "mei" }],
      dono: { nome: "Ana", email: "x" },
    });
    expect(resultado.ok).toBe(false);
    if (resultado.ok) return;
    expect(resultado.erros.some((e) => e.startsWith("tenant.nome:"))).toBe(true);
    expect(resultado.erros.some((e) => e.startsWith("dono.email:"))).toBe(true);
    expect(resultado.erros.some((e) => e.startsWith("empresas.0.cnpj:"))).toBe(true);
    expect(resultado.erros.some((e) => e.startsWith("empresas.1.regimeTributario:"))).toBe(true);
  });

  it("recusa CNPJ repetido no plano, chave desconhecida e módulo inexistente", () => {
    const repetido = validarPlanoTenant({ ...plano, empresas: [empresaValida, { ...empresaValida, cnpj: CNPJ_NUMERICO }] });
    expect(repetido.ok).toBe(false);
    if (!repetido.ok) expect(repetido.erros.join()).toMatch(/CNPJ repetido/);

    expect(validarPlanoTenant({ ...plano, adminPlataforma: true }).ok).toBe(false);
    expect(validarPlanoTenant({ ...plano, empresas: [{ ...empresaValida, modulos: ["financeiro"] }] }).ok).toBe(false);
    expect(validarPlanoTenant({ ...plano, empresas: [] }).ok).toBe(false);
  });
});

describe("origem do aceite: truncarIp e abreviarUserAgent", () => {
  it.each([
    ["203.0.113.57", "203.0.113.0/24"],
    ["10.0.0.1", "10.0.0.0/24"],
    ["::ffff:198.51.100.9", "198.51.100.0/24"],
    ["2001:db8:abcd:12::1", "2001:db8:abcd::/48"],
    ["2001:0DB8:0000:0000:0000:0000:0000:0001", "2001:db8:0::/48"],
    ["::1", "0:0:0::/48"],
    ["fe80::", "fe80:0:0::/48"],
  ])("%s → %s", (ip, esperado) => {
    expect(truncarIp(ip)).toBe(esperado);
  });

  it.each([null, undefined, "", "abc", "256.1.1.1", "1.2.3", "2001:db8::1::2", "2001:db8:zzzz::1", "1:2:3:4:5:6:7:8:9"])(
    "inválido (%s) → null",
    (ip) => {
      expect(truncarIp(ip as string | null | undefined)).toBeNull();
    },
  );

  it("user-agent sem controle, espaços colapsados e no máximo 120 caracteres", () => {
    expect(abreviarUserAgent("  Mozilla/5.0   (X11;\n Linux)\u0000 ")).toBe("Mozilla/5.0 (X11; Linux)");
    const longo = abreviarUserAgent("A".repeat(500));
    expect(longo).toHaveLength(120);
    expect(longo!.endsWith("…")).toBe(true);
    expect(abreviarUserAgent("   ")).toBeNull();
    expect(abreviarUserAgent(null)).toBeNull();
  });
});
