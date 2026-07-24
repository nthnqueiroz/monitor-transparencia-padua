"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Botao } from "./primitivos";
import type { Categoria, Filtros } from "@/lib/tipos";
import { numero, semAcento } from "@/lib/texto";

const NOME_CATEGORIA: Record<string, string> = {
  arquivo: "Arquivos",
  licitacao: "Licitações",
  pagina: "Páginas",
};

interface Props {
  filtros: Filtros;
  aoMudar: (parcial: Partial<Filtros>) => void;
  aoLimpar: () => void;
  aoExportar: () => void;
  secoes: string[];
  categorias: Categoria[];
  anoMin: number;
  anoMax: number;
  totalResultados: number;
  totalGeral: number;
  sensiveisNoResultado: number;
  temFiltro: boolean;
}

export function BarraFiltros({
  filtros,
  aoMudar,
  aoLimpar,
  aoExportar,
  secoes,
  categorias,
  anoMin,
  anoMax,
  totalResultados,
  totalGeral,
  sensiveisNoResultado,
  temFiltro,
}: Props) {
  return (
    <div className="sticky top-0 z-20 border-b border-linha bg-plano/95 backdrop-blur">
      <div className="mx-auto max-w-[1400px] px-4 py-3 lg:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <CampoBusca
            valor={filtros.termo}
            aoMudar={(termo) => aoMudar({ termo })}
          />

          <SeletorCategoria
            categorias={categorias}
            selecionadas={filtros.categorias}
            aoMudar={(cats) => aoMudar({ categorias: cats })}
          />

          <SeletorSecoes
            secoes={secoes}
            selecionadas={filtros.secoes}
            aoMudar={(secs) => aoMudar({ secoes: secs })}
          />

          <SeletorAno
            anoMin={anoMin}
            anoMax={anoMax}
            de={filtros.anoDe}
            ate={filtros.anoAte}
            incluirSemAno={filtros.incluirSemAno}
            aoMudar={aoMudar}
          />

          <div className="ml-auto flex items-center gap-2">
            {temFiltro ? (
              <Botao onClick={aoLimpar} titulo="Remove todos os filtros">
                Limpar filtros
              </Botao>
            ) : null}
            <Botao
              variante="primario"
              onClick={aoExportar}
              disabled={totalResultados === 0}
              titulo="Baixa o resultado filtrado em CSV"
            >
              Exportar CSV
            </Botao>
          </div>
        </div>

        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[11px] text-tinta-3">
          <span>
            <strong className="font-semibold text-tinta">
              {numero(totalResultados)}
            </strong>{" "}
            {totalResultados === 1 ? "documento" : "documentos"}
            {temFiltro ? ` de ${numero(totalGeral)}` : ""}
          </span>
          {sensiveisNoResultado > 0 ? (
            <span className="text-selo">
              {numero(sensiveisNoResultado)} com possível dado pessoal
            </span>
          ) : null}
        </p>
      </div>
    </div>
  );
}

function CampoBusca({
  valor,
  aoMudar,
}: {
  valor: string;
  aoMudar: (v: string) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  // "/" foca a busca — o painel é operado quase todo pelo teclado.
  useEffect(() => {
    function aoTeclar(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando =
        alvo?.tagName === "INPUT" || alvo?.tagName === "TEXTAREA";
      if (e.key === "/" && !digitando) {
        e.preventDefault();
        ref.current?.focus();
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  return (
    <div className="relative min-w-[240px] flex-1 sm:max-w-md">
      <svg
        aria-hidden="true"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-tinta-3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <circle cx="7" cy="7" r="4.5" />
        <path d="m10.5 10.5 3 3" strokeLinecap="round" />
      </svg>
      <input
        ref={ref}
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="Buscar no título e na seção"
        aria-label="Buscar no título e na seção"
        className="w-full rounded border border-linha-forte bg-ficha py-1.5 pr-14 pl-8 text-[13px] text-tinta placeholder:text-tinta-3"
      />
      {!valor ? (
        <kbd className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 rounded border border-linha bg-ficha-alt px-1.5 font-mono text-[10px] text-tinta-3">
          /
        </kbd>
      ) : null}
    </div>
  );
}

function SeletorCategoria({
  categorias,
  selecionadas,
  aoMudar,
}: {
  categorias: Categoria[];
  selecionadas: Set<string>;
  aoMudar: (v: Set<string>) => void;
}) {
  function alternar(c: string) {
    const proximo = new Set(selecionadas);
    if (proximo.has(c)) proximo.delete(c);
    else proximo.add(c);
    aoMudar(proximo);
  }

  return (
    <div
      role="group"
      aria-label="Filtrar por categoria"
      className="flex overflow-hidden rounded border border-linha-forte"
    >
      {categorias.map((c, i) => {
        const ativo = selecionadas.has(c);
        return (
          <button
            key={c}
            type="button"
            aria-pressed={ativo}
            onClick={() => alternar(c)}
            className={`px-2.5 py-1.5 text-[13px] transition-colors ${
              i > 0 ? "border-l border-linha-forte" : ""
            } ${
              ativo
                ? "bg-registro text-white"
                : "bg-ficha text-tinta-2 hover:bg-ficha-alt"
            }`}
          >
            {NOME_CATEGORIA[c] ?? c}
          </button>
        );
      })}
    </div>
  );
}

function SeletorSecoes({
  secoes,
  selecionadas,
  aoMudar,
}: {
  secoes: string[];
  selecionadas: Set<string>;
  aoMudar: (v: Set<string>) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    }
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("mousedown", aoClicarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberto]);

  const visiveis = useMemo(() => {
    const alvo = semAcento(busca).trim();
    if (!alvo) return secoes;
    return secoes.filter((s) => semAcento(s).includes(alvo));
  }, [secoes, busca]);

  function alternar(s: string) {
    const proximo = new Set(selecionadas);
    if (proximo.has(s)) proximo.delete(s);
    else proximo.add(s);
    aoMudar(proximo);
  }

  const rotulo =
    selecionadas.size === 0
      ? "Todas as seções"
      : selecionadas.size === 1
        ? [...selecionadas][0]
        : `${selecionadas.size} seções`;

  return (
    <div ref={caixa} className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className={`flex max-w-[220px] items-center gap-1.5 rounded border px-2.5 py-1.5 text-[13px] transition-colors ${
          selecionadas.size
            ? "border-registro bg-registro-tenue text-registro-escuro"
            : "border-linha-forte bg-ficha text-tinta-2 hover:bg-ficha-alt"
        }`}
      >
        <span className="truncate">{rotulo}</span>
        <svg
          aria-hidden="true"
          viewBox="0 0 10 10"
          className="h-2.5 w-2.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="m2 4 3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {aberto ? (
        <div className="absolute top-full left-0 z-30 mt-1 w-[300px] rounded border border-linha-forte bg-ficha shadow-sm">
          <div className="border-b border-linha p-2">
            <input
              autoFocus
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Filtrar seções"
              aria-label="Filtrar seções"
              className="w-full rounded border border-linha bg-ficha-alt px-2 py-1 text-[13px]"
            />
          </div>
          <div className="rolagem-fina max-h-72 overflow-y-auto py-1">
            {visiveis.map((s) => (
              <label
                key={s}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-ficha-alt"
              >
                <input
                  type="checkbox"
                  checked={selecionadas.has(s)}
                  onChange={() => alternar(s)}
                  className="accent-[#143E7A]"
                />
                <span className="truncate">{s}</span>
              </label>
            ))}
            {!visiveis.length ? (
              <p className="px-3 py-4 text-center text-[13px] text-tinta-3">
                Nenhuma seção com esse nome.
              </p>
            ) : null}
          </div>
          {selecionadas.size ? (
            <div className="border-t border-linha p-2">
              <button
                type="button"
                onClick={() => aoMudar(new Set())}
                className="text-[12px] text-registro hover:underline"
              >
                Limpar seções
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SeletorAno({
  anoMin,
  anoMax,
  de,
  ate,
  incluirSemAno,
  aoMudar,
}: {
  anoMin: number;
  anoMax: number;
  de: number;
  ate: number;
  incluirSemAno: boolean;
  aoMudar: (p: Partial<Filtros>) => void;
}) {
  const anos = useMemo(() => {
    const lista: number[] = [];
    for (let a = anoMin; a <= anoMax; a++) lista.push(a);
    return lista;
  }, [anoMin, anoMax]);

  return (
    <div className="flex items-center gap-1.5 rounded border border-linha-forte bg-ficha px-2 py-1">
      <label htmlFor="ano-de" className="font-mono text-[11px] text-tinta-3">
        ANO
      </label>
      <select
        id="ano-de"
        value={de}
        onChange={(e) => {
          const v = Number(e.target.value);
          aoMudar({ anoDe: v, anoAte: Math.max(v, ate) });
        }}
        aria-label="Ano inicial"
        className="bg-transparent font-mono text-[13px] text-tinta"
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <span className="text-tinta-3">–</span>
      <select
        value={ate}
        onChange={(e) => {
          const v = Number(e.target.value);
          aoMudar({ anoAte: v, anoDe: Math.min(v, de) });
        }}
        aria-label="Ano final"
        className="bg-transparent font-mono text-[13px] text-tinta"
      >
        {anos.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>
      <label
        className="ml-1 flex cursor-pointer items-center gap-1 border-l border-linha pl-2 text-[11px] text-tinta-2"
        title="1.648 linhas do inventário não trazem ano identificável"
      >
        <input
          type="checkbox"
          checked={incluirSemAno}
          onChange={(e) => aoMudar({ incluirSemAno: e.target.checked })}
          className="accent-[#143E7A]"
        />
        sem ano
      </label>
    </div>
  );
}
