import { describe, expect, it } from "vitest";

import {
  CAPACIDADES,
  ErroAcessoNegado,
  MENSAGEM_MODULO_DESLIGADO,
  MENSAGEM_SEM_PERMISSAO,
  PERFIS,
  PERFIS_VEEM_CUSTO,
  exigirModulo,
  exigirPermissao,
  lerModulos,
  pode,
  verificarAcesso,
  veCusto,
  type Capacidade,
  type Perfil,
} from "./permissoes";

const capacidadesDo = (perfil: Perfil) => CAPACIDADES.filter((c) => pode(perfil, c));

describe("matriz de permissões (seção 3)", () => {
  it("o dono pode tudo", () => {
    expect(capacidadesDo("dono")).toEqual(CAPACIDADES);
  });

  it("só dono e estoque veem custo e margem", () => {
    expect([...PERFIS_VEEM_CUSTO].sort()).toEqual(["dono", "estoque"]);
    for (const perfil of PERFIS) {
      const esperado = perfil === "dono" || perfil === "estoque";
      expect(veCusto(perfil)).toBe(esperado);
      expect(pode(perfil, "margem.ver")).toBe(esperado);
    }
  });

  it("balcão: vendas, orçamentos, abrir OS, clientes, consultar produtos e saldos", () => {
    const pode_ = (c: Capacidade) => pode("balcao", c);
    for (const c of [
      "vendas.criar",
      "orcamentos.gerir",
      "os.abrir",
      "clientes.gerir",
      "produtos.consultar",
      "estoque.consultar",
    ] as const) {
      expect(pode_(c), c).toBe(true);
    }
    for (const c of ["custo.ver", "margem.ver", "estoque.ajustar", "vendas.cancelar", "produtos.gerir"] as const) {
      expect(pode_(c), c).toBe(false);
    }
  });

  it("estoque: produtos, entradas, ajustes, inventário e etiquetas; não cancela venda", () => {
    for (const c of [
      "produtos.gerir",
      "estoque.entrada",
      "estoque.ajustar",
      "inventario.gerir",
      "etiquetas.imprimir",
      "custo.ver",
    ] as const) {
      expect(pode("estoque", c), c).toBe(true);
    }
    expect(pode("estoque", "vendas.cancelar")).toBe(false);
    expect(pode("estoque", "vendas.criar")).toBe(false);
  });

  it("mecânico: só as próprias OS, status, itens da OS e os próprios ganhos", () => {
    expect(capacidadesDo("mecanico").sort()).toEqual(
      [
        "ganhos.ver_proprios",
        "os.lancar_itens",
        "os.mudar_status",
        "os.ver_proprias",
        "pecas_por_moto.consultar",
        "produtos.buscar_para_documento",
      ].sort(),
    );
    expect(pode("mecanico", "os.ver_todas")).toBe(false);
    expect(pode("mecanico", "vendas.consultar")).toBe(false);
  });

  it("só o dono cancela venda, altera código, edita comissão, configura canal e vê auditoria", () => {
    for (const c of [
      "vendas.cancelar",
      "produtos.alterar_codigo",
      "comissao.editar",
      "comissoes.acertar",
      "canais.configurar",
      "auditoria.ver",
      "desconto.autorizar",
      "configuracoes.gerir",
      "os.definir_comissao_servico_manual",
      "precos.alterar",
    ] as const) {
      expect(PERFIS.filter((p) => pode(p, c)), c).toEqual(["dono"]);
    }
  });

  it("busca de peças para lançar em documento (sem custo): balcão e mecânico; custo continua fechado", () => {
    expect(PERFIS.filter((p) => pode(p, "produtos.buscar_para_documento"))).toEqual(["dono", "balcao", "mecanico"]);
    expect(pode("mecanico", "produtos.consultar")).toBe(false);
    expect(veCusto("mecanico")).toBe(false);
    expect(veCusto("balcao")).toBe(false);
  });
});

describe("módulos (empresas.modulos)", () => {
  it("chave ausente, nula ou não booleana = desligada", () => {
    expect(lerModulos(null)).toEqual({
      balcao: false,
      os: false,
      fiscal: false,
      mercado_livre: false,
      ecommerce: false,
      estoque: false,
    });
    expect(lerModulos({ balcao: true, os: "true", fiscal: 1, extra: true })).toMatchObject({
      balcao: true,
      os: false,
      fiscal: false,
    });
  });
});

describe("checagens", () => {
  const ctx = (perfil: Perfil, modulos = {}) => ({ perfil, modulos: lerModulos(modulos) });

  it("exigirPermissao lança ErroAcessoNegado com o motivo", () => {
    expect(() => exigirPermissao(ctx("dono"), "vendas.cancelar")).not.toThrow();
    const erro = (() => {
      try {
        exigirPermissao(ctx("balcao"), "vendas.cancelar");
      } catch (e) {
        return e;
      }
    })();
    expect(erro).toBeInstanceOf(ErroAcessoNegado);
    expect(erro).toMatchObject({ motivo: "perfil", detalhe: "vendas.cancelar" });
  });

  it("exigirModulo barra módulo desligado mesmo para o dono", () => {
    expect(() => exigirModulo(ctx("dono"), "balcao")).toThrow(ErroAcessoNegado);
    expect(() => exigirModulo(ctx("dono", { balcao: true }), "balcao")).not.toThrow();
  });

  it("verificarAcesso confere o módulo antes do perfil", () => {
    expect(verificarAcesso(ctx("balcao"), { capacidade: "vendas.criar", modulo: "balcao" })).toBe(
      MENSAGEM_MODULO_DESLIGADO,
    );
    expect(verificarAcesso(ctx("mecanico", { balcao: true }), { capacidade: "vendas.criar", modulo: "balcao" })).toBe(
      MENSAGEM_SEM_PERMISSAO,
    );
    expect(verificarAcesso(ctx("balcao", { balcao: true }), { capacidade: "vendas.criar", modulo: "balcao" })).toBeNull();
  });
});
