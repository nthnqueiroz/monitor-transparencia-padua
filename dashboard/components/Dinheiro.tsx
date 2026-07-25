"use client";

import { useMemo } from "react";
import { Ficha, TituloFicha } from "./primitivos";
import { RECEITA_MUNICIPAL_2024, resumirDinheiro } from "@/lib/dinheiro";
import { numero, realExato } from "@/lib/texto";
import type { Doc } from "@/lib/tipos";

/**
 * Camada de dinheiro, visão de conjunto.
 *
 * O painel é ferramenta de pauta interna (decisão de 2026-07-24), então esta
 * ficha não é um "total gasto pela prefeitura". Ela responde a outra pergunta,
 * que é a pergunta de pauta: quantos valores publicados não sobrevivem a um
 * teste objetivo, e de que tipo é cada falha.
 *
 * A separação entre as duas linhas do meio é o achado editorial:
 *  - "corrigem dividindo por 100" aponta para defeito de publicação do portal,
 *    e a pauta é sobre o portal.
 *  - "sobrevivem à divisão" aponta para incompatibilidade dentro da própria
 *    licitação, e a pauta é sobre a licitação.
 * Somar as duas num número só apagaria justamente a distinção que interessa.
 */
export function Dinheiro({
  docs,
  aoFiltrarImplausiveis,
}: {
  docs: Doc[];
  aoFiltrarImplausiveis: () => void;
}) {
  const r = useMemo(() => resumirDinheiro(docs), [docs]);

  if (!r.licitacoes) return null;

  return (
    <Ficha>
      <TituloFicha
        auxiliar={`${numero(r.comValor)} de ${numero(r.licitacoes)} licitações trazem valor`}
      >
        Valores e implausibilidade
      </TituloFicha>

      <div className="p-4">
        {r.comValor === 0 ? (
          <p className="text-[13px] text-tinta-3">
            Nenhuma licitação do recorte atual traz valor publicado.
          </p>
        ) : (
          <>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Metrica
                rotulo="Valores reprovados"
                valor={r.implausiveis}
                de={r.comValor}
                nota="Falham em pelo menos um dos dois testes."
              />
              <Metrica
                rotulo="Acima do teto da modalidade"
                valor={r.porTetoLegal}
                de={r.comValor}
                nota="Teste primário: art. 23 da Lei 8.666/93, valores do Decreto 9.412/2018."
              />
              <Metrica
                rotulo="Corrigem dividindo por 100"
                valor={r.corrigemPorEscala}
                de={r.implausiveis || 1}
                nota="Provável vírgula decimal perdida na publicação. Pauta sobre o portal."
              />
              <Metrica
                rotulo="Sobrevivem à divisão"
                valor={r.sobrevivemAEscala}
                de={r.implausiveis || 1}
                nota="Continuam incompatíveis mesmo divididos. Pauta sobre a licitação."
              />
            </dl>

            <p className="mt-4 border-t border-linha pt-3 text-[12px] leading-relaxed text-tinta-3">
              Teste secundário: {numero(r.porTetoOrcamentario)} licitação(ões)
              publicada(s) acima da receita realizada do município em 2024,{" "}
              {realExato(RECEITA_MUNICIPAL_2024)} (Siconfi). O painel mostra o
              valor cru como o portal publicou; a leitura provável, quando
              aparece, é inferência do Lab e vem rotulada como tal.
            </p>

            {r.implausiveis > 0 ? (
              <button
                type="button"
                onClick={aoFiltrarImplausiveis}
                className="mt-3 text-[13px] text-registro underline hover:text-registro-escuro"
              >
                Ver as {numero(r.implausiveis)} linhas reprovadas
              </button>
            ) : null}
          </>
        )}
      </div>
    </Ficha>
  );
}

function Metrica({
  rotulo,
  valor,
  de,
  nota,
}: {
  rotulo: string;
  valor: number;
  de: number;
  nota: string;
}) {
  const pct = de > 0 ? Math.round((valor / de) * 100) : 0;
  return (
    <div>
      <dt className="font-mono text-[10.5px] tracking-[0.08em] text-tinta-3 uppercase">
        {rotulo}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-2">
        <span className="text-[20px] leading-none text-tinta tabular-nums">
          {numero(valor)}
        </span>
        <span className="font-mono text-[11px] text-tinta-3 tabular-nums">
          {pct}% de {numero(de)}
        </span>
      </dd>
      <p className="mt-1 text-[12px] leading-snug text-tinta-3">{nota}</p>
    </div>
  );
}
