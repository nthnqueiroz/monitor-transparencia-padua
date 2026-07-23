import Papa from "papaparse";
import { extrairLicitacao } from "./licitacao";
import { marcarSensivel } from "./lgpd";
import type { Categoria, Doc, Inventario } from "./tipos";
import {
  anoDaUrl,
  anoValido,
  extensaoDaUrl,
  mesDaUrl,
  mesParaNumero,
  semAcento,
} from "./texto";

/** O monitor corta o título nesse comprimento ao gerar o inventário. */
const CORTE_DO_MONITOR = 200;

interface LinhaCsv {
  categoria?: string;
  secao?: string;
  ano?: string;
  mes?: string;
  titulo?: string;
  url?: string;
}

const CATEGORIAS_CONHECIDAS: Categoria[] = ["arquivo", "licitacao", "pagina"];

function comoCategoria(bruto: string): Categoria {
  const c = bruto.trim().toLowerCase() as Categoria;
  return CATEGORIAS_CONHECIDAS.includes(c) ? c : "arquivo";
}

/**
 * Lê o inventário do `public/` e enriquece cada linha.
 *
 * Roda inteiro no navegador: são ~3,3 MB e ~18 mil linhas, o que o PapaParse
 * resolve em algumas centenas de milissegundos. Não há backend no v1.
 */
export async function carregarInventario(sinal?: AbortSignal): Promise<Inventario> {
  const resposta = await fetch("./inventory.csv", { signal: sinal });
  if (!resposta.ok) {
    throw new Error(
      `Não foi possível ler inventory.csv (HTTP ${resposta.status}). ` +
        `Rode "npm run sync-data" para copiar o arquivo da raiz do repositório.`,
    );
  }
  const texto = await resposta.text();

  const { data, errors } = Papa.parse<LinhaCsv>(texto, {
    header: true,
    skipEmptyLines: true,
  });
  if (!data.length) {
    const causa = errors[0]?.message ?? "arquivo vazio";
    throw new Error(`inventory.csv não produziu nenhuma linha (${causa}).`);
  }

  return montarInventario(data);
}

export function montarInventario(linhas: LinhaCsv[]): Inventario {
  const docs: Doc[] = [];
  const secoes = new Set<string>();
  const categorias = new Set<Categoria>();
  let anoMin = Infinity;
  let anoMax = -Infinity;
  let totalSensiveis = 0;

  for (const linha of linhas) {
    const url = linha.url?.trim();
    const titulo = linha.titulo?.trim();
    if (!url || !titulo) continue;

    const categoria = comoCategoria(linha.categoria ?? "");
    const secao = (linha.secao ?? "").trim() || "SEM SEÇÃO";
    const ano = anoValido(Number(linha.ano)) ?? null;

    const licitacao = categoria === "licitacao" ? extrairLicitacao(titulo) : null;

    // A coluna `ano` vem vazia em 1.648 linhas; o caminho da URL cobre os
    // arquivos e a data da sessão cobre as licitações.
    const anoEfetivo = ano ?? anoDaUrl(url) ?? licitacao?.anoInferido ?? null;
    // Idem para o mês, vazio em 93% das linhas.
    const mes = mesParaNumero(linha.mes) ?? mesDaUrl(url);

    const sensivel = marcarSensivel(titulo, secao);
    if (sensivel) totalSensiveis++;

    secoes.add(secao);
    categorias.add(categoria);
    if (anoEfetivo !== null) {
      if (anoEfetivo < anoMin) anoMin = anoEfetivo;
      if (anoEfetivo > anoMax) anoMax = anoEfetivo;
    }

    docs.push({
      id: docs.length,
      categoria,
      secao,
      ano,
      mes,
      titulo,
      url,
      anoEfetivo,
      extensao: extensaoDaUrl(url),
      truncado: titulo.length >= CORTE_DO_MONITOR,
      sensivel,
      licitacao,
      // O objeto da licitação é mais buscável que o título-blob, mas o blob
      // também entra para não perder número de edital e status.
      chaveBusca: semAcento(`${titulo} ${secao}`),
    });
  }

  const anoAtual = new Date().getFullYear();
  return {
    docs,
    secoes: [...secoes].sort((a, b) => a.localeCompare(b, "pt-BR")),
    categorias: [...categorias].sort(),
    anoMin: Number.isFinite(anoMin) ? anoMin : anoAtual,
    anoMax: Number.isFinite(anoMax) ? anoMax : anoAtual,
    totalSensiveis,
  };
}
