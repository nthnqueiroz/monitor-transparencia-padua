import type { AvaliacaoValor, Doc, Licitacao, MotivoImplausivel } from "./tipos";
import { realExato, semAcento } from "./texto";

/**
 * Camada de dinheiro do painel.
 *
 * REGRA DE NEGÓCIO (decisão do Nathan, 2026-07-25): o critério de suspeita é a
 * REGRA DE IMPLAUSIBILIDADE, não a divergência título-vs-PDF. Ou seja, o painel
 * sinaliza valor incompatível com o tamanho do município mesmo quando não há um
 * PDF para conferir. São dois testes independentes:
 *
 *  1. TETO LEGAL DA MODALIDADE (primário). Binário, não depende de opinião: a
 *     modalidade declarada pelo próprio portal tem teto de valor na lei. Valor
 *     acima do teto é juridicamente impossível, a licitação teria que ter sido
 *     aberta em outra modalidade.
 *  2. TETO ORÇAMENTÁRIO (secundário). Pega o absurdo grosseiro que a modalidade
 *     não pega (pregão e concorrência não têm teto): valor de uma única
 *     licitação acima da receita anual inteira do município.
 *
 * ACHADO QUE MOTIVOU ISTO: os valores de licitação publicados no portal parecem
 * estar inflados exatamente 100x, por perda da vírgula decimal com um ",00"
 * grudado no fim (11.248.687,68 vira 1.124.868.768,00). Evidência: das 57
 * `Tomada de preço` com valor, 23 estouram o teto legal no valor cru e NENHUMA
 * estoura depois de dividir por 100.
 *
 * Por isso cada avaliação roda os dois testes DUAS vezes, no valor publicado e
 * no valor dividido por 100, e guarda a diferença:
 *  - `corrigePorEscala`: dividir por 100 zera todos os motivos. Leitura provável
 *    = erro de publicação do portal. Pauta sobre o portal.
 *  - `sobreviveAEscala`: continua implausível mesmo dividido. Aí a incompatibilidade
 *    é da própria licitação. Pauta sobre a licitação.
 * A distinção existe porque as duas coisas são pautas diferentes e não podem
 * aparecer misturadas na mesma lista.
 *
 * NEUTRALIDADE: o painel afirma incompatibilidade entre dois dados publicados
 * pela prefeitura (valor e modalidade), nunca irregularidade. Ou o valor está
 * errado, ou a modalidade está errada. Qual das duas é apuração, não é dado.
 */

/**
 * Receita realizada do município em 2024.
 * Fonte: Siconfi/Tesouro Nacional. Teto do teste secundário.
 */
export const RECEITA_MUNICIPAL_2024 = 272780223.2;

/** Divisor da hipótese de vírgula perdida. Ver o cabeçalho deste arquivo. */
export const FATOR_DE_ESCALA = 100;

/**
 * Tetos legais por modalidade: art. 23 da Lei 8.666/93, com os valores do
 * Decreto 9.412/2018 (em vigor desde 19/07/2018).
 *
 * DUAS ESCOLHAS CONSERVADORAS, de propósito, para o teste nunca acusar à toa:
 *
 *  a) Cada modalidade tem DOIS tetos na lei, um para obras e serviços de
 *     engenharia e outro, mais baixo, para compras e serviços comuns. O título
 *     da linha não diz com segurança em qual dos dois o objeto cai, então
 *     usamos sempre o MAIOR. Quem estoura o teto de obras estoura qualquer um.
 *  b) Antes de 19/07/2018 os tetos eram menores. Usar o teto atual para todos
 *     os anos subestima o número de casos, nunca superestima.
 *
 * Só entram aqui as modalidades cujo teto é estrutural. Ficam de fora, e não
 * são testadas pelo critério legal:
 *  - Concorrência e pregão: não têm teto de valor.
 *  - Dispensa e inexigibilidade: além do limite de valor do art. 24 I e II,
 *    existem dezenas de hipóteses (emergência, fornecedor único, etc.) sem
 *    teto nenhum. Testar por valor daria falso positivo em série.
 *  - Chamamento/chamada pública, credenciamento, adesão: não são modalidade
 *    licitatória com teto no art. 23.
 * Tomada de preços e convite não existem na Lei 14.133/2021, então a presença
 * do rótulo já indica processo regido pela 8.666.
 */
const TETOS_LEGAIS: { chave: string; teto: number }[] = [
  { chave: "tomada de precos", teto: 3300000 },
  { chave: "tomada de preco", teto: 3300000 },
  { chave: "carta convite", teto: 330000 },
  { chave: "convite", teto: 330000 },
];

function tetoLegal(modalidade: string | null): number | null {
  if (!modalidade) return null;
  const chave = semAcento(modalidade).trim();
  for (const t of TETOS_LEGAIS) {
    if (chave.includes(t.chave)) return t.teto;
  }
  return null;
}

function vezes(valor: number, teto: number): string {
  const n = valor / teto;
  return n >= 10 ? `${Math.round(n)}` : n.toFixed(1).replace(".", ",");
}

/** Roda os dois testes sobre um valor já em reais. */
function testar(valor: number, modalidade: string | null): MotivoImplausivel[] {
  const lista: MotivoImplausivel[] = [];

  const teto = tetoLegal(modalidade);
  if (teto !== null && valor > teto) {
    lista.push({
      tipo: "teto-legal",
      rotulo: "acima do teto da modalidade",
      teto,
      detalhe:
        `${modalidade} tem teto legal de ${realExato(teto)} ` +
        `(art. 23 da Lei 8.666/93, valores do Decreto 9.412/2018, teto de obras). ` +
        `O valor publicado é ${vezes(valor, teto)}x o teto: nessa faixa a lei exige ` +
        `outra modalidade. Ou o valor está errado, ou a modalidade está errada.`,
    });
  }

  if (valor > RECEITA_MUNICIPAL_2024) {
    lista.push({
      tipo: "teto-orcamentario",
      rotulo: "acima do orçamento anual",
      teto: RECEITA_MUNICIPAL_2024,
      detalhe:
        `A receita realizada do município em 2024 foi ${realExato(RECEITA_MUNICIPAL_2024)} ` +
        `(Siconfi). Esta licitação sozinha está publicada em ` +
        `${vezes(valor, RECEITA_MUNICIPAL_2024)}x o orçamento anual inteiro.`,
    });
  }

  return lista;
}

/**
 * Avalia o valor de uma licitação. Devolve null quando não há valor publicado
 * (o portal traz "--" em boa parte das linhas, e as de 2026 vêm com R$ 0,00),
 * porque ausência de valor é outro problema e tem outro selo.
 */
export function avaliarValor(lic: Licitacao | null): AvaliacaoValor | null {
  if (!lic) return null;

  // O portal repete o mesmo número nas duas colunas em praticamente todos os
  // casos observados, mas quando diverge o homologado é o que de fato saiu.
  const publicado = lic.valorHomologado ?? lic.valorEstimado;
  if (publicado === null || publicado <= 0) return null;

  const motivos = testar(publicado, lic.modalidade);
  const escalado = publicado / FATOR_DE_ESCALA;
  const motivosEscalado = motivos.length ? testar(escalado, lic.modalidade) : [];

  return {
    publicado,
    // Só oferece leitura provável quando há algo a explicar. Em valor que já
    // passa nos dois testes, dividir por 100 seria inventar problema.
    leituraProvavel: motivos.length ? escalado : null,
    implausivel: motivos.length > 0,
    motivos,
    corrigePorEscala: motivos.length > 0 && motivosEscalado.length === 0,
    sobreviveAEscala: motivosEscalado.length > 0,
    divergenciaEstimadoHomologado:
      lic.valorEstimado !== null &&
      lic.valorHomologado !== null &&
      lic.valorEstimado !== lic.valorHomologado,
  };
}

export interface ResumoDinheiro {
  /** Licitações no recorte atual. */
  licitacoes: number;
  /** Quantas trazem valor publicado. */
  comValor: number;
  /** Quantas falham em pelo menos um dos dois testes. */
  implausiveis: number;
  /** Falham no valor cru e passam divididas por 100: provável erro do portal. */
  corrigemPorEscala: number;
  /** Continuam implausíveis mesmo divididas: pauta sobre a própria licitação. */
  sobrevivemAEscala: number;
  porTetoLegal: number;
  porTetoOrcamentario: number;
  divergencias: number;
}

export function resumirDinheiro(docs: Doc[]): ResumoDinheiro {
  const r: ResumoDinheiro = {
    licitacoes: 0,
    comValor: 0,
    implausiveis: 0,
    corrigemPorEscala: 0,
    sobrevivemAEscala: 0,
    porTetoLegal: 0,
    porTetoOrcamentario: 0,
    divergencias: 0,
  };

  for (const d of docs) {
    if (d.categoria !== "licitacao") continue;
    r.licitacoes++;
    const v = d.valor;
    if (!v) continue;
    r.comValor++;
    if (v.divergenciaEstimadoHomologado) r.divergencias++;
    if (!v.implausivel) continue;
    r.implausiveis++;
    if (v.corrigePorEscala) r.corrigemPorEscala++;
    if (v.sobreviveAEscala) r.sobrevivemAEscala++;
    if (v.motivos.some((m) => m.tipo === "teto-legal")) r.porTetoLegal++;
    if (v.motivos.some((m) => m.tipo === "teto-orcamentario")) r.porTetoOrcamentario++;
  }

  return r;
}
