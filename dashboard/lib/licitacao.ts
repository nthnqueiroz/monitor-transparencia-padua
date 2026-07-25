import type { Licitacao } from "./tipos";
import { anoValido, semAcento, valorParaNumero } from "./texto";

/**
 * O portal entrega a licitação como uma linha de tabela achatada num único
 * campo `titulo`, sem separador:
 *
 *   EDITAL 024/2024 3026/2024 Pregão On-line EVENTUAL FORNECIMENTO DE
 *   MATERIAL DIDÁTICO 27/09/2024 R$1.844.659,10 R$1.844.659,10 Homologada
 *
 * A leitura é feita de trás para frente (status → valores → data), que é a
 * parte mais regular, e a modalidade serve de pivô entre cabeçalho e objeto.
 * O monitor corta o título em CORTE_TITULO_LICITACAO caracteres (hoje 600; era
 * 200 até 2026-07-25). Registro cortado perde o fim da linha, e nesses o parser
 * devolve o que conseguiu e deixa o resto nulo.
 */

const STATUS = [
  "Homologada",
  "Encerrada",
  "Publicada",
  "Republicada",
  "Remarcada",
  "Suspenso",
  "Suspensa",
  "Deserta",
  "Revogada",
  "Fracassada",
  "Cancelada",
  "Adjudicada",
  "Anulada",
  "Em andamento",
  "Aberta",
] as const;

/** Ordenadas por comprimento: "Pregão registro de preço" antes de "Pregão". */
const MODALIDADES = [
  "Pregão registro de preço",
  "Pregão registro de preços",
  "Pregão presencial",
  "Pregão eletrônico",
  "Pregão On-line",
  "Pregão online",
  "Concorrência Pública",
  "Concorrência",
  "Tomada de preços",
  "Tomada de preço",
  "Chamamento Público",
  "Chamada Pública",
  "Inexigibilidade",
  "Credenciamento",
  "Carta Convite",
  "Dispensa",
  "Concurso",
  "Leilão",
  "Convite",
  "Adesão",
  "Chamado",
].sort((a, b) => b.length - a.length);

const MODALIDADES_NORMALIZADAS = MODALIDADES.map((m) => ({
  exibicao: m,
  chave: semAcento(m),
}));

const RE_STATUS = new RegExp(`(?:^|\\s)(${STATUS.join("|")})\\s*$`, "i");
const RE_VALOR_FINAL = /(?:^|\s)(R\$\s*[\d.,]+|--)\s*$/;
const RE_DATA_FINAL = /(?:^|\s)(\d{2}\/\d{2}\/\d{4})\s*$/;
const RE_NUMERO_PROCESSO = /\d{1,5}[-/]\d{4}/g;

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

interface Pivo {
  inicio: number;
  fim: number;
  nome: string;
}

/** Primeira modalidade que aparece a partir de `apartirDe`. */
function buscarModalidade(base: string, apartirDe: number): Pivo | null {
  let melhor: Pivo | null = null;
  for (const { exibicao, chave } of MODALIDADES_NORMALIZADAS) {
    const inicio = base.indexOf(chave, apartirDe);
    if (inicio === -1) continue;
    // A mais à esquerda vence; empatando, a mais longa (a lista já vem
    // ordenada por comprimento, então a primeira a empatar é a mais longa).
    if (!melhor || inicio < melhor.inicio) {
      melhor = { inicio, fim: inicio + chave.length, nome: exibicao };
    }
  }
  return melhor;
}

/**
 * Localiza a modalidade que separa cabeçalho e objeto.
 *
 * Parte dos títulos repete a modalidade como rótulo antes dos números
 * ("INEXIGIBILIDADE 6260/2023 6260/2023 Inexigibilidade PRESTAÇÃO DE…").
 * Casar no rótulo deixaria o cabeçalho vazio e jogaria os números para
 * dentro do objeto, então quando não há dígito antes do primeiro casamento
 * o pivô avança para a ocorrência seguinte, se existir.
 */
function acharModalidade(texto: string): Pivo | null {
  const base = semAcento(texto);
  const primeiro = buscarModalidade(base, 0);
  if (!primeiro) return null;

  const temNumeroAntes = /\d/.test(base.slice(0, primeiro.inicio));
  if (temNumeroAntes) return primeiro;

  return buscarModalidade(base, primeiro.fim) ?? primeiro;
}

export function extrairLicitacao(titulo: string): Licitacao {
  let resto = titulo.trim();

  let status: string | null = null;
  const mStatus = resto.match(RE_STATUS);
  if (mStatus?.index !== undefined) {
    status = capitalizar(mStatus[1]);
    resto = resto.slice(0, mStatus.index).trim();
  }

  // Até dois valores no fim: estimado e homologado. "--" significa ausente.
  const valores: (number | null)[] = [];
  for (let i = 0; i < 2; i++) {
    const m = resto.match(RE_VALOR_FINAL);
    if (m?.index === undefined) break;
    valores.unshift(m[1] === "--" ? null : valorParaNumero(m[1]));
    resto = resto.slice(0, m.index).trim();
  }

  let dataSessao: string | null = null;
  const mData = resto.match(RE_DATA_FINAL);
  if (mData?.index !== undefined) {
    dataSessao = mData[1];
    resto = resto.slice(0, mData.index).trim();
  }

  const pivo = acharModalidade(resto);
  const cabecalho = pivo ? resto.slice(0, pivo.inicio) : resto;
  const modalidade = pivo?.nome ?? null;
  let objeto = pivo ? resto.slice(pivo.fim).trim() : "";

  // Sem modalidade identificada o objeto é tudo que sobrou depois dos números.
  if (!pivo) {
    objeto = resto.replace(/^[^A-Za-zÀ-ÿ]*/, "").trim();
  }

  const numeros = cabecalho.match(RE_NUMERO_PROCESSO) ?? [];
  const edital = numeros[0] ?? null;
  // Parte dos cabeçalhos traz o processo sem o ano ("031/2021 1943 Pregão…").
  // Como o cabeçalho termina na modalidade, pegar um número solto é seguro.
  const processo =
    numeros[1] ??
    (edital ? (cabecalho.match(/(?:^|\s)(\d{3,6})(?=\s|$)/)?.[1] ?? null) : null);

  const anoInferido =
    anoDeData(dataSessao) ??
    anoDeNumero(processo) ??
    anoDeNumero(edital) ??
    null;

  return {
    edital,
    processo,
    modalidade,
    objeto: objeto || titulo.trim(),
    dataSessao,
    valorEstimado: valores.length === 2 ? valores[0] : (valores[0] ?? null),
    valorHomologado: valores.length === 2 ? valores[1] : null,
    status,
    anoInferido,
  };
}

function anoDeData(data: string | null): number | null {
  if (!data) return null;
  return anoValido(Number(data.slice(-4)));
}

function anoDeNumero(numero: string | null): number | null {
  if (!numero) return null;
  const m = numero.match(/[-/](\d{4})$/);
  return m ? anoValido(Number(m[1])) : null;
}
