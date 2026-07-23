"use client";

import { useMemo, useState } from "react";
import { Ficha, TituloFicha } from "./primitivos";
import { montarMatriz } from "@/lib/filtros";
import { RAMPA, degrauDeDensidade, limiaresDeDensidade } from "@/lib/paleta";
import type { Doc } from "@/lib/tipos";
import { numero } from "@/lib/texto";

const SECOES_VISIVEIS = 14;

/**
 * Matriz seção × ano.
 *
 * É a peça central da visão geral porque, para pesquisa de pauta, o buraco
 * importa tanto quanto o volume: uma faixa vazia significa que a secretaria
 * não publicou nada naquele ano. Por isso a célula zerada não recebe o tom
 * mais claro da rampa — recebe um traço, que lê como ausência e não como
 * "pouco".
 */
export function MatrizDensidade({
  docs,
  anoMin,
  anoMax,
  aoSelecionar,
}: {
  docs: Doc[];
  anoMin: number;
  anoMax: number;
  aoSelecionar: (secao: string, ano: number) => void;
}) {
  const [expandido, setExpandido] = useState(false);

  const { anos, linhas, limiares } = useMemo(() => {
    const m = montarMatriz(docs, anoMin, anoMax);
    const todas = m.linhas.flatMap((l) => l.celulas);
    return { ...m, limiares: limiaresDeDensidade(todas) };
  }, [docs, anoMin, anoMax]);

  if (!linhas.length) {
    return (
      <Ficha>
        <TituloFicha>Cobertura por seção e ano</TituloFicha>
        <p className="px-4 py-10 text-center text-[13px] text-tinta-3">
          Sem documentos no recorte atual.
        </p>
      </Ficha>
    );
  }

  const mostradas = expandido ? linhas : linhas.slice(0, SECOES_VISIVEIS);
  const ocultas = linhas.length - mostradas.length;

  return (
    <Ficha>
      <TituloFicha
        auxiliar={`${linhas.length} seções · ${anos[0]}–${anos[anos.length - 1]}`}
      >
        Cobertura por seção e ano
      </TituloFicha>

      <div className="px-4 pt-3 pb-1">
        <p className="mb-3 max-w-2xl text-[13px] leading-relaxed text-tinta-2">
          Cada célula é a quantidade de documentos que aquela seção publicou
          naquele ano. As lacunas são informação: indicam anos sem nenhuma
          publicação registrada pelo monitor.
        </p>

        <div className="rolagem-fina overflow-x-auto pb-2">
          <div className="min-w-max">
            <div className="mb-1 flex gap-[2px] pl-[184px]">
              {anos.map((ano) => (
                <div
                  key={ano}
                  className="w-[30px] text-center font-mono text-[10px] text-tinta-3"
                >
                  {String(ano).slice(2)}
                </div>
              ))}
              <div className="w-[56px] pl-2 text-right font-mono text-[10px] text-tinta-3">
                total
              </div>
            </div>

            {mostradas.map((linha) => (
              <div key={linha.secao} className="mb-[2px] flex items-center gap-[2px]">
                <div
                  title={linha.secao}
                  className="w-[180px] truncate pr-2 text-right font-mono text-[10.5px] text-tinta-2"
                >
                  {linha.secao}
                </div>
                {linha.celulas.map((valor, i) => (
                  <Celula
                    key={anos[i]}
                    valor={valor}
                    secao={linha.secao}
                    ano={anos[i]}
                    limiares={limiares}
                    aoSelecionar={aoSelecionar}
                  />
                ))}
                <div className="w-[56px] pl-2 text-right font-mono text-[10.5px] text-tinta-2 tabular-nums">
                  {numero(linha.total)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-linha px-4 py-2.5">
        <Legenda limiares={limiares} />
        {ocultas > 0 || expandido ? (
          <button
            type="button"
            onClick={() => setExpandido((v) => !v)}
            className="text-[12px] font-medium text-registro hover:underline"
          >
            {expandido
              ? `Mostrar só as ${SECOES_VISIVEIS} maiores`
              : `Mostrar as outras ${ocultas} seções`}
          </button>
        ) : null}
      </div>
    </Ficha>
  );
}

function Celula({
  valor,
  secao,
  ano,
  limiares,
  aoSelecionar,
}: {
  valor: number;
  secao: string;
  ano: number;
  limiares: number[];
  aoSelecionar: (secao: string, ano: number) => void;
}) {
  const rotulo = `${secao}, ${ano}: ${valor === 0 ? "nenhum documento" : `${numero(valor)} ${valor === 1 ? "documento" : "documentos"}`}`;

  if (valor === 0) {
    return (
      <div
        title={rotulo}
        aria-label={rotulo}
        className="flex h-[22px] w-[30px] items-center justify-center rounded-[2px] bg-ficha-alt"
      >
        <span className="block h-px w-2 bg-linha-forte" aria-hidden="true" />
      </div>
    );
  }

  const degrau = degrauDeDensidade(valor, limiares);
  return (
    <button
      type="button"
      title={rotulo}
      aria-label={`${rotulo}. Filtrar por este recorte.`}
      onClick={() => aoSelecionar(secao, ano)}
      style={{ backgroundColor: RAMPA[degrau] }}
      className="h-[22px] w-[30px] rounded-[2px] transition-[outline] hover:outline-2 hover:outline-offset-1 hover:outline-tinta"
    />
  );
}

function Legenda({ limiares }: { limiares: number[] }) {
  const faixas = [
    `1–${limiares[0]}`,
    `${limiares[0] + 1}–${limiares[1]}`,
    `${limiares[1] + 1}–${limiares[2]}`,
    `${limiares[2] + 1}–${limiares[3]}`,
    `${limiares[3] + 1}+`,
  ];

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] text-tinta-3">
      <span className="flex items-center gap-1.5">
        <span className="flex h-[14px] w-[20px] items-center justify-center rounded-[2px] bg-ficha-alt">
          <span className="block h-px w-2 bg-linha-forte" />
        </span>
        nada publicado
      </span>
      <span className="flex items-center gap-1">
        {RAMPA.map((cor, i) => (
          <span key={cor} className="flex items-center gap-1">
            <span
              className="block h-[14px] w-[20px] rounded-[2px]"
              style={{ backgroundColor: cor }}
            />
            <span className="tabular-nums">{faixas[i]}</span>
          </span>
        ))}
      </span>
    </div>
  );
}
