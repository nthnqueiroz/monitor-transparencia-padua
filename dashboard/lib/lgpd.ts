import type { MarcaSensivel } from "./tipos";

/**
 * Sinalização de dado pessoal (LGPD) — painel interno, ver CLAUDE.md.
 *
 * O CLAUDE.md pede para marcar a seção "FOLHA DE PAGAMENTO", mas ela não
 * existe no inventário: as 33 seções do portal não incluem folha. O dado
 * pessoal aparece no título dos atos de pessoal, espalhado por ATOS,
 * PORTARIAS, DECRETOS e pela seção do fundo previdenciário.
 *
 * As regras abaixo foram calibradas contra os títulos reais. Ficaram de fora,
 * de propósito, termos que na prática se referem a empresas e não a pessoas:
 * RESCISÃO e CESSÃO (contratos de uso da zona industrial), SUBSÍDIO (leis que
 * fixam o valor do cargo, sem nominar ninguém) e CONTRATAÇÃO TEMPORÁRIA (lei
 * autorizativa, também sem nomes).
 *
 * A marca é um aviso de cautela, não um veredito: como só há metadado, a
 * classificação erra para o lado de sinalizar demais. Para estreitar ou
 * ampliar o alcance, mexa só nesta lista.
 */

interface Regra {
  rotulo: string;
  detalhe: string;
  titulo?: RegExp;
  secao?: RegExp;
}

const REGRAS: Regra[] = [
  {
    rotulo: "Folha de pagamento",
    detalhe: "Folha de pagamento — nomes e valores individuais.",
    titulo:
      /FOLHA\s+DE\s+PAGAMENTO|FOLHA\s+SALARIAL|FOLHA\s+DE\s+(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)/i,
  },
  {
    rotulo: "Previdência",
    detalhe:
      "Fundo de aposentadoria e pensão — atos individuais de beneficiários.",
    titulo: /\bAPOSENTA|\bPENS[ÃA]O\b|\bPENSIONISTA/i,
    secao: /^FAP$/i,
  },
  {
    rotulo: "Ato de pessoal",
    detalhe: "Ato de nomeação, exoneração ou designação — nomina servidores.",
    titulo: /\bEXONERA|\bNOMEA|\bDESIGNA|\bADMISS[ÃA]O\b/i,
  },
  {
    rotulo: "Licença e afastamento",
    detalhe: "Licença ou afastamento de servidor — nomina a pessoa.",
    titulo:
      /\bVENCIMENTOS?\b|LICEN[ÇC]A\s+(SEM\s+VENCIMENTO|PR[ÊE]MIO|M[ÉE]DICA|MATERNIDADE|PATERNIDADE|PARA\s+TRATAR)/i,
  },
  {
    rotulo: "Remuneração",
    detalhe: "Remuneração individual de servidor.",
    titulo: /\bREMUNERA|\bCONTRACHEQUE|\bSAL[ÁA]RIO\b/i,
  },
];

export function marcarSensivel(
  titulo: string,
  secao: string,
): MarcaSensivel | null {
  for (const regra of REGRAS) {
    if (regra.secao?.test(secao) || regra.titulo?.test(titulo)) {
      return { rotulo: regra.rotulo, detalhe: regra.detalhe };
    }
  }
  return null;
}

export const ROTULOS_SENSIVEIS = REGRAS.map((r) => r.rotulo);
