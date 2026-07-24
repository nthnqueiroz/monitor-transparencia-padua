"use client";

import type { ReactNode } from "react";
import type { MarcaSensivel } from "@/lib/tipos";
import { fatiarPorTermo } from "@/lib/texto";

export function Ficha({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded border border-linha bg-ficha ${className}`}
    >
      {children}
    </section>
  );
}

export function TituloFicha({
  children,
  auxiliar,
}: {
  children: ReactNode;
  auxiliar?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-linha px-4 py-3">
      <h2 className="font-display text-[12.5px] font-bold tracking-[0.05em] text-tinta-2 uppercase">
        {children}
      </h2>
      {auxiliar ? (
        <p className="font-mono text-[11px] text-tinta-3">{auxiliar}</p>
      ) : null}
    </header>
  );
}

/** Destaca as ocorrências do termo sem perder a acentuação original. */
export function Destaque({ texto, termo }: { texto: string; termo: string }) {
  const partes = fatiarPorTermo(texto, termo);
  if (partes.length === 1) return <>{texto}</>;

  return (
    <>
      {partes.map((p, i) =>
        p.destaque ? (
          <mark
            key={i}
            className="rounded-[2px] bg-grifo px-[1px] text-grifo-texto"
          >
            {p.trecho}
          </mark>
        ) : (
          <span key={i}>{p.trecho}</span>
        ),
      )}
    </>
  );
}

/**
 * Marca de dado pessoal. Âmbar é a única cor quente da interface e está
 * reservada para isto — ver a regra de LGPD no CLAUDE.md.
 */
export function SeloSensivel({ marca }: { marca: MarcaSensivel }) {
  return (
    <span
      title={marca.detalhe}
      className="inline-flex shrink-0 items-center gap-1 rounded-[3px] border border-selo-linha bg-selo-fundo px-1.5 py-[1px] font-mono text-[10px] font-medium tracking-[0.08em] text-selo uppercase"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 12 12"
        className="h-2.5 w-2.5"
        fill="currentColor"
      >
        <path d="M6 0.8 11.4 10.6H0.6L6 0.8Zm0 3.4a.6.6 0 0 0-.6.65l.2 2.6a.4.4 0 0 0 .8 0l.2-2.6A.6.6 0 0 0 6 4.2Zm0 4.3a.65.65 0 1 0 0 1.3.65.65 0 0 0 0-1.3Z" />
      </svg>
      {marca.rotulo}
    </span>
  );
}

export function Chip({
  children,
  tom = "neutro",
}: {
  children: ReactNode;
  tom?: "neutro" | "registro" | "sucesso";
}) {
  const cor =
    tom === "registro"
      ? "border-registro/25 bg-registro-tenue text-registro-escuro"
      : tom === "sucesso"
        ? "border-verde-linha bg-verde-fundo text-verde"
        : "border-linha bg-ficha-alt text-tinta-2";
  return (
    <span
      className={`inline-flex items-center rounded-[3px] border px-1.5 py-[1px] font-mono text-[10px] tracking-wide uppercase ${cor}`}
    >
      {children}
    </span>
  );
}

export function Botao({
  children,
  onClick,
  variante = "secundario",
  disabled,
  titulo,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: "primario" | "secundario";
  disabled?: boolean;
  titulo?: string;
}) {
  const base =
    "inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45";
  const cor =
    variante === "primario"
      ? "border-registro bg-registro text-white hover:bg-registro-escuro"
      : "border-linha-forte bg-ficha text-tinta-2 hover:bg-ficha-alt hover:text-tinta";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={titulo}
      className={`${base} ${cor}`}
    >
      {children}
    </button>
  );
}

export function Vazio({ titulo, dica }: { titulo: string; dica: string }) {
  return (
    <div className="px-6 py-16 text-center">
      <p className="text-sm font-medium text-tinta">{titulo}</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] text-tinta-3">{dica}</p>
    </div>
  );
}
