/**
 * Referência global de motos (`marcas_moto` e `modelos_moto`, sem empresa; regra 4.1):
 * ~30 modelos populares no Brasil (seção 8). Cilindrada em cc (inteiro, não é valor
 * monetário). A `chave` é estável e é por ela que as aplicações das peças e as motos
 * dos clientes apontam para o modelo.
 */

export const MARCAS_MOTO = [
  "Honda",
  "Yamaha",
  "Suzuki",
  "Kawasaki",
  "Royal Enfield",
  "Shineray",
  "Haojue",
] as const;
export type MarcaMoto = (typeof MARCAS_MOTO)[number];

export interface ModeloMotoSeed {
  chave: string;
  marca: MarcaMoto;
  nome: string;
  cilindrada: number;
}

export const MODELOS_MOTO = [
  // Honda
  { chave: "honda-cg-160-titan", marca: "Honda", nome: "CG 160 Titan", cilindrada: 162 },
  { chave: "honda-cg-160-fan", marca: "Honda", nome: "CG 160 Fan", cilindrada: 162 },
  { chave: "honda-cg-160-start", marca: "Honda", nome: "CG 160 Start", cilindrada: 162 },
  { chave: "honda-cg-150-titan", marca: "Honda", nome: "CG 150 Titan", cilindrada: 149 },
  { chave: "honda-cg-125-fan", marca: "Honda", nome: "CG 125 Fan", cilindrada: 124 },
  { chave: "honda-biz-125", marca: "Honda", nome: "Biz 125", cilindrada: 124 },
  { chave: "honda-biz-110i", marca: "Honda", nome: "Biz 110i", cilindrada: 109 },
  { chave: "honda-pop-110i", marca: "Honda", nome: "Pop 110i", cilindrada: 109 },
  { chave: "honda-bros-160", marca: "Honda", nome: "NXR 160 Bros", cilindrada: 162 },
  { chave: "honda-xre-300", marca: "Honda", nome: "XRE 300", cilindrada: 291 },
  { chave: "honda-cb-300f-twister", marca: "Honda", nome: "CB 300F Twister", cilindrada: 293 },
  { chave: "honda-cb-250f-twister", marca: "Honda", nome: "CB 250F Twister", cilindrada: 249 },
  { chave: "honda-pcx-160", marca: "Honda", nome: "PCX 160", cilindrada: 156 },
  { chave: "honda-elite-125", marca: "Honda", nome: "Elite 125", cilindrada: 124 },
  // Yamaha
  { chave: "yamaha-factor-150", marca: "Yamaha", nome: "Factor 150", cilindrada: 149 },
  { chave: "yamaha-fazer-150", marca: "Yamaha", nome: "Fazer 150", cilindrada: 149 },
  { chave: "yamaha-fazer-250", marca: "Yamaha", nome: "Fazer 250", cilindrada: 249 },
  { chave: "yamaha-lander-250", marca: "Yamaha", nome: "Lander 250", cilindrada: 249 },
  { chave: "yamaha-crosser-150", marca: "Yamaha", nome: "Crosser 150", cilindrada: 149 },
  { chave: "yamaha-nmax-160", marca: "Yamaha", nome: "NMax 160", cilindrada: 155 },
  { chave: "yamaha-mt-03", marca: "Yamaha", nome: "MT-03", cilindrada: 321 },
  // Suzuki
  { chave: "suzuki-yes-125", marca: "Suzuki", nome: "Yes 125", cilindrada: 124 },
  { chave: "suzuki-intruder-125", marca: "Suzuki", nome: "Intruder 125", cilindrada: 124 },
  { chave: "suzuki-v-strom-650", marca: "Suzuki", nome: "V-Strom 650", cilindrada: 645 },
  // Kawasaki
  { chave: "kawasaki-ninja-400", marca: "Kawasaki", nome: "Ninja 400", cilindrada: 399 },
  { chave: "kawasaki-z400", marca: "Kawasaki", nome: "Z400", cilindrada: 399 },
  // Royal Enfield
  { chave: "royal-enfield-meteor-350", marca: "Royal Enfield", nome: "Meteor 350", cilindrada: 349 },
  { chave: "royal-enfield-classic-350", marca: "Royal Enfield", nome: "Classic 350", cilindrada: 349 },
  { chave: "royal-enfield-hunter-350", marca: "Royal Enfield", nome: "Hunter 350", cilindrada: 349 },
  { chave: "royal-enfield-himalayan-411", marca: "Royal Enfield", nome: "Himalayan 411", cilindrada: 411 },
  // Shineray
  { chave: "shineray-jet-50", marca: "Shineray", nome: "Jet 50", cilindrada: 49 },
  { chave: "shineray-worker-125", marca: "Shineray", nome: "Worker 125", cilindrada: 125 },
  // Haojue
  { chave: "haojue-dk-150", marca: "Haojue", nome: "DK 150", cilindrada: 149 },
  { chave: "haojue-chopper-road-150", marca: "Haojue", nome: "Chopper Road 150", cilindrada: 149 },
] as const satisfies readonly ModeloMotoSeed[];

export type ChaveModeloMoto = (typeof MODELOS_MOTO)[number]["chave"];
