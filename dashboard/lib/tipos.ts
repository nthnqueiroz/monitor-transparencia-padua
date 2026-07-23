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
  categorias: Set<string>;
  secoes: Set<string>;
  anoDe: number;
  anoAte: number;
  /** Inclui documentos sem ano identificável no resultado. */
  incluirSemAno: boolean;
}
