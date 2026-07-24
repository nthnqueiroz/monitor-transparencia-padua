export type Categoria = "arquivo" | "licitacao" | "pagina";

/** Campos extraídos do título-blob de uma licitação. */
export interface Licitacao {
  edital: string | null;
  processo: string | null;
  modalidade: string | null;
  objeto: string;
  dataSessao: string | null; // dd/mm/aaaa, como publicado
  valorEstimado: number | null;
  valorHomologado: number | null;
  status: string | null;
  anoInferido: number | null;
}

/** Motivo pelo qual um documento foi sinalizado como sensível (LGPD). */
export interface MarcaSensivel {
  rotulo: string;
  detalhe: string;
}

/** Uma linha do inventory.csv, já normalizada e enriquecida. */
export interface Doc {
  id: number;
  categoria: Categoria;
  secao: string;
  ano: number | null;
  mes: number | null; // 1–12
  titulo: string;
  url: string;
  /** Ano da coluna, ou recuperado da URL / da data da licitação. */
  anoEfetivo: number | null;
  /** Extensão do arquivo, quando a URL revela. */
  extensao: string | null;
  /** O monitor trunca títulos em 200 caracteres. */
  truncado: boolean;
  sensivel: MarcaSensivel | null;
  licitacao: Licitacao | null;
  /** titulo + secao sem acento, minúsculo — usado pela busca. */
  chaveBusca: string;
}

export interface Inventario {
  docs: Doc[];
  secoes: string[];
  categorias: Categoria[];
  anoMin: number;
  anoMax: number;
  totalSensiveis: number;
}

export interface Filtros {
  termo: string;
  /** "titulo": busca em título+seção (padrão). "conteudo": busca no texto extraído dos PDFs. */
  modoBusca: "titulo" | "conteudo";
  categorias: Set<string>;
  secoes: Set<string>;
  anoDe: number;
  anoAte: number;
  /** Inclui documentos sem ano identificável no resultado. */
  incluirSemAno: boolean;
}

/**
 * Como o texto de um documento foi obtido — ver textos/extrair_conteudo.py.
 *  - nativo / pagina_html / ocr: tem texto de verdade, buscável.
 *  - precisa_ocr: PDF escaneado, sem camada de texto (Etapa B, futura).
 *  - formato_nao_suportado: doc/xlsx/jpg etc — fora do escopo do extrator.
 *  - erro: falha ao baixar ou extrair (ex.: link quebrado no portal).
 */
export type MetodoConteudo =
  | "nativo"
  | "pagina_html"
  | "ocr"
  | "precisa_ocr"
  | "formato_nao_suportado"
  | "erro";

/** Uma entrada do índice de conteúdo (dashboard/public/conteudo.json). */
export interface ConteudoDoc {
  url: string;
  metodo: MetodoConteudo;
  chars: number;
  paginas: number;
  truncado: boolean;
  sensivel: string | null;
  texto: string;
  erro: string | null;
  motivo?: string;
  processado_em?: string;
}

export interface ResumoConteudo {
  total: number;
  comTexto: number;
  precisaOcr: number;
  erro: number;
  semSuporte: number;
}

/** Índice de conteúdo já carregado e indexado por URL, pronto para busca. */
export interface IndiceConteudo {
  geradoEm: string;
  criterios: string[];
  porUrl: Map<string, ConteudoDoc>;
  /** Texto sem acento/caixa, pré-computado uma vez — evita renormalizar a cada busca. */
  normalizadoPorUrl: Map<string, string>;
  resumo: ResumoConteudo;
}
