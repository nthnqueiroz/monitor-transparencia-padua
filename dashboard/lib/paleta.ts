/**
 * Cores usadas pelos gráficos e a lógica de tom dos status.
 *
 * O Recharts recebe cor por prop, não por classe, então estes valores
 * espelham os tokens de `app/globals.css`. Mudou lá, mude aqui.
 *
 * Paleta oficial do Pádua Lab: blueprint (navy) + paper (offwhite quente) +
 * ink, com vermelho reservado só para LGPD e amarelo só para grifo de busca.
 *
 * A rampa sequencial (blueprint, claro → escuro) foi validada com o script
 * de paleta do guia de dataviz sobre a superfície #F3EFD9 (paper-100):
 * luminosidade monótona, degraus ≥ 0,06, ponta clara acima do piso de 2:1.
 */
export const PALETA = {
  superficie: "#F3EFD9",
  tinta: "#1C2A40",
  tinta2: "#2F3E55",
  tinta3: "#5C6776",
  grade: "#D6D3BA",
  eixo: "#5C6776",
  registro: "#143E7A",
  registroEscuro: "#08234A",
  registroTenue: "#DEE5EE",
  selo: "#D23A2B",
  verde: "#4F7A3A",
} as const;

/** Cinco degraus para a matriz de densidade — família blueprint. */
export const RAMPA = [
  "#95A4BB",
  "#7290B2",
  "#4B75A7",
  "#28538C",
  "#08234A",
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

/**
 * Tom do chip de status de licitação. Verde só para o desfecho positivo
 * (Homologada) — o vermelho do Lab é reservado para LGPD, então um status
 * problemático (deserta, revogada...) usa o realce azul, não vermelho.
 */
export function tomDoStatus(status: string): "sucesso" | "registro" | "neutro" {
  if (status === "Homologada") return "sucesso";
  if (["Deserta", "Fracassada", "Revogada", "Anulada", "Cancelada"].includes(status)) {
    return "registro";
  }
  return "neutro";
}
