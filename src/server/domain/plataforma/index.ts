/**
 * Esquemas da área `/admin` e do `scripts/criar-tenant.ts` (fatia 0.10):
 * tenant, empresa, módulos e convite do dono.
 *
 * Arquivo puro (só Zod e o domínio de documentos): o mesmo esquema vale no
 * formulário (zodResolver), na server action e no script. Nenhum esquema
 * aceita `tenantId`/`empresaId`: o alvo das actions do admin é um argumento
 * separado, validado como uuid e conferido no banco (tenant da empresa).
 *
 * Os campos de texto entram e saem como `string` (sem `transform` que mude o
 * tipo), para o formulário e a action usarem o mesmo tipo. Campo opcional
 * vazio chega como `""` e vira `null` no serviço (`textoOuNulo`).
 */
import { z } from "zod";

import { normalizarCnpj, validarCnpj } from "../documentos";

export const REGIMES_TRIBUTARIOS = ["simples_nacional", "lucro_presumido", "lucro_real"] as const;
export type RegimeTributario = (typeof REGIMES_TRIBUTARIOS)[number];

export const ROTULO_REGIME: Record<RegimeTributario, string> = {
  simples_nacional: "Simples Nacional",
  lucro_presumido: "Lucro Presumido",
  lucro_real: "Lucro Real",
};

export const STATUS_TENANT = ["ativo", "suspenso"] as const;
export type StatusTenant = (typeof STATUS_TENANT)[number];

/** Módulos de `empresas.modulos` (modelo 11.2), na ordem da tela. */
export const MODULOS_EMPRESA = ["balcao", "os", "fiscal", "mercado_livre", "ecommerce", "estoque"] as const;
export type ModuloEmpresa = (typeof MODULOS_EMPRESA)[number];

export const ROTULO_MODULO: Record<ModuloEmpresa, string> = {
  balcao: "Balcão",
  os: "Ordens de serviço",
  fiscal: "Fiscal (Focus NFe)",
  mercado_livre: "Mercado Livre",
  ecommerce: "E-commerce",
  estoque: "Estoque (virada)",
};

/** Código IBGE de cada UF: os 2 primeiros dígitos do código do município. */
export const CODIGO_IBGE_UF = {
  RO: "11", AC: "12", AM: "13", RR: "14", PA: "15", AP: "16", TO: "17",
  MA: "21", PI: "22", CE: "23", RN: "24", PB: "25", PE: "26", AL: "27", SE: "28", BA: "29",
  MG: "31", ES: "32", RJ: "33", SP: "35",
  PR: "41", SC: "42", RS: "43",
  MS: "50", MT: "51", GO: "52", DF: "53",
} as const;
export type Uf = keyof typeof CODIGO_IBGE_UF;
export const UFS = Object.keys(CODIGO_IBGE_UF).sort() as Uf[];

const ehUf = (valor: string): valor is Uf => Object.hasOwn(CODIGO_IBGE_UF, valor);

/** `""` (ou só espaços) vira `null`; o resto, aparado. */
export function textoOuNulo(valor: string | null | undefined): string | null {
  const limpo = (valor ?? "").trim();
  return limpo === "" ? null : limpo;
}

// ---------------------------------------------------------------------------
// Tenant
// ---------------------------------------------------------------------------

export const esquemaNovoTenant = z.object({
  nome: z
    .string()
    .trim()
    .min(2, "Informe o nome do cliente (tenant), com pelo menos 2 letras.")
    .max(120, "Use no máximo 120 caracteres."),
});
export type NovoTenant = z.infer<typeof esquemaNovoTenant>;

export const esquemaStatusTenant = z.enum(STATUS_TENANT, "Status inválido.");

// ---------------------------------------------------------------------------
// Empresa
// ---------------------------------------------------------------------------

export const esquemaNovaEmpresa = z
  .object({
    razaoSocial: z
      .string()
      .trim()
      .min(2, "Informe a razão social.")
      .max(150, "Use no máximo 150 caracteres."),
    nomeFantasia: z.string().trim().max(120, "Use no máximo 120 caracteres."),
    /** Numérico ou alfanumérico (regra 4.12); sai sem máscara, em maiúsculas. */
    cnpj: z
      .string()
      .trim()
      .min(1, "Informe o CNPJ.")
      .max(20, "CNPJ grande demais.")
      .superRefine((valor, contexto) => {
        if (valor === "") return; // o `min(1)` já deu a mensagem
        const resultado = validarCnpj(valor);
        if (!resultado.ok) contexto.addIssue({ code: "custom", message: resultado.mensagem });
      })
      .transform(normalizarCnpj),
    regimeTributario: z.enum(REGIMES_TRIBUTARIOS, "Escolha o regime tributário."),
    uf: z
      .string()
      .trim()
      .toUpperCase()
      .refine((valor: string) => valor === "" || Object.hasOwn(CODIGO_IBGE_UF, valor), "UF inválida."),
    codigoIbgeMunicipio: z
      .string()
      .trim()
      .refine((valor) => valor === "" || /^\d{7}$/.test(valor), "O código IBGE do município tem 7 números."),
  })
  .superRefine((empresa, contexto) => {
    const { uf, codigoIbgeMunicipio: ibge } = empresa;
    if (ibge !== "" && uf === "") {
      contexto.addIssue({
        code: "custom",
        path: ["uf"],
        message: "Informe a UF junto com o código IBGE do município.",
      });
      return;
    }
    if (ibge !== "" && ehUf(uf) && !ibge.startsWith(CODIGO_IBGE_UF[uf])) {
      contexto.addIssue({
        code: "custom",
        path: ["codigoIbgeMunicipio"],
        message: `O código IBGE de um município de ${uf} começa com ${CODIGO_IBGE_UF[uf]}.`,
      });
    }
  });
export type NovaEmpresa = z.infer<typeof esquemaNovaEmpresa>;

export const esquemaAlterarModulo = z.object({
  modulo: z.enum(MODULOS_EMPRESA, "Módulo desconhecido."),
  ligado: z.boolean("Informe se o módulo fica ligado."),
});
export type AlterarModulo = z.infer<typeof esquemaAlterarModulo>;

// ---------------------------------------------------------------------------
// Convite do dono
// ---------------------------------------------------------------------------

const esquemaEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Informe o e-mail.")
  .max(254, "E-mail grande demais.")
  .pipe(z.email("E-mail inválido."));

/**
 * Convite do dono (D033): só o e-mail. Nome e senha são definidos pelo próprio
 * convidado ao abrir o link.
 */
export const esquemaConviteDono = z.object({ email: esquemaEmail });
export type ConviteDono = z.infer<typeof esquemaConviteDono>;

/** Id de tenant/empresa recebido pelas actions do admin (alvo, não contexto). */
export const esquemaIdAlvo = z.uuid("Registro inválido.");

// ---------------------------------------------------------------------------
// Aceite do convite por quem ainda não tem conta (página /convite/[token])
// ---------------------------------------------------------------------------

/** Mesma política de `emailAndPassword` do Better Auth (D027); um teste confere. */
export const SENHA_MINIMO = 10;
export const SENHA_MAXIMO = 128;

export const esquemaSenhaNova = z
  .string()
  .min(SENHA_MINIMO, `A senha precisa ter pelo menos ${SENHA_MINIMO} caracteres.`)
  .max(SENHA_MAXIMO, `A senha pode ter no máximo ${SENHA_MAXIMO} caracteres.`);

export const esquemaAceiteNovaConta = z
  .object({
    nome: z.string().trim().min(2, "Informe o seu nome.").max(120, "Use no máximo 120 caracteres."),
    senha: esquemaSenhaNova,
    confirmacao: z.string(),
  })
  .refine((dados) => dados.senha === dados.confirmacao, {
    path: ["confirmacao"],
    message: "A confirmação não é igual à senha.",
  });
export type AceiteNovaConta = z.infer<typeof esquemaAceiteNovaConta>;

/** Troca de senha na tela "Minha conta" (rota `/change-password` do Better Auth). */
export const esquemaTrocaSenha = z
  .object({
    senhaAtual: z.string().min(1, "Digite a senha atual."),
    novaSenha: esquemaSenhaNova,
    confirmacao: z.string(),
  })
  .refine((dados) => dados.novaSenha === dados.confirmacao, {
    path: ["confirmacao"],
    message: "A confirmação não é igual à nova senha.",
  })
  .refine((dados) => dados.novaSenha !== dados.senhaAtual, {
    path: ["novaSenha"],
    message: "A nova senha precisa ser diferente da atual.",
  });
export type TrocaSenha = z.infer<typeof esquemaTrocaSenha>;

// ---------------------------------------------------------------------------
// Plano do `scripts/criar-tenant.ts` (arquivo JSON ou argumentos)
// ---------------------------------------------------------------------------

const esquemaArquivoPlano = z
  .object({
    tenant: z.string(),
    empresas: z
      .array(
        z
          .object({
            razaoSocial: z.string(),
            nomeFantasia: z.string().default(""),
            cnpj: z.string(),
            regimeTributario: z.string(),
            uf: z.string().default(""),
            codigoIbgeMunicipio: z.string().default(""),
            /** Módulos a ligar já na criação. Padrão: nenhum (regra 4.1). */
            modulos: z.array(z.enum(MODULOS_EMPRESA, "Módulo desconhecido.")).default([]),
          })
          .strict(),
      )
      .min(1, "Informe pelo menos uma empresa.")
      .max(20, "No máximo 20 empresas por vez."),
    /** `nome` é aceito por compatibilidade e ignorado: o dono define o nome no convite. */
    dono: z.object({ nome: z.string().optional(), email: z.string() }).strict(),
  })
  .strict();

export type PlanoTenant = {
  tenant: NovoTenant;
  empresas: (NovaEmpresa & { modulos: ModuloEmpresa[] })[];
  dono: ConviteDono;
};

export type ResultadoPlano = { ok: true; plano: PlanoTenant } | { ok: false; erros: string[] };

function errosComCaminho(prefixo: string, erro: z.ZodError): string[] {
  return erro.issues.map((issue) => {
    const caminho = [prefixo, ...issue.path.map(String)].filter(Boolean).join(".");
    return caminho ? `${caminho}: ${issue.message}` : issue.message;
  });
}

/**
 * Valida o plano do script `criar-tenant` com os mesmos esquemas do `/admin`
 * e devolve todos os erros de uma vez (com o caminho do campo no JSON).
 * CNPJs repetidos dentro do próprio plano também são recusados.
 */
export function validarPlanoTenant(entrada: unknown): ResultadoPlano {
  const arquivo = esquemaArquivoPlano.safeParse(entrada);
  if (!arquivo.success) return { ok: false, erros: errosComCaminho("", arquivo.error) };

  const erros: string[] = [];
  const tenant = esquemaNovoTenant.safeParse({ nome: arquivo.data.tenant });
  if (!tenant.success) erros.push(...errosComCaminho("tenant", tenant.error));
  const dono = esquemaConviteDono.safeParse({ email: arquivo.data.dono.email });
  if (!dono.success) erros.push(...errosComCaminho("dono", dono.error));

  const empresas: PlanoTenant["empresas"] = [];
  const cnpjs = new Map<string, number>();
  arquivo.data.empresas.forEach(({ modulos, ...dados }, indice) => {
    const empresa = esquemaNovaEmpresa.safeParse(dados);
    if (!empresa.success) {
      erros.push(...errosComCaminho(`empresas.${indice}`, empresa.error));
      return;
    }
    const repetida = cnpjs.get(empresa.data.cnpj);
    if (repetida !== undefined) {
      erros.push(`empresas.${indice}.cnpj: CNPJ repetido no plano (igual ao da empresas.${repetida}).`);
      return;
    }
    cnpjs.set(empresa.data.cnpj, indice);
    empresas.push({ ...empresa.data, modulos: [...new Set(modulos)] });
  });

  if (erros.length > 0 || !tenant.success || !dono.success) return { ok: false, erros };
  return { ok: true, plano: { tenant: tenant.data, empresas, dono: dono.data } };
}

// ---------------------------------------------------------------------------
// Origem do aceite do convite (auditoria `convite_aceito`)
// ---------------------------------------------------------------------------

function octetoValido(parte: string): boolean {
  return /^\d{1,3}$/.test(parte) && Number(parte) <= 255;
}

function ipv4Truncado(ip: string): string | null {
  const partes = ip.split(".");
  if (partes.length !== 4 || !partes.every(octetoValido)) return null;
  return `${Number(partes[0])}.${Number(partes[1])}.${Number(partes[2])}.0/24`;
}

/** Os 8 grupos de um IPv6 (com `::` expandido), ou `null` se não for IPv6 válido. */
function gruposIpv6(ip: string): string[] | null {
  const metades = ip.split("::");
  if (metades.length > 2) return null;
  const grupos = (texto: string) => (texto === "" ? [] : texto.split(":"));
  const inicio = grupos(metades[0]!);
  const fim = metades.length === 2 ? grupos(metades[1]!) : [];
  const faltam = 8 - inicio.length - fim.length;
  if (metades.length === 2 ? faltam < 1 : faltam !== 0) return null;
  const todos = [...inicio, ...Array<string>(metades.length === 2 ? faltam : 0).fill("0"), ...fim];
  return todos.every((g) => /^[0-9a-f]{1,4}$/i.test(g)) ? todos : null;
}

/**
 * IP truncado para a auditoria (LGPD: guarda a rede, não o endereço): /24 no
 * IPv4 (`203.0.113.0/24`) e /48 no IPv6 (`2001:db8:abcd::/48`). IPv4 mapeado
 * em IPv6 (`::ffff:a.b.c.d`) vira IPv4. Inválido ou ausente → `null`.
 */
export function truncarIp(ip: string | null | undefined): string | null {
  const texto = (ip ?? "").trim();
  if (!texto) return null;
  if (texto.includes(".")) {
    const mapeado = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(texto);
    return ipv4Truncado(mapeado ? mapeado[1]! : texto);
  }
  const grupos = gruposIpv6(texto);
  if (!grupos) return null;
  return `${grupos
    .slice(0, 3)
    .map((g) => parseInt(g, 16).toString(16))
    .join(":")}::/48`;
}

export const TAMANHO_MAXIMO_USER_AGENT = 120;

/** User-agent abreviado para a auditoria: sem caracteres de controle, espaços colapsados, até 120 caracteres. */
export function abreviarUserAgent(ua: string | null | undefined): string | null {
  const limpo = (ua ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!limpo) return null;
  return limpo.length <= TAMANHO_MAXIMO_USER_AGENT ? limpo : `${limpo.slice(0, TAMANHO_MAXIMO_USER_AGENT - 1)}…`;
}
