"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Ficha, TituloFicha } from "./primitivos";
import {
  type Contagem,
  contarPorAno,
  contarPorCategoria,
  contarPorSecao,
} from "@/lib/filtros";
import { PALETA } from "@/lib/paleta";
import type { Doc } from "@/lib/tipos";
import { numero } from "@/lib/texto";

const NOME_CATEGORIA: Record<string, string> = {
  arquivo: "Arquivos",
  licitacao: "Licitações",
  pagina: "Páginas",
};

const EIXO = {
  fontSize: 11,
  fontFamily: "var(--fonte-mono), monospace",
  fill: PALETA.tinta3,
};

/**
 * Encurta o rótulo do eixo sem esconder de qual secretaria se trata.
 * O limite mantém o texto em uma linha só: acima disso o Recharts quebra o
 * rótulo em duas e as linhas vizinhas se encostam. O nome completo continua
 * na dica de contexto.
 */
function abreviarSecao(nome: string): string {
  const curto = nome
    .replace(/^SECRETARIA (DE|DA|DO)\s+/i, "SEC. ")
    .replace(/^PLANEJAMENTO DE\s+/i, "PLANEJ. ")
    .replace(/^LRF\(.*\)$/i, "LRF");
  return curto.length > 20 ? `${curto.slice(0, 19)}…` : curto;
}

/** Caixa de dica única para todos os gráficos — texto em tinta, nunca na cor da série. */
function Dica({
  ativo,
  titulo,
  valor,
  complemento,
}: {
  ativo?: boolean;
  titulo?: string;
  valor?: number;
  complemento?: string;
}) {
  if (!ativo || titulo === undefined || valor === undefined) return null;
  return (
    <div className="rounded border border-linha-forte bg-ficha px-2.5 py-1.5 shadow-sm">
      <p className="text-[12px] font-medium text-tinta">{titulo}</p>
      <p className="font-mono text-[11px] text-tinta-2">
        {numero(valor)} {valor === 1 ? "documento" : "documentos"}
        {complemento ? ` · ${complemento}` : ""}
      </p>
    </div>
  );
}

export function DocumentosPorAno({
  docs,
  anoMin,
  anoMax,
}: {
  docs: Doc[];
  anoMin: number;
  anoMax: number;
}) {
  const { serie, semAno } = useMemo(
    () => contarPorAno(docs, anoMin, anoMax),
    [docs, anoMin, anoMax],
  );

  const pico = useMemo(
    () => serie.reduce((a, b) => (b.total > a.total ? b : a), serie[0]),
    [serie],
  );

  return (
    <Ficha>
      <TituloFicha
        auxiliar={
          semAno > 0 ? `${numero(semAno)} sem ano identificável` : undefined
        }
      >
        Documentos por ano
      </TituloFicha>
      <div className="px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={serie} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid
              stroke={PALETA.grade}
              vertical={false}
              strokeDasharray="0"
            />
            <XAxis
              dataKey="ano"
              tick={EIXO}
              tickLine={false}
              axisLine={{ stroke: PALETA.eixo }}
            />
            <YAxis
              tick={EIXO}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v: number) => numero(v)}
            />
            <Tooltip
              cursor={{ fill: PALETA.registroTenue }}
              content={({ active, payload, label }) => (
                <Dica
                  ativo={active}
                  titulo={String(label)}
                  valor={payload?.[0]?.value as number | undefined}
                  complemento={
                    pico && Number(label) === pico.ano ? "maior volume" : undefined
                  }
                />
              )}
            />
            <Bar
              dataKey="total"
              fill={PALETA.registro}
              radius={[3, 3, 0, 0]}
              maxBarSize={34}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Ficha>
  );
}

/**
 * Quando a 1ª seção passa de longe a 2ª, ela sozinha achata a escala e
 * esconde a diferença entre as seções médias — que é o que importa para
 * comparar secretarias entre si. Nesse caso ela sai do gráfico e vira um
 * destaque à parte; o gráfico escala pelas próximas, que passam a ser
 * comparáveis. Sem essa dominância, o corte de 12 do Top 12 já basta.
 */
function separarDominante(todas: Contagem[]): {
  dominante: Contagem | null;
  pool: Contagem[];
} {
  const [primeira, segunda] = todas;
  const dominante = segunda && primeira.total > segunda.total * 2 ? primeira : null;
  return { dominante, pool: dominante ? todas.slice(1) : todas };
}

export function DocumentosPorSecretaria({
  docs,
  aoSelecionar,
}: {
  docs: Doc[];
  aoSelecionar: (secao: string) => void;
}) {
  const { dominante, visiveis, restantes, totalRestante } = useMemo(() => {
    const todas = contarPorSecao(docs);
    const { dominante, pool } = separarDominante(todas);
    const visiveis = pool.slice(0, 12);
    const resto = pool.slice(12);
    return {
      dominante,
      visiveis,
      restantes: resto.length,
      totalRestante: resto.reduce((s, r) => s + r.total, 0),
    };
  }, [docs]);

  const totalGeral = docs.length || 1;

  return (
    <Ficha>
      <TituloFicha
        auxiliar={
          restantes > 0
            ? `+ ${restantes} seções menores (${numero(totalRestante)})`
            : undefined
        }
      >
        Documentos por seção
      </TituloFicha>

      {dominante ? (
        <button
          type="button"
          onClick={() => aoSelecionar(dominante.chave)}
          className="flex w-full items-center justify-between gap-3 border-b border-linha bg-ficha-alt px-4 py-2.5 text-left transition-colors hover:bg-registro-tenue"
        >
          <span className="text-[12px] leading-snug text-tinta-2">
            <strong className="font-display font-bold tracking-[0.02em] text-tinta uppercase">
              {dominante.chave}
            </strong>{" "}
            soma sozinha {((dominante.total / totalGeral) * 100).toFixed(0)}% do
            recorte — fora da escala abaixo, para as demais seções ficarem
            comparáveis entre si.
          </span>
          <span className="shrink-0 font-mono text-[15px] text-tinta tabular-nums">
            {numero(dominante.total)}
          </span>
        </button>
      ) : null}

      <div className="px-2 pt-4 pb-2">
        <ResponsiveContainer width="100%" height={340}>
          <BarChart
            data={visiveis}
            layout="vertical"
            margin={{ top: 4, right: 44, bottom: 4, left: 4 }}
          >
            <CartesianGrid
              stroke={PALETA.grade}
              horizontal={false}
              strokeDasharray="0"
            />
            <XAxis
              type="number"
              tick={EIXO}
              tickLine={false}
              axisLine={{ stroke: PALETA.eixo }}
              tickFormatter={(v: number) => numero(v)}
            />
            <YAxis
              type="category"
              dataKey="chave"
              tick={{ ...EIXO, fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={200}
              // Sem isto o Recharts esconde os rótulos que julga apertados,
              // e algumas secretarias somem do eixo.
              interval={0}
              tickFormatter={abreviarSecao}
            />
            <Tooltip
              cursor={{ fill: PALETA.registroTenue }}
              content={({ active, payload }) => (
                <Dica
                  ativo={active}
                  titulo={payload?.[0]?.payload?.chave as string | undefined}
                  valor={payload?.[0]?.value as number | undefined}
                  complemento="clique para filtrar"
                />
              )}
            />
            <Bar
              dataKey="total"
              fill={PALETA.registro}
              radius={[0, 3, 3, 0]}
              maxBarSize={18}
              onClick={(barra) => {
                // O Recharts entrega o retângulo; o dado original vem em `payload`.
                const { chave } =
                  (barra as { payload?: { chave?: string } }).payload ?? {};
                if (chave) aoSelecionar(chave);
              }}
              className="cursor-pointer"
            >
              {visiveis.map((v) => (
                <Cell key={v.chave} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Ficha>
  );
}

/**
 * Categoria tem só duas classes no inventário. Duas fatias não pedem gráfico:
 * pedem os números e a proporção.
 */
export function ResumoPorCategoria({
  docs,
  aoSelecionar,
}: {
  docs: Doc[];
  aoSelecionar: (categoria: string) => void;
}) {
  const contagens = useMemo(() => contarPorCategoria(docs), [docs]);
  const total = docs.length || 1;

  return (
    <Ficha>
      <TituloFicha>Por categoria</TituloFicha>
      <div className="p-4">
        <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[2px]">
          {contagens.map((c, i) => (
            <div
              key={c.chave}
              style={{
                width: `${(c.total / total) * 100}%`,
                backgroundColor: i === 0 ? PALETA.registro : PALETA.registroEscuro,
              }}
              title={`${NOME_CATEGORIA[c.chave] ?? c.chave}: ${numero(c.total)}`}
            />
          ))}
        </div>

        <dl className="mt-4 space-y-3">
          {contagens.map((c, i) => (
            <div key={c.chave} className="flex items-baseline justify-between gap-3">
              <dt className="flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className="block h-2.5 w-2.5 rounded-[2px]"
                  style={{
                    backgroundColor:
                      i === 0 ? PALETA.registro : PALETA.registroEscuro,
                  }}
                />
                <button
                  type="button"
                  onClick={() => aoSelecionar(c.chave)}
                  className="text-[13px] text-tinta-2 hover:text-registro hover:underline"
                >
                  {NOME_CATEGORIA[c.chave] ?? c.chave}
                </button>
              </dt>
              <dd className="font-mono text-[13px] text-tinta tabular-nums">
                {numero(c.total)}
                <span className="ml-1.5 text-[11px] text-tinta-3">
                  {((c.total / total) * 100).toFixed(0)}%
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </Ficha>
  );
}
