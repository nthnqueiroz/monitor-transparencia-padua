/**
 * Cores usadas pelos gráficos.
 *
 * O Recharts recebe cor por prop, não por classe, então estes valores
 * espelham os tokens de `app/globals.css`. Mudou lá, mude aqui.
 *
 * A rampa é sequencial de matiz único (azul, claro → escuro), validada
 * com o script de paleta do guia de dataviz sobre a superfície #FAFBFC:
 * luminosidade monótona, degraus ≥ 0,06 e desvio de matiz de 5°.
 */
export const PALETA = {
  superficie: "#FAFBFC",
  tinta: "#12161C",
  tinta2: "#4A5563",
  tinta3: "#7A8595",
  grade: "#E4E9EF",
  eixo: "#C6CED8",
  registro: "#2A5A9C",
  registroEscuro: "#1B4B84",
  registroTenue: "#EAF1F9",
  selo: "#B45309",
} as const;

/** Cinco degraus para a matriz de densidade. */
export const RAMPA = [
  "#CFE0F2",
  "#9EC1E6",
  "#6598D2",
  "#356FB0",
  "#1B4B84",
] as const;

/**
 * Corta os valores diferentes de zero em cinco faixas por quantil.
 * Quantil, e não faixa linear, porque a distribuição é muito assimétrica:
 * ATOS tem centenas por ano e Defesa Civil tem um documento no total.
 */
export function limiaresDeDensidade(valores: number[]): number[] {
  const naoZero = valores.filter((v) => v > 0).sort((a, b) => a - b);
  if (!naoZero.length) return [1, 2, 3, 4];

  const emQuantil = (q: number) =>
    naoZero[Math.min(naoZero.length - 1, Math.floor(q * naoZero.length))];

  // Estritamente crescentes, para que faixas repetidas não engulam degraus.
  const brutos = [emQuantil(0.2), emQuantil(0.4), emQuantil(0.6), emQuantil(0.8)];
  const limpos: number[] = [];
  for (const v of brutos) {
    const anterior = limpos[limpos.length - 1] ?? 0;
    limpos.push(Math.max(v, anterior + 1));
  }
  return limpos;
}

/** Índice do degrau (0–4) para um valor, dados os quatro limiares. */
export function degrauDeDensidade(valor: number, limiares: number[]): number {
  for (let i = 0; i < limiares.length; i++) {
    if (valor <= limiares[i]) return i;
  }
  return limiares.length;
}
