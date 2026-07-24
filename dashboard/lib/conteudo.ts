import type { ConteudoDoc, IndiceConteudo, ResumoConteudo } from "./tipos";
import { gruposDeBusca, semAcento } from "./texto";

interface ArquivoConteudo {
  gerado_em: string;
  criterios: string[];
  limite: number;
  documentos: ConteudoDoc[];
}

/**
 * Lê dashboard/public/conteudo.json — o índice de texto extraído gerado por
 * textos/extrair_conteudo.py (ver textos/README.md).
 *
 * É opcional por natureza: se ninguém rodou a Etapa A ainda (ou o arquivo
 * não foi sincronizado com `npm run sync-conteudo`), devolve `null` em vez
 * de lançar erro — a busca no conteúdo fica indisponível, mas o resto do
 * painel (busca por título/seção, gráficos, matriz) segue funcionando.
 */
export async function carregarIndiceConteudo(
  sinal?: AbortSignal,
): Promise<IndiceConteudo | null> {
  let resposta: Response;
  try {
    resposta = await fetch("./conteudo.json", { signal: sinal });
  } catch {
    return null;
  }
  if (!resposta.ok) return null;

  let bruto: ArquivoConteudo;
  try {
    bruto = (await resposta.json()) as ArquivoConteudo;
  } catch {
    return null;
  }

  const porUrl = new Map<string, ConteudoDoc>();
  const normalizadoPorUrl = new Map<string, string>();
  const resumo: ResumoConteudo = {
    total: 0,
    comTexto: 0,
    precisaOcr: 0,
    erro: 0,
    semSuporte: 0,
  };

  for (const doc of bruto.documentos ?? []) {
    porUrl.set(doc.url, doc);
    resumo.total++;
    if (doc.texto) normalizadoPorUrl.set(doc.url, semAcento(doc.texto));

    if (doc.metodo === "nativo" || doc.metodo === "pagina_html" || doc.metodo === "ocr") {
      resumo.comTexto++;
    } else if (doc.metodo === "precisa_ocr") {
      resumo.precisaOcr++;
    } else if (doc.metodo === "erro") {
      resumo.erro++;
    } else if (doc.metodo === "formato_nao_suportado") {
      resumo.semSuporte++;
    }
  }

  return {
    geradoEm: bruto.gerado_em,
    criterios: bruto.criterios ?? [],
    porUrl,
    normalizadoPorUrl,
    resumo,
  };
}

export interface StatusConteudo {
  rotulo: string;
  tom: "indexado" | "pendente" | "ocr" | "erro";
}

/**
 * Status honesto por documento — "não finja que tudo está buscável". Sem
 * índice carregado (ninguém rodou a Etapa A ainda), todo documento cai em
 * "texto ainda não extraído".
 */
export function statusConteudo(url: string, indice: IndiceConteudo | null): StatusConteudo {
  const entrada = indice?.porUrl.get(url);
  if (!entrada) return { rotulo: "texto ainda não extraído", tom: "pendente" };

  switch (entrada.metodo) {
    case "precisa_ocr":
      return { rotulo: "escaneado — aguarda OCR", tom: "ocr" };
    case "formato_nao_suportado":
      return { rotulo: "formato não suportado", tom: "pendente" };
    case "erro":
      return { rotulo: "erro ao extrair", tom: "erro" };
    default:
      return { rotulo: "indexado", tom: "indexado" };
  }
}

const JANELA_TRECHO = 180;

/**
 * Recorta um trecho do texto em torno da 1ª ocorrência de qualquer palavra
 * da busca. `null` se o termo estiver vazio ou não bater em nada — o
 * chamador decide o que mostrar nesse caso (ex.: nada, ou um trecho neutro).
 */
export function gerarTrecho(
  entrada: ConteudoDoc,
  indice: IndiceConteudo,
  termo: string,
): string | null {
  const grupos = gruposDeBusca(termo);
  if (!grupos.length) return null;

  const normalizado = indice.normalizadoPorUrl.get(entrada.url);
  if (!normalizado) return null;

  let melhorIndice = -1;
  for (const grupo of grupos) {
    for (const palavra of grupo) {
      const idx = normalizado.indexOf(palavra);
      if (idx !== -1 && (melhorIndice === -1 || idx < melhorIndice)) melhorIndice = idx;
    }
  }
  if (melhorIndice === -1) return null;

  const texto = entrada.texto;
  const inicio = Math.max(0, melhorIndice - JANELA_TRECHO / 2);
  const fim = Math.min(texto.length, melhorIndice + JANELA_TRECHO / 2);
  const prefixo = inicio > 0 ? "…" : "";
  const sufixo = fim < texto.length ? "…" : "";
  return prefixo + texto.slice(inicio, fim).replace(/\s+/g, " ").trim() + sufixo;
}
