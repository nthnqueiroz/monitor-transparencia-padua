"use client";

import { useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Chip, Destaque, SeloSensivel, Vazio } from "./primitivos";
import { gerarTrecho, statusConteudo, type StatusConteudo } from "@/lib/conteudo";
import { tomDoStatus } from "@/lib/paleta";
import type { AvaliacaoValor, Doc, IndiceConteudo } from "@/lib/tipos";
import { nomeMes, numero, real, realExato } from "@/lib/texto";

type Ordem = "recente" | "antigo";
type Densidade = "confortavel" | "compacto";

const ALTURA_LINHA: Record<Densidade, number> = {
  confortavel: 78,
  compacto: 44,
};

/**
 * Ano desc/asc conforme `ordem`, mês como desempate. Documentos sem ano
 * identificável ficam sempre no fim — nas duas direções, porque "mais
 * antigos primeiro" não deveria abrir com uma pilha de indatados.
 */
function compararDocs(a: Doc, b: Doc, ordem: Ordem): number {
  const aSemAno = a.anoEfetivo === null;
  const bSemAno = b.anoEfetivo === null;
  if (aSemAno !== bSemAno) return aSemAno ? 1 : -1;
  if (aSemAno) return 0;

  const sinal = ordem === "recente" ? -1 : 1;
  const anoA = a.anoEfetivo as number;
  const anoB = b.anoEfetivo as number;
  if (anoA !== anoB) return (anoA - anoB) * sinal;

  return ((a.mes ?? 0) - (b.mes ?? 0)) * sinal;
}

export function TabelaDocumentos({
  docs,
  termo,
  modoConteudo,
  indiceConteudo,
}: {
  docs: Doc[];
  termo: string;
  modoConteudo: boolean;
  indiceConteudo: IndiceConteudo | null;
}) {
  const [ordem, setOrdem] = useState<Ordem>("recente");
  const [densidade, setDensidade] = useState<Densidade>("confortavel");

  // Padrão: mais recente primeiro. Só reordena quando `docs` ou `ordem`
  // mudam — em 18 mil linhas o sort é barato (V8 usa TimSort, O(n log n)),
  // mas não há motivo pra repetir a cada render.
  const ordenados = useMemo(
    () => [...docs].sort((a, b) => compararDocs(a, b, ordem)),
    [docs, ordem],
  );

  if (!docs.length) {
    return (
      <Vazio
        titulo="Nenhum documento com esses filtros."
        dica={
          modoConteudo
            ? "A busca no conteúdo só enxerga documentos já indexados. Tente um termo mais curto ou volte para título/seção."
            : "Tente um termo mais curto, amplie o intervalo de anos ou limpe os filtros de seção."
        }
      />
    );
  }

  return (
    <div className="flex h-[calc(100vh-260px)] min-h-[420px] flex-col">
      <BarraTabela
        ordem={ordem}
        aoMudarOrdem={setOrdem}
        densidade={densidade}
        aoMudarDensidade={setDensidade}
      />
      {/* key força remontar o virtualizador ao trocar densidade — a altura
          de linha muda, e é mais simples remedir do zero do que reconciliar. */}
      <Lista
        key={densidade}
        docs={ordenados}
        termo={termo}
        densidade={densidade}
        modoConteudo={modoConteudo}
        indiceConteudo={indiceConteudo}
      />
    </div>
  );
}

function BarraTabela({
  ordem,
  aoMudarOrdem,
  densidade,
  aoMudarDensidade,
}: {
  ordem: Ordem;
  aoMudarOrdem: (o: Ordem) => void;
  densidade: Densidade;
  aoMudarDensidade: (d: Densidade) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-linha px-4 py-2">
      <button
        type="button"
        onClick={() => aoMudarOrdem(ordem === "recente" ? "antigo" : "recente")}
        title="Documentos sem ano identificável ficam sempre no fim."
        className="flex items-center gap-1.5 rounded border border-linha-forte bg-ficha px-2.5 py-1 text-[12px] font-medium text-tinta-2 hover:bg-ficha-alt"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className={`h-3 w-3 transition-transform ${ordem === "antigo" ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
        >
          <path d="M3 4.5 6 1.5 9 4.5M6 1.5v9" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {ordem === "recente" ? "Mais recentes primeiro" : "Mais antigos primeiro"}
      </button>

      <div
        role="group"
        aria-label="Densidade da lista"
        className="flex overflow-hidden rounded border border-linha-forte"
      >
        {(["confortavel", "compacto"] as const).map((d, i) => (
          <button
            key={d}
            type="button"
            aria-pressed={densidade === d}
            onClick={() => aoMudarDensidade(d)}
            className={`px-2.5 py-1 text-[12px] font-medium transition-colors ${
              i > 0 ? "border-l border-linha-forte" : ""
            } ${
              densidade === d
                ? "bg-registro text-white"
                : "bg-ficha text-tinta-2 hover:bg-ficha-alt"
            }`}
          >
            {d === "confortavel" ? "Confortável" : "Compacto"}
          </button>
        ))}
      </div>
    </div>
  );
}

function Lista({
  docs,
  termo,
  densidade,
  modoConteudo,
  indiceConteudo,
}: {
  docs: Doc[];
  termo: string;
  densidade: Densidade;
  modoConteudo: boolean;
  indiceConteudo: IndiceConteudo | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  // No modo conteúdo a linha ganha uma 3ª linha de trecho — precisa de mais
  // altura, senão o texto do trecho fica cortado pela linha seguinte.
  const altura = ALTURA_LINHA[densidade] + (modoConteudo && densidade === "confortavel" ? 22 : 0);

  // 18 mil linhas não cabem no DOM: só o que está na viewport é montado.
  const virtual = useVirtualizer({
    count: docs.length,
    getScrollElement: () => container.current,
    estimateSize: () => altura,
    overscan: 8,
  });

  return (
    <div ref={container} className="rolagem-fina flex-1 overflow-y-auto">
      <div style={{ height: virtual.getTotalSize(), position: "relative" }} role="list">
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
            <Linha
              doc={docs[item.index]}
              termo={termo}
              par={item.index % 2 === 1}
              compacto={densidade === "compacto"}
              modoConteudo={modoConteudo}
              indiceConteudo={indiceConteudo}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function Linha({
  doc,
  termo,
  par,
  compacto,
  modoConteudo,
  indiceConteudo,
}: {
  doc: Doc;
  termo: string;
  par: boolean;
  compacto: boolean;
  modoConteudo: boolean;
  indiceConteudo: IndiceConteudo | null;
}) {
  const lic = doc.licitacao;
  const principal = lic ? lic.objeto : doc.titulo;

  return (
    <article
      className={`flex h-full items-start gap-3 border-b border-linha px-4 ${
        compacto ? "py-1" : "py-2.5"
      } ${par ? "bg-ficha-alt/60" : ""}`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          {doc.sensivel ? <SeloSensivel marca={doc.sensivel} /> : null}
          <h3
            className={`leading-snug text-tinta ${
              compacto ? "line-clamp-1 text-[12.5px]" : "line-clamp-2 text-[13.5px]"
            }`}
          >
            <Destaque texto={principal} termo={termo} />
          </h3>
        </div>

        <p
          className={`mt-1 flex items-center gap-x-2 gap-y-0.5 font-mono text-tinta-3 ${
            compacto
              ? "flex-nowrap overflow-hidden text-ellipsis whitespace-nowrap text-[10px]"
              : "flex-wrap text-[11px]"
          }`}
        >
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
          {doc.truncado && !compacto ? (
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

          {/* Só pra quem entrou no lote prioritário da Etapa A — mostrar
              "não extraído" nas outras ~18 mil linhas seria ruído, não sinal. */}
          {!modoConteudo && indiceConteudo?.porUrl.has(doc.url) ? (
            <>
              <Separador />
              <SeloConteudo status={statusConteudo(doc.url, indiceConteudo)} />
            </>
          ) : null}
        </p>

        {modoConteudo && !compacto && indiceConteudo ? (
          <TrechoConteudo doc={doc} indice={indiceConteudo} termo={termo} />
        ) : null}
      </div>

      <a
        href={doc.url}
        target="_blank"
        rel="noopener noreferrer"
        title={doc.titulo}
        className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded border border-linha-forte bg-ficha text-[12px] font-medium text-tinta-2 transition-colors hover:border-registro hover:bg-registro-tenue hover:text-registro-escuro ${
          compacto ? "px-2 py-0.5" : "px-2.5 py-1"
        }`}
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
      {doc.valor ? (
        <>
          <Separador />
          <ValorPublicado avaliacao={doc.valor} />
        </>
      ) : lic.valorEstimado ? (
        <>
          <Separador />
          <span className="text-tinta-2">{real(lic.valorEstimado)}</span>
        </>
      ) : null}
      {lic.status ? (
        <>
          <Separador />
          <Chip tom={tomDoStatus(lic.status)}>{lic.status}</Chip>
        </>
      ) : null}
    </>
  );
}

/**
 * Trecho do texto extraído em torno do termo buscado. Para documento
 * sinalizado LGPD, não mostra o conteúdo real — só avisa que existe e manda
 * abrir o original, do mesmo jeito que o resto do painel trata dado sensível.
 */
function TrechoConteudo({
  doc,
  indice,
  termo,
}: {
  doc: Doc;
  indice: IndiceConteudo;
  termo: string;
}) {
  const entrada = indice.porUrl.get(doc.url);
  if (!entrada) return null;

  if (doc.sensivel) {
    return (
      <p className="mt-1 flex items-center gap-1 text-[11.5px] text-tinta-3 italic">
        trecho oculto — dado pessoal sinalizado; abra o documento original
      </p>
    );
  }

  const trecho = gerarTrecho(entrada, indice, termo);
  if (!trecho) return null;

  return (
    <p className="mt-1 line-clamp-1 text-[11.5px] leading-snug text-tinta-2">
      <Destaque texto={trecho} termo={termo} />
    </p>
  );
}

/** "Não finja que tudo está buscável" — status honesto do texto, quando existe. */
function SeloConteudo({ status }: { status: StatusConteudo }) {
  const tom = status.tom === "indexado" ? "sucesso" : status.tom === "erro" ? "registro" : "neutro";
  return (
    <Chip tom={tom}>
      {status.tom === "indexado" ? "texto indexado" : status.rotulo}
    </Chip>
  );
}

/**
 * Valor da licitação sob a regra de implausibilidade (ver lib/dinheiro.ts).
 *
 * Ordem de exibição não é detalhe de layout, é a decisão do Nathan de
 * 2026-07-24: o painel mostra PRIMEIRO o valor cru como o portal publicou, e
 * só depois a leitura provável, sempre rotulada como inferência nossa. O dado
 * da fonte nunca é substituído pelo nosso palpite.
 *
 * Cor: o selo usa o azul de registro, não o âmbar. O âmbar é a única cor
 * quente da interface e está reservado ao selo de LGPD (regra do CLAUDE.md).
 */
function ValorPublicado({ avaliacao }: { avaliacao: AvaliacaoValor }) {
  const { publicado, leituraProvavel, implausivel, motivos, corrigePorEscala } = avaliacao;

  if (!implausivel) {
    return <span className="text-tinta-2">{real(publicado)}</span>;
  }

  const explicacao = motivos.map((m) => m.detalhe).join(" ");

  return (
    <>
      <span
        className="text-tinta-2 underline decoration-dotted decoration-from-font"
        title={explicacao}
      >
        {real(publicado)}
      </span>
      <Chip tom="registro">
        {corrigePorEscala ? "valor implausível" : "incompatível com a modalidade"}
      </Chip>
      {leituraProvavel !== null ? (
        <span
          className="text-tinta-3 italic"
          title={
            corrigePorEscala
              ? "Hipótese do Lab, não é dado do portal: o valor publicado parece " +
                "estar 100x inflado por perda da vírgula decimal. Este é o valor " +
                "dividido por 100, que passa nos dois testes."
              : "Hipótese do Lab, não é dado do portal: mesmo dividido por 100 o " +
                "valor continua incompatível com a modalidade declarada."
          }
        >
          leitura provável {realExato(leituraProvavel)}
        </span>
      ) : null}
    </>
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
