"use client";

import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Chip, Destaque, SeloSensivel, Vazio } from "./primitivos";
import type { Doc } from "@/lib/tipos";
import { nomeMes, numero, real } from "@/lib/texto";

const ALTURA_LINHA = 78;

export function TabelaDocumentos({
  docs,
  termo,
}: {
  docs: Doc[];
  termo: string;
}) {
  const container = useRef<HTMLDivElement>(null);

  // 18 mil linhas não cabem no DOM: só o que está na viewport é montado.
  const virtual = useVirtualizer({
    count: docs.length,
    getScrollElement: () => container.current,
    estimateSize: () => ALTURA_LINHA,
    overscan: 8,
  });

  if (!docs.length) {
    return (
      <Vazio
        titulo="Nenhum documento com esses filtros."
        dica="Tente um termo mais curto, amplie o intervalo de anos ou limpe os filtros de seção."
      />
    );
  }

  return (
    <div
      ref={container}
      className="rolagem-fina h-[calc(100vh-260px)] min-h-[420px] overflow-y-auto"
    >
      <div
        style={{ height: virtual.getTotalSize(), position: "relative" }}
        role="list"
      >
        {virtual.getVirtualItems().map((item) => (
          <div
            key={item.key}
            role="listitem"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              height: item.size,
              transform: `translateY(${item.start}px)`,
            }}
          >
            <Linha doc={docs[item.index]} termo={termo} par={item.index % 2 === 1} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Linha({ doc, termo, par }: { doc: Doc; termo: string; par: boolean }) {
  const lic = doc.licitacao;
  const principal = lic ? lic.objeto : doc.titulo;

  return (
    <article
      className={`flex h-full items-start gap-3 border-b border-linha px-4 py-2.5 ${
        par ? "bg-ficha-alt/60" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {doc.sensivel ? <SeloSensivel marca={doc.sensivel} /> : null}
          <h3 className="line-clamp-2 text-[13.5px] leading-snug text-tinta">
            <Destaque texto={principal} termo={termo} />
          </h3>
        </div>

        <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-tinta-3">
          <span className="text-tinta-2">{doc.secao}</span>
          {doc.anoEfetivo !== null ? (
            <>
              <Separador />
              <span>
                {doc.anoEfetivo}
                {doc.ano === null ? "*" : ""}
              </span>
            </>
          ) : (
            <>
              <Separador />
              <span className="italic">sem ano</span>
            </>
          )}
          {doc.mes !== null ? (
            <>
              <Separador />
              <span>{nomeMes(doc.mes)}</span>
            </>
          ) : null}

          {lic ? <MetaLicitacao doc={doc} /> : null}
          {!lic && doc.extensao ? (
            <>
              <Separador />
              <span className="uppercase">{doc.extensao}</span>
            </>
          ) : null}
          {doc.truncado ? (
            <>
              <Separador />
              <span
                title="O monitor corta o título em 200 caracteres; o fim da linha se perdeu."
                className="italic"
              >
                título cortado
              </span>
            </>
          ) : null}
        </p>
      </div>

      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        title={doc.titulo}
        className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-linha-forte bg-ficha px-2.5 py-1 text-[12px] font-medium text-tinta-2 transition-colors hover:border-registro hover:bg-registro-tenue hover:text-registro-escuro"
      >
        Abrir
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="h-2.5 w-2.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M4.5 2h5.5v5.5M10 2 3 9" strokeLinecap="round" />
          <path d="M8 10H2V4" strokeLinecap="round" />
        </svg>
      </a>
    </article>
  );
}

function MetaLicitacao({ doc }: { doc: Doc }) {
  const lic = doc.licitacao;
  if (!lic) return null;

  return (
    <>
      {lic.modalidade ? (
        <>
          <Separador />
          <span className="text-tinta-2">{lic.modalidade}</span>
        </>
      ) : null}
      {lic.edital ? (
        <>
          <Separador />
          <span>ed. {lic.edital}</span>
        </>
      ) : null}
      {lic.dataSessao ? (
        <>
          <Separador />
          <span>{lic.dataSessao}</span>
        </>
      ) : null}
      {lic.valorEstimado ? (
        <>
          <Separador />
          <span className="text-tinta-2">{real(lic.valorEstimado)}</span>
        </>
      ) : null}
      {lic.status ? (
        <>
          <Separador />
          <Chip tom={destacaStatus(lic.status) ? "registro" : "neutro"}>
            {lic.status}
          </Chip>
        </>
      ) : null}
    </>
  );
}

/** Certame sem disputa ou anulado costuma render pauta — fica em evidência. */
function destacaStatus(status: string): boolean {
  return ["Deserta", "Fracassada", "Revogada", "Anulada", "Cancelada"].includes(
    status,
  );
}

function Separador() {
  return <span className="text-linha-forte">·</span>;
}

export function RodapeTabela({ total }: { total: number }) {
  return (
    <p className="border-t border-linha px-4 py-2 font-mono text-[11px] text-tinta-3">
      {numero(total)} {total === 1 ? "documento listado" : "documentos listados"}
      {" · "}
      <span title="Ano recuperado do caminho da URL ou da data da sessão, quando a coluna do inventário vem vazia">
        * ano recuperado
      </span>
    </p>
  );
}
