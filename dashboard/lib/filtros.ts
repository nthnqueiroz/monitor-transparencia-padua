import type { Doc, Filtros, IndiceConteudo } from "./tipos";
import { gruposDeBusca } from "./texto";

export function filtrosVazios(anoDe: number, anoAte: number): Filtros {
  return {
    termo: "",
    modoBusca: "titulo",
    categorias: new Set(),
    secoes: new Set(),
    anoDe,
    anoAte,
    incluirSemAno: true,
    soImplausiveis: false,
  };
}

export function temFiltroAtivo(f: Filtros, anoMin: number, anoMax: number): boolean {
  return (
    f.termo.trim() !== "" ||
    f.modoBusca === "conteudo" ||
    f.categorias.size > 0 ||
    f.secoes.size > 0 ||
    f.anoDe !== anoMin ||
    f.anoAte !== anoMax ||
    !f.incluirSemAno ||
    f.soImplausiveis
  );
}

/**
 * Filtra por categoria, seção, ano e busca. Em 18 mil linhas isso roda em
 * poucos milissegundos, então não vale a complexidade de manter um índice
 * invertido no v1.
 *
 * No modo "conteudo", a busca troca de alvo — título+seção vira o texto
 * extraído do documento (ver lib/conteudo.ts) — e só entram documentos que
 * já têm texto indexado. Sem índice carregado, o modo conteúdo não devolve
 * nada (é mais honesto que fingir cobertura que não existe).
 */
export function aplicarFiltros(
  docs: Doc[],
  f: Filtros,
  indiceConteudo: IndiceConteudo | null = null,
): Doc[] {
  const grupos = gruposDeBusca(f.termo);
  const filtraCategoria = f.categorias.size > 0;
  const filtraSecao = f.secoes.size > 0;
  const modoConteudo = f.modoBusca === "conteudo";

  const saida: Doc[] = [];
  for (const doc of docs) {
    if (filtraCategoria && !f.categorias.has(doc.categoria)) continue;
    if (filtraSecao && !f.secoes.has(doc.secao)) continue;
    // Recorte de pauta: só o que a regra de implausibilidade reprovou.
    if (f.soImplausiveis && !doc.valor?.implausivel) continue;

    if (doc.anoEfetivo === null) {
      if (!f.incluirSemAno) continue;
    } else if (doc.anoEfetivo < f.anoDe || doc.anoEfetivo > f.anoAte) {
      continue;
    }

    if (modoConteudo) {
      const normalizado = indiceConteudo?.normalizadoPorUrl.get(doc.url);
      if (normalizado === undefined) continue;
      if (
        grupos.length &&
        !grupos.some((palavras) => palavras.every((p) => normalizado.includes(p)))
      ) {
        continue;
      }
    } else if (grupos.length) {
      const casouAlgumGrupo = grupos.some((palavras) =>
        palavras.every((p) => doc.chaveBusca.includes(p)),
      );
      if (!casouAlgumGrupo) continue;
    }

    saida.push(doc);
  }
  return saida;
}

export interface Contagem {
  chave: string;
  total: number;
}

export function contarPorSecao(docs: Doc[]): Contagem[] {
  const mapa = new Map<string, number>();
  for (const d of docs) mapa.set(d.secao, (mapa.get(d.secao) ?? 0) + 1);
  return [...mapa]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);
}

export function contarPorCategoria(docs: Doc[]): Contagem[] {
  const mapa = new Map<string, number>();
  for (const d of docs) mapa.set(d.categoria, (mapa.get(d.categoria) ?? 0) + 1);
  return [...mapa]
    .map(([chave, total]) => ({ chave, total }))
    .sort((a, b) => b.total - a.total);
}

export interface PontoAno {
  ano: number;
  total: number;
}

export function contarPorAno(
  docs: Doc[],
  anoMin: number,
  anoMax: number,
): { serie: PontoAno[]; semAno: number } {
  const mapa = new Map<number, number>();
  let semAno = 0;
  for (const d of docs) {
    if (d.anoEfetivo === null) semAno++;
    else mapa.set(d.anoEfetivo, (mapa.get(d.anoEfetivo) ?? 0) + 1);
  }
  const serie: PontoAno[] = [];
  for (let ano = anoMin; ano <= anoMax; ano++) {
    serie.push({ ano, total: mapa.get(ano) ?? 0 });
  }
  return { serie, semAno };
}

export interface LinhaMatriz {
  secao: string;
  total: number;
  celulas: number[];
}

/**
 * Matriz seção × ano. É o que mostra onde a prefeitura publica e, sobretudo,
 * onde ela não publica — a ausência é o que interessa para pauta.
 */
export function montarMatriz(
  docs: Doc[],
  anoMin: number,
  anoMax: number,
): { anos: number[]; linhas: LinhaMatriz[]; maximo: number } {
  const anos: number[] = [];
  for (let a = anoMin; a <= anoMax; a++) anos.push(a);
  const indice = new Map(anos.map((a, i) => [a, i]));

  const porSecao = new Map<string, number[]>();
  const totais = new Map<string, number>();

  for (const d of docs) {
    let celulas = porSecao.get(d.secao);
    if (!celulas) {
      celulas = new Array<number>(anos.length).fill(0);
      porSecao.set(d.secao, celulas);
    }
    totais.set(d.secao, (totais.get(d.secao) ?? 0) + 1);
    if (d.anoEfetivo === null) continue;
    const i = indice.get(d.anoEfetivo);
    if (i !== undefined) celulas[i]++;
  }

  let maximo = 0;
  const linhas: LinhaMatriz[] = [...porSecao]
    .map(([secao, celulas]) => {
      for (const c of celulas) if (c > maximo) maximo = c;
      return { secao, celulas, total: totais.get(secao) ?? 0 };
    })
    .sort((a, b) => b.total - a.total);

  return { anos, linhas, maximo };
}

/** Documentos do período mais recente com data identificável. */
export function pegarRecentes(
  docs: Doc[],
  limite = 60,
): { itens: Doc[]; ano: number | null; mes: number | null } {
  const datados = docs.filter((d) => d.anoEfetivo !== null);
  if (!datados.length) return { itens: [], ano: null, mes: null };

  const ano = Math.max(...datados.map((d) => d.anoEfetivo as number));
  const doAno = datados.filter((d) => d.anoEfetivo === ano);

  const comMes = doAno.filter((d) => d.mes !== null);
  const mes = comMes.length ? Math.max(...comMes.map((d) => d.mes as number)) : null;

  const itens = [...doAno].sort((a, b) => (b.mes ?? 0) - (a.mes ?? 0));
  return { itens: itens.slice(0, limite), ano, mes };
}
