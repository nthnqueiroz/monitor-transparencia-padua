"use client";

import { useMemo } from "react";
import { Chip, Ficha, SeloSensivel, TituloFicha, Vazio } from "./primitivos";
import { pegarRecentes } from "@/lib/filtros";
import type { Doc } from "@/lib/tipos";
import { nomeMes, numero } from "@/lib/texto";

/**
 * Últimas publicações do recorte atual.
 *
 * O inventário não guarda data de coleta, e a coluna `mes` vem vazia em 93%
 * das linhas — o mês vem do caminho da URL quando existe. Então "recente"
 * aqui é o ano mais alto do recorte, ordenado por mês quando dá para saber,
 * e não uma ordem de chegada.
 */
export function Recentes({ docs }: { docs: Doc[] }) {
  const { itens, ano } = useMemo(() => pegarRecentes(docs, 80), [docs]);

  const grupos = useMemo(() => {
    const mapa = new Map<number | null, Doc[]>();
    for (const d of itens) {
      const lista = mapa.get(d.mes);
      if (lista) lista.push(d);
      else mapa.set(d.mes, [d]);
    }
    return [...mapa].sort((a, b) => (b[0] ?? -1) - (a[0] ?? -1));
  }, [itens]);

  if (!itens.length || ano === null) {
    return (
      <Ficha>
        <TituloFicha>Publicações recentes</TituloFicha>
        <Vazio
          titulo="Nenhum documento com data no recorte atual."
          dica="Amplie o intervalo de anos ou limpe os filtros."
        />
      </Ficha>
    );
  }

  return (
    <Ficha>
      <TituloFicha auxiliar={`${numero(itens.length)} de ${ano}`}>
        Publicações mais recentes
      </TituloFicha>

      <p className="border-b border-linha px-4 py-2.5 text-[12px] leading-relaxed text-tinta-3">
        O inventário não registra data de coleta. A ordem abaixo é por ano e
        mês do documento — e o mês só existe para parte das linhas.
      </p>

      <div className="divide-y divide-linha">
        {grupos.map(([mes, lista]) => (
          <div key={String(mes)}>
            <h3 className="bg-ficha-alt px-4 py-1.5 font-mono text-[10.5px] tracking-[0.12em] text-tinta-2 uppercase">
              {mes !== null ? `${nomeMes(mes)} de ${ano}` : `${ano} · sem mês`}
              <span className="ml-2 text-tinta-3 normal-case">
                ({numero(lista.length)})
              </span>
            </h3>
            <ul>
              {lista.map((doc) => (
                <li key={doc.id}>
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-start gap-2.5 px-4 py-2 transition-colors hover:bg-registro-tenue"
                  >
                    {doc.sensivel ? <SeloSensivel marca={doc.sensivel} /> : null}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-1 text-[13px] text-tinta">
                        {doc.licitacao ? doc.licitacao.objeto : doc.titulo}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-tinta-3">
                        {doc.secao}
                      </span>
                    </span>
                    {doc.licitacao?.status ? (
                      <Chip>{doc.licitacao.status}</Chip>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Ficha>
  );
}
