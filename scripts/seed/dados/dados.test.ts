/**
 * Conferência dos dados do seed de demonstração (seção 8): códigos válidos e
 * únicos, referências que existem e nenhum valor monetário como `number`.
 */
import { describe, expect, it } from "vitest";

import { paraDecimal } from "../../../src/server/domain/decimal";
import { validarCnpj, validarCpf, validarNcm, validarOrigem, validarPlaca } from "../../../src/server/domain/documentos";
import { ehGtinValido, validarGtinFiscal } from "../../../src/server/domain/ean";
import * as dados from "./index";
import {
  CANAIS,
  CATEGORIAS,
  CLIENTES,
  CODIGOS_KITS,
  EMPRESAS_DEMO,
  MARCAS_MOTO,
  MARCAS_PECA,
  MECANICOS,
  MODELOS_MOTO,
  PERFIS_TRIBUTARIOS,
  PRODUTOS,
  SERVICOS,
  TABELAS_PRECO,
  USUARIOS_DEMO,
  VENDEDORES,
} from "./index";

const repetidos = (lista: readonly string[]) => lista.filter((v, i) => lista.indexOf(v) !== i);
const codigosProduto = new Set(PRODUTOS.map((p) => p.codigo));
const chavesModelo = new Set<string>(MODELOS_MOTO.map((m) => m.chave));
const DECIMAL = /^-?\d+(\.\d+)?$/;

describe("motos", () => {
  it("~30 modelos, com marca cadastrada, cilindrada positiva e chave e nome únicos", () => {
    expect(MODELOS_MOTO.length).toBeGreaterThanOrEqual(28);
    expect(repetidos(MODELOS_MOTO.map((m) => m.chave))).toEqual([]);
    expect(repetidos(MODELOS_MOTO.map((m) => `${m.marca}|${m.nome.toLowerCase()}`))).toEqual([]);
    for (const m of MODELOS_MOTO) {
      expect(MARCAS_MOTO).toContain(m.marca);
      expect(Number.isInteger(m.cilindrada) && m.cilindrada > 0).toBe(true);
    }
  });

  it("inclui os modelos citados na seção 8", () => {
    const nomes = MODELOS_MOTO.map((m) => m.nome);
    for (const nome of ["CG 160 Titan", "CG 160 Fan", "CG 160 Start", "Biz 125", "Pop 110i", "NXR 160 Bros", "XRE 300"]) {
      expect(nomes).toContain(nome);
    }
    for (const nome of ["CB 300F Twister", "PCX 160", "Factor 150", "Fazer 250", "Lander 250", "Crosser 150", "NMax 160", "MT-03"]) {
      expect(nomes).toContain(nome);
    }
    for (const marca of ["Suzuki", "Kawasaki", "Royal Enfield", "Shineray"] as const) {
      expect(MODELOS_MOTO.some((m) => m.marca === marca)).toBe(true);
    }
  });
});

describe("catálogo", () => {
  it("~80 peças com código único e todas as categorias da seção 8", () => {
    expect(PRODUTOS.length).toBeGreaterThanOrEqual(75);
    expect(repetidos(PRODUTOS.map((p) => p.codigo))).toEqual([]);
    for (const p of PRODUTOS) expect(p.codigo).toMatch(/^\d{6}$/);
    for (const c of CATEGORIAS) expect(PRODUTOS.some((p) => p.categoria === c.nome)).toBe(true);
    expect(repetidos(CATEGORIAS.map((c) => c.nome.toLowerCase()))).toEqual([]);
    expect(repetidos(MARCAS_PECA.map((m) => m.nome.toLowerCase()))).toEqual([]);
    expect(repetidos(MARCAS_PECA.map((m) => m.codigoEan))).toEqual([]);
  });

  it("usa as unidades pedidas (incluindo LT, ML, PCT, JG, PAR e KIT)", () => {
    const unidades = new Set(PRODUTOS.map((p) => p.unidade));
    for (const u of ["UN", "LT", "ML", "PCT", "JG", "PAR", "KIT"] as const) expect(unidades).toContain(u);
  });

  it("3 kits como produtos comuns (D012), entre eles o kit relação CG 160, com o conteúdo descrito", () => {
    expect(CODIGOS_KITS).toHaveLength(3);
    const kits = PRODUTOS.filter((p) => (CODIGOS_KITS as readonly string[]).includes(p.codigo));
    expect(kits).toHaveLength(3);
    for (const k of kits) {
      expect(k.unidade).toBe("KIT");
      expect(k.descricaoCompleta).toBeTruthy();
      expect(k.codigosBarras.some((c) => c.tipo === "fabricante")).toBe(true);
    }
    const cg160 = kits.find((k) => k.descricao.startsWith("Kit relação CG 160"));
    expect(cg160?.descricao).toBe("Kit relação CG 160 (coroa + pinhão + corrente)");
    expect(cg160?.descricaoCompleta).toMatch(/coroa.*pinhão.*corrente/);
  });

  it("EANs de fabricante: EAN-13 com prefixo 789, DV válido, aceitos como GTIN fiscal e únicos", () => {
    const todos = PRODUTOS.flatMap((p) => p.codigosBarras.map((c) => c.codigo));
    expect(repetidos(todos)).toEqual([]);
    for (const p of PRODUTOS) {
      for (const c of p.codigosBarras) {
        expect(ehGtinValido(c.codigo)).toBe(true);
        expect(validarGtinFiscal(c.codigo)).toEqual({ ok: true, valor: c.codigo });
        if (c.tipo === "fabricante") {
          expect(c.codigo).toMatch(/^789\d{10}$/);
          expect(c.fator).toBe("1");
        } else {
          expect(c.codigo).toHaveLength(14);
          expect(paraDecimal(c.fator).gt(1)).toBe(true);
        }
        // um código de barras nunca é igual ao código interno de outro produto (D6 do modelo)
        expect(codigosProduto.has(c.codigo)).toBe(false);
      }
    }
    expect(PRODUTOS.filter((p) => p.codigosBarras.length > 0).length).toBeGreaterThan(PRODUTOS.length * 0.9);
  });

  it("NCM com 8 dígitos, origem de 0 a 8, descrição curta de etiqueta e localização", () => {
    for (const p of PRODUTOS) {
      expect(validarNcm(p.ncm)).toEqual({ ok: true, valor: p.ncm });
      expect(validarOrigem(p.origem).ok).toBe(true);
      expect(p.descricaoCurta.length).toBeLessThanOrEqual(32);
      expect(p.corredor).not.toBe("");
      expect(p.prateleira).not.toBe("");
    }
  });

  it("toda aplicação aponta para um modelo existente, com faixa de anos válida", () => {
    let total = 0;
    for (const p of PRODUTOS) {
      for (const a of p.aplicacoes) {
        total += 1;
        expect(chavesModelo.has(a.modelo)).toBe(true);
        for (const ano of [a.anoInicial, a.anoFinal]) {
          if (ano !== null) expect(ano >= 1950 && ano <= 2100).toBe(true);
        }
        if (a.anoInicial !== null && a.anoFinal !== null) expect(a.anoFinal).toBeGreaterThanOrEqual(a.anoInicial);
      }
      expect(repetidos(p.aplicacoes.map((a) => `${a.modelo}|${a.anoInicial}|${a.anoFinal}`))).toEqual([]);
    }
    expect(total).toBeGreaterThan(100);
  });

  it("preço de venda acima do custo, em 2 casas, e markup nulo herda da categoria", () => {
    for (const p of PRODUTOS) {
      const preco = paraDecimal(p.precoVenda);
      expect(preco.decimalPlaces()).toBeLessThanOrEqual(2);
      expect(preco.gt(p.custo)).toBe(true);
    }
    expect(PRODUTOS.some((p) => p.markup === null)).toBe(true);
    expect(PRODUTOS.some((p) => p.markup !== null)).toBe(true);
  });

  it("saldos iniciais: a maioria tem saldo, alguns abaixo do mínimo e alguns sem custo, nas duas empresas", () => {
    for (const empresa of ["simples", "real"] as const) {
      const comSaldo = PRODUTOS.filter((p) => p.saldos[empresa]);
      expect(comSaldo.length).toBeGreaterThan(PRODUTOS.length * 0.8);
      const abaixo = comSaldo.filter((p) => paraDecimal(p.saldos[empresa]!.quantidade).lt(p.estoqueMinimo));
      expect(abaixo.length).toBeGreaterThanOrEqual(3);
      expect(comSaldo.some((p) => p.saldos[empresa]!.custoUnitario === null)).toBe(true);
      for (const p of comSaldo) {
        const s = p.saldos[empresa]!;
        expect(paraDecimal(s.quantidade).gt(0)).toBe(true);
        expect(paraDecimal(s.quantidade).decimalPlaces()).toBeLessThanOrEqual(4);
        if (s.custoUnitario !== null) expect(paraDecimal(s.custoUnitario).decimalPlaces()).toBeLessThanOrEqual(6);
      }
    }
    expect(PRODUTOS.some((p) => !p.saldos.simples && !p.saldos.real)).toBe(true);
  });
});

describe("perfis tributários", () => {
  it("os 4 cenários da seção 8, marcados como exemplo e coerentes com o regime da empresa", () => {
    expect(PERFIS_TRIBUTARIOS).toHaveLength(4);
    for (const p of PERFIS_TRIBUTARIOS) {
      expect(p.dados.nome).toContain("EXEMPLO — validar com o contador");
      const empresa = EMPRESAS_DEMO.find((e) => e.chave === p.empresa);
      expect(p.dados.regime).toBe(empresa?.regimeTributario === "simples_nacional" ? "simples" : "normal");
    }
    const cenario = (empresa: string, grupo: string) =>
      PERFIS_TRIBUTARIOS.find((p) => p.empresa === empresa && p.grupoFiscal === grupo)?.dados;
    expect(cenario("simples", "st_monofasico")).toMatchObject({ csosn: "500", cstPis: "04", cstCofins: "04", monofasico: true });
    expect(cenario("simples", "tributado")).toMatchObject({ csosn: "102" });
    expect(cenario("real", "st_monofasico")).toMatchObject({ cstIcms: "60", cstPis: "04", cstCofins: "04", monofasico: true });
    expect(cenario("real", "tributado")).toMatchObject({ cstIcms: "00", cstPis: "01", cstCofins: "01" });
  });

  it("todo grupo fiscal usado pelos produtos tem perfil nas duas empresas", () => {
    for (const p of PRODUTOS) {
      for (const empresa of ["simples", "real"] as const) {
        expect(PERFIS_TRIBUTARIOS.some((t) => t.empresa === empresa && t.grupoFiscal === p.grupoFiscal)).toBe(true);
      }
    }
  });
});

describe("pessoas e cadastros", () => {
  it("15 clientes com CPF/CNPJ válido e único, WhatsApp só com dígitos e ao menos uma moto", () => {
    expect(CLIENTES).toHaveLength(15);
    expect(repetidos(CLIENTES.map((c) => c.cpfCnpj))).toEqual([]);
    for (const c of CLIENTES) {
      const r = c.tipoPessoa === "pf" ? validarCpf(c.cpfCnpj) : validarCnpj(c.cpfCnpj);
      expect(r).toEqual({ ok: true, valor: c.cpfCnpj });
      expect(c.whatsapp).toMatch(/^\d{10,13}$/);
      expect(c.motos.length).toBeGreaterThan(0);
      if (c.tabelaPreco) expect(TABELAS_PRECO.some((t) => t.chave === c.tabelaPreco)).toBe(true);
    }
  });

  it("placas válidas (antigas e Mercosul) e únicas; motos apontam para modelos existentes", () => {
    const motos = CLIENTES.flatMap((c) => c.motos);
    expect(repetidos(motos.map((m) => m.placa))).toEqual([]);
    const padroes = new Set<string>();
    for (const m of motos) {
      const r = validarPlaca(m.placa);
      expect(r.ok && r.valor === m.placa).toBe(true);
      if (r.ok) padroes.add(r.padrao);
      expect(m.modelo === null ? m.descricao : chavesModelo.has(m.modelo)).toBeTruthy();
      expect(m.ano >= 1950 && m.ano <= 2100).toBe(true);
    }
    expect(padroes).toEqual(new Set(["antiga", "mercosul"]));
  });

  it("3 mecânicos, 2 vendedores com comissão e 10 serviços com comissão", () => {
    expect(MECANICOS).toHaveLength(3);
    expect(VENDEDORES).toHaveLength(2);
    for (const v of VENDEDORES) expect(paraDecimal(v.percentualComissao).gt(0)).toBe(true);
    expect(SERVICOS).toHaveLength(10);
    expect(repetidos(SERVICOS.map((s) => s.codigo))).toEqual([]);
    for (const s of SERVICOS) {
      expect(paraDecimal(s.comissaoValor).gt(0)).toBe(true);
      expect(paraDecimal(s.comissaoValor).lte(s.precoPadrao)).toBe(true);
    }
  });

  it("mecânico e vendedor com login só nas empresas em que o usuário é membro", () => {
    for (const pessoa of [...MECANICOS, ...VENDEDORES]) {
      if (pessoa.usuario === null) continue;
      const usuario = USUARIOS_DEMO.find((u) => u.chave === pessoa.usuario);
      for (const empresa of pessoa.empresas) expect(usuario?.perfis).toHaveProperty(empresa);
    }
  });

  it("tabelas Balcão, Mecânico parceiro, Mercado Livre e E-commerce; uma padrão; preços fixos de SKUs existentes", () => {
    expect(TABELAS_PRECO.map((t) => t.nome)).toEqual(["Balcão", "Mecânico parceiro", "Mercado Livre", "E-commerce"]);
    expect(TABELAS_PRECO.filter((t) => t.padrao)).toHaveLength(1);
    for (const t of TABELAS_PRECO) {
      expect(paraDecimal(t.percentual).gt(-100)).toBe(true);
      for (const f of t.precosFixos) expect(codigosProduto.has(f.codigo)).toBe(true);
    }
  });
});

describe("empresas e canais", () => {
  it("2 empresas (Simples e Lucro Real) com CNPJ válido, um deles alfanumérico", () => {
    expect(EMPRESAS_DEMO.map((e) => e.regimeTributario).sort()).toEqual(["lucro_real", "simples_nacional"]);
    for (const e of EMPRESAS_DEMO) expect(validarCnpj(e.cnpj)).toEqual({ ok: true, valor: e.cnpj });
    expect(EMPRESAS_DEMO.some((e) => /[A-Z]/.test(e.cnpj))).toBe(true);
  });

  it("um dono nas duas empresas, mais balcão, estoque e mecânico; senhas só por variável de ambiente", () => {
    const dono = USUARIOS_DEMO.find((u) => u.chave === "dono");
    expect(dono?.perfis).toEqual({ simples: "dono", real: "dono" });
    expect(new Set(USUARIOS_DEMO.flatMap((u) => Object.values(u.perfis)))).toEqual(
      new Set(["dono", "balcao", "estoque", "mecanico"]),
    );
    for (const u of USUARIOS_DEMO) expect(u.variavelSenha).toMatch(/^SEED_SENHA_[A-Z]+$/);
    expect(repetidos(USUARIOS_DEMO.map((u) => u.email))).toEqual([]);
  });

  it("2 canais sem credenciais, com tabela existente e anúncios vinculados pelo SKU", () => {
    expect(CANAIS.map((c) => c.tipo).sort()).toEqual(["ecommerce", "mercado_livre"]);
    expect(CANAIS.find((c) => c.tipo === "mercado_livre")?.emissorFiscal).toBe("externo");
    for (const c of CANAIS) {
      expect(TABELAS_PRECO.some((t) => t.chave === c.tabelaPreco)).toBe(true);
      expect(repetidos(c.anuncios.map((a) => a.idExterno))).toEqual([]);
      expect(c.anuncios.filter((a) => codigosProduto.has(a.sku)).length).toBeGreaterThanOrEqual(4);
      expect(JSON.stringify(c.config)).not.toMatch(/token|segredo|secret|senha/i);
    }
  });
});

describe("tipos numéricos", () => {
  /** Chaves que podem ser `number`: contagens, anos, medidas inteiras e códigos. Nunca dinheiro, quantidade ou custo. */
  const NUMEROS_PERMITIDOS = new Set([
    "cilindrada",
    "ano",
    "anoInicial",
    "anoFinal",
    "kmAtual",
    "origem",
    "pesoG",
    "tempoEstimadoMin",
    "validade_orcamento_dias",
    "janela_agrupamento_segundos",
    "max_tentativas",
    "limite_requisicoes_por_minuto",
  ]);
  /** Chaves de valor decimal: sempre string no formato do `numeric`. */
  const DECIMAIS = /^(custo|custoUnitario|precoVenda|preco|precoPadrao|quantidade|estoqueMinimo|markup|markupPadrao|percentual|percentualComissao|comissaoValor|estoqueSeguranca|fator|centavos|aliq\w*|aliquota\w*|reducaoBaseIcms|mva|fcpSt)$/;

  function percorrer(valor: unknown, caminho: string, achados: string[]) {
    if (Array.isArray(valor)) {
      valor.forEach((v, i) => percorrer(v, `${caminho}[${i}]`, achados));
      return;
    }
    if (valor === null || typeof valor !== "object") return;
    for (const [chave, v] of Object.entries(valor)) {
      const aqui = `${caminho}.${chave}`;
      if (typeof v === "number" && !NUMEROS_PERMITIDOS.has(chave)) achados.push(`${aqui} é number`);
      if (DECIMAIS.test(chave) && v !== null && !(typeof v === "string" && DECIMAL.test(v))) {
        achados.push(`${aqui} não é texto decimal: ${JSON.stringify(v)}`);
      }
      percorrer(v, aqui, achados);
    }
  }

  it("nenhum valor monetário, quantidade ou custo como number em todos os dados exportados", () => {
    const achados: string[] = [];
    for (const [nome, valor] of Object.entries(dados)) {
      if (typeof valor !== "function") percorrer(valor, nome, achados);
    }
    expect(achados).toEqual([]);
  });
});
