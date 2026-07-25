/** Faixa dos diacríticos combinantes, escrita com escapes para não depender
 *  de caracteres invisíveis no código-fonte. */
const COMBINANTES = /[̀-ͯ]/g;

/**
 * Remove acentos e baixa a caixa. Usado para busca e para comparar rótulos
 * do portal, que oscilam entre "Pregão On-line" e "PREGAO ON-LINE".
 *
 * A decomposição NFD preserva os índices dos caracteres latinos
 * pré-compostos (à → a + combinante → a), então dá para casar expressões
 * na versão normalizada e recortar a original pelo mesmo offset.
 */
export function semAcento(texto: string): string {
  return texto.normalize("NFD").replace(COMBINANTES, "").toLowerCase();
}

export const NOMES_MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "março", "marco", "03-marco" → 3. O portal também grafa "feveiro". */
export function mesParaNumero(bruto: string | null | undefined): number | null {
  if (!bruto) return null;
  const limpo = semAcento(bruto).trim();

  const comNumero = limpo.match(/^(\d{1,2})\b/);
  if (comNumero) {
    const n = Number(comNumero[1]);
    if (n >= 1 && n <= 12) return n;
  }

  const tabela: Record<string, number> = {
    janeiro: 1,
    fevereiro: 2,
    feveiro: 2,
    marco: 3,
    abril: 4,
    maio: 5,
    junho: 6,
    julho: 7,
    agosto: 8,
    setembro: 9,
    outubro: 10,
    novembro: 11,
    dezembro: 12,
  };
  for (const [nome, n] of Object.entries(tabela)) {
    if (limpo.includes(nome)) return n;
  }
  return null;
}

/**
 * O caminho do portal carrega o mês: /portal/arquivo/19/2021/06-junho/...
 * A coluna `mes` do CSV vem vazia em 93% das linhas; a URL recupera ~9 mil.
 */
export function mesDaUrl(url: string): number | null {
  const m = url.match(/\/\d{4}\/(\d{2})-[^/]+\//);
  if (!m) return null;
  const n = Number(m[1]);
  return n >= 1 && n <= 12 ? n : null;
}

/** Mesmo caminho, para os arquivos que vieram sem a coluna `ano`. */
export function anoDaUrl(url: string): number | null {
  const m = url.match(/\/portal\/arquivo\/\d+\/(\d{4})\//);
  if (!m) return null;
  return anoValido(Number(m[1]));
}

export function anoValido(n: number): number | null {
  return Number.isInteger(n) && n >= 1990 && n <= 2100 ? n : null;
}

export function extensaoDaUrl(url: string): string | null {
  const m = url.match(/\.([a-z0-9]{2,5})(?:$|\?)/i);
  return m ? m[1].toLowerCase() : null;
}

export function nomeMes(n: number | null): string | null {
  if (n === null || n < 1 || n > 12) return null;
  return NOMES_MES[n - 1];
}

const FORMATO_INTEIRO = new Intl.NumberFormat("pt-BR");
const FORMATO_REAL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const FORMATO_REAL_EXATO = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function numero(n: number): string {
  return FORMATO_INTEIRO.format(n);
}

export function real(n: number | null): string {
  return n === null ? "—" : FORMATO_REAL.format(n);
}

/**
 * Igual a `real`, mas com os centavos. A camada de dinheiro precisa deles:
 * a hipótese da vírgula perdida (ver lib/dinheiro.ts) só fica legível quando
 * os centavos aparecem, e teto legal citado sem centavos parece arredondado.
 */
export function realExato(n: number | null): string {
  return n === null ? "—" : FORMATO_REAL_EXATO.format(n);
}

/** "R$1.184.760,00" → 1184760. Formato pt-BR: ponto milhar, vírgula decimal. */
export function valorParaNumero(bruto: string): number | null {
  const limpo = bruto
    .replace(/[^\d.,]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  if (!limpo) return null;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/**
 * Quebra a busca em grupos "OU" separados por `|`; dentro de cada grupo, as
 * palavras são "E". `"rio pomba | enchente"` acha "rio pomba" OU "enchente".
 * Sem `|` o comportamento é o de sempre: todas as palavras, todas E.
 *
 * Existe para os chips de tema do Lab (ver TEMAS_DO_LAB em BarraFiltros) e
 * para a busca no conteúdo (lib/conteudo.ts), mas fica exposta na própria
 * caixa de busca — o usuário vê exatamente o que está sendo comparado e
 * pode editar à mão.
 */
export function gruposDeBusca(termo: string): string[][] {
  return termo
    .split("|")
    .map((grupo) => semAcento(grupo).trim().split(/\s+/).filter(Boolean))
    .filter((grupo) => grupo.length > 0);
}

/**
 * Divide o texto nos trechos que casam com o termo, preservando a caixa
 * original. Compara sem acento, então "orcamento" acha "ORÇAMENTO". O `|`
 * (grupos "OU" da busca — ver gruposDeBusca acima) vira espaço aqui: para
 * grifo não importa E/OU, só quais palavras aparecem no texto.
 */
export function fatiarPorTermo(
  texto: string,
  termo: string,
): { trecho: string; destaque: boolean }[] {
  const alvo = semAcento(termo.replace(/\|/g, " ")).trim();
  const palavras = alvo.split(/\s+/).filter(Boolean);
  if (!palavras.length) return [{ trecho: texto, destaque: false }];

  const base = semAcento(texto);
  if (base.length !== texto.length) {
    // Fora do caso latino pré-composto os offsets deixam de bater; nesse
    // caso o texto sai inteiro, sem destaque, em vez de sair recortado errado.
    return [{ trecho: texto, destaque: false }];
  }

  const marcado = new Array<boolean>(texto.length).fill(false);
  for (const palavra of palavras) {
    let de = base.indexOf(palavra);
    while (de !== -1) {
      for (let i = de; i < de + palavra.length; i++) marcado[i] = true;
      de = base.indexOf(palavra, de + palavra.length);
    }
  }

  const partes: { trecho: string; destaque: boolean }[] = [];
  let inicio = 0;
  for (let i = 1; i <= texto.length; i++) {
    if (i === texto.length || marcado[i] !== marcado[inicio]) {
      partes.push({ trecho: texto.slice(inicio, i), destaque: marcado[inicio] });
      inicio = i;
    }
  }
  return partes;
}
