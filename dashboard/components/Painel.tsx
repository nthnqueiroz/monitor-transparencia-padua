"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarraFiltros } from "./BarraFiltros";
import { DocumentosPorAno, DocumentosPorSecretaria, ResumoPorCategoria } from "./Graficos";
import { MatrizDensidade } from "./MatrizDensidade";
import { Recentes } from "./Recentes";
import { RodapeTabela, TabelaDocumentos } from "./TabelaDocumentos";
import { Ficha } from "./primitivos";
import { carregarIndiceConteudo } from "@/lib/conteudo";
import { carregarInventario } from "@/lib/dados";
import { baixarCsv } from "@/lib/exportar";
import { aplicarFiltros, filtrosVazios, temFiltroAtivo } from "@/lib/filtros";
import type { Filtros, IndiceConteudo, Inventario } from "@/lib/tipos";
import { numero } from "@/lib/texto";

type Aba = "geral" | "documentos" | "recentes";

const ABAS: { chave: Aba; rotulo: string }[] = [
  { chave: "geral", rotulo: "Visão geral" },
  { chave: "documentos", rotulo: "Documentos" },
  { chave: "recentes", rotulo: "Recentes" },
];

export function Painel() {
  const [inventario, setInventario] = useState<Inventario | null>(null);
  const [indiceConteudo, setIndiceConteudo] = useState<IndiceConteudo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("geral");
  const [filtros, setFiltros] = useState<Filtros>(() => filtrosVazios(0, 0));
  const [termoAplicado, setTermoAplicado] = useState("");

  useEffect(() => {
    const controle = new AbortController();
    carregarInventario(controle.signal)
      .then((inv) => {
        setInventario(inv);
        setFiltros(filtrosVazios(inv.anoMin, inv.anoMax));
      })
      .catch((e: unknown) => {
        if (controle.signal.aborted) return;
        setErro(e instanceof Error ? e.message : "Falha ao ler o inventário.");
      });
    return () => controle.abort();
  }, []);

  // Índice de conteúdo é opcional — se ninguém rodou a Etapa A ainda, ou o
  // fetch falhar por qualquer motivo, carregarIndiceConteudo devolve null e
  // o painel segue normal, só sem a busca no conteúdo.
  useEffect(() => {
    const controle = new AbortController();
    carregarIndiceConteudo(controle.signal).then((indice) => {
      if (!controle.signal.aborted) setIndiceConteudo(indice);
    });
    return () => controle.abort();
  }, []);

  // A busca roda sobre 18 mil linhas a cada tecla; o atraso curto evita
  // refiltrar no meio de uma palavra sem dar sensação de lentidão.
  useEffect(() => {
    const t = setTimeout(() => setTermoAplicado(filtros.termo), 160);
    return () => clearTimeout(t);
  }, [filtros.termo]);

  const filtrosEfetivos = useMemo(
    () => ({ ...filtros, termo: termoAplicado }),
    [filtros, termoAplicado],
  );

  const resultados = useMemo(() => {
    if (!inventario) return [];
    return aplicarFiltros(inventario.docs, filtrosEfetivos, indiceConteudo);
  }, [inventario, filtrosEfetivos, indiceConteudo]);

  const sensiveisNoResultado = useMemo(
    () => resultados.reduce((s, d) => s + (d.sensivel ? 1 : 0), 0),
    [resultados],
  );

  const mudarFiltros = useCallback((parcial: Partial<Filtros>) => {
    setFiltros((atual) => ({ ...atual, ...parcial }));
  }, []);

  const limpar = useCallback(() => {
    if (!inventario) return;
    setFiltros(filtrosVazios(inventario.anoMin, inventario.anoMax));
  }, [inventario]);

  // Os três drill-downs abaixo (matriz, gráfico de seção, categoria) varrem
  // o inventário inteiro; o modo conteúdo só enxerga o subconjunto indexado.
  // Volta pro modo título pra não confundir "0 documentos" com "essa
  // seção/ano não foi indexada ainda".
  const filtrarPorCelula = useCallback((secao: string, ano: number) => {
    setFiltros((atual) => ({
      ...atual,
      modoBusca: "titulo",
      secoes: new Set([secao]),
      anoDe: ano,
      anoAte: ano,
      incluirSemAno: false,
    }));
    setAba("documentos");
  }, []);

  const filtrarPorSecao = useCallback((secao: string) => {
    setFiltros((atual) => ({ ...atual, modoBusca: "titulo", secoes: new Set([secao]) }));
    setAba("documentos");
  }, []);

  const filtrarPorCategoria = useCallback((categoria: string) => {
    setFiltros((atual) => ({ ...atual, modoBusca: "titulo", categorias: new Set([categoria]) }));
    setAba("documentos");
  }, []);

  if (erro) return <Erro mensagem={erro} />;
  if (!inventario) return <Carregando />;

  const temFiltro = temFiltroAtivo(
    filtrosEfetivos,
    inventario.anoMin,
    inventario.anoMax,
  );

  return (
    <div className="flex min-h-full flex-col">
      <Cabecalho inventario={inventario} />

      <BarraFiltros
        filtros={filtros}
        aoMudar={mudarFiltros}
        aoLimpar={limpar}
        aoExportar={() => baixarCsv(resultados, termoAplicado)}
        secoes={inventario.secoes}
        categorias={inventario.categorias}
        anoMin={inventario.anoMin}
        anoMax={inventario.anoMax}
        totalResultados={resultados.length}
        totalGeral={inventario.docs.length}
        sensiveisNoResultado={sensiveisNoResultado}
        temFiltro={temFiltro}
        indiceConteudo={indiceConteudo}
      />

      <nav
        aria-label="Seções do painel"
        className="border-b border-linha bg-ficha"
      >
        <div className="mx-auto flex max-w-[1400px] gap-1 px-4 lg:px-6">
          {ABAS.map((a) => {
            const ativa = aba === a.chave;
            return (
              <button
                key={a.chave}
                type="button"
                onClick={() => setAba(a.chave)}
                aria-current={ativa ? "page" : undefined}
                className={`-mb-px border-b-2 px-3 py-2.5 font-display text-[12.5px] font-bold tracking-[0.04em] uppercase transition-colors ${
                  ativa
                    ? "border-registro text-registro-escuro"
                    : "border-transparent text-tinta-3 hover:text-tinta-2"
                }`}
              >
                {a.rotulo}
              </button>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 lg:px-6">
        {aba === "geral" ? (
          <div className="space-y-4">
            <MatrizDensidade
              docs={resultados}
              anoMin={inventario.anoMin}
              anoMax={inventario.anoMax}
              aoSelecionar={filtrarPorCelula}
            />
            <div className="grid gap-4 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <DocumentosPorAno
                  docs={resultados}
                  anoMin={inventario.anoMin}
                  anoMax={inventario.anoMax}
                />
              </div>
              <ResumoPorCategoria
                docs={resultados}
                aoSelecionar={filtrarPorCategoria}
              />
            </div>
            <DocumentosPorSecretaria
              docs={resultados}
              aoSelecionar={filtrarPorSecao}
            />
          </div>
        ) : null}

        {aba === "documentos" ? (
          <Ficha>
            <TabelaDocumentos
              docs={resultados}
              termo={termoAplicado}
              modoConteudo={filtros.modoBusca === "conteudo"}
              indiceConteudo={indiceConteudo}
            />
            {resultados.length ? <RodapeTabela total={resultados.length} /> : null}
          </Ficha>
        ) : null}

        {aba === "recentes" ? <Recentes docs={resultados} /> : null}
      </main>

      <Rodape indiceConteudo={indiceConteudo} />
    </div>
  );
}

function Cabecalho({ inventario }: { inventario: Inventario }) {
  return (
    <header className="border-b border-linha bg-ficha">
      <div className="mx-auto flex max-w-[1400px] flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 py-4 lg:px-6">
        <div>
          <p className="font-display text-[10.5px] font-bold tracking-[0.16em] text-tinta-3 uppercase">
            Pádua Lab · uso interno
          </p>
          <h1 className="mt-0.5 font-display text-[26px] leading-tight font-bold tracking-[0.01em] text-tinta uppercase">
            Painel de Transparência
          </h1>
          <p className="mt-0.5 text-[13px] text-tinta-2">
            Inventário de documentos públicos da Prefeitura de Santo Antônio de
            Pádua–RJ
          </p>
        </div>

        <dl className="flex gap-6 font-mono text-[11px] text-tinta-3">
          <div>
            <dt className="tracking-wider uppercase">Documentos</dt>
            <dd className="mt-0.5 text-[17px] text-tinta tabular-nums">
              {numero(inventario.docs.length)}
            </dd>
          </div>
          <div>
            <dt className="tracking-wider uppercase">Seções</dt>
            <dd className="mt-0.5 text-[17px] text-tinta tabular-nums">
              {inventario.secoes.length}
            </dd>
          </div>
          <div>
            <dt className="tracking-wider uppercase">Período</dt>
            <dd className="mt-0.5 text-[17px] text-tinta tabular-nums">
              {inventario.anoMin}–{inventario.anoMax}
            </dd>
          </div>
        </dl>
      </div>

      <AvisoLgpd total={inventario.totalSensiveis} />
    </header>
  );
}

function AvisoLgpd({ total }: { total: number }) {
  if (!total) return null;
  return (
    <div className="border-t border-selo-linha bg-selo-fundo">
      <p className="mx-auto flex max-w-[1400px] items-start gap-2 px-4 py-2 text-[12px] leading-relaxed text-selo lg:px-6">
        <svg
          aria-hidden="true"
          viewBox="0 0 12 12"
          className="mt-[3px] h-3 w-3 shrink-0"
          fill="currentColor"
        >
          <path d="M6 0.8 11.4 10.6H0.6L6 0.8Zm0 3.4a.6.6 0 0 0-.6.65l.2 2.6a.4.4 0 0 0 .8 0l.2-2.6A.6.6 0 0 0 6 4.2Zm0 4.3a.65.65 0 1 0 0 1.3.65.65 0 0 0 0-1.3Z" />
        </svg>
        <span>
          <strong className="font-semibold">
            {numero(total)} documentos sinalizados como possível dado pessoal
          </strong>{" "}
          (folha de pagamento, atos de pessoal, previdência e licenças). Marca de
          cautela baseada só no título — ferramenta interna, sem publicação
          pública antes da revisão de LGPD do Lab.
        </span>
      </p>
    </div>
  );
}

function Carregando() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3">
      <div className="h-1 w-40 overflow-hidden rounded-sm bg-linha">
        <div className="h-full w-1/3 animate-[carrega_1.1s_ease-in-out_infinite] rounded-sm bg-registro" />
      </div>
      <p className="font-mono text-[12px] text-tinta-3">
        Lendo o inventário (~18 mil documentos)
      </p>
      <style>{`@keyframes carrega{0%{transform:translateX(-100%)}100%{transform:translateX(320%)}}`}</style>
    </div>
  );
}

function Erro({ mensagem }: { mensagem: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Ficha className="max-w-lg p-6">
        <h1 className="text-[15px] font-semibold text-tinta">
          Não foi possível carregar o inventário
        </h1>
        <p className="mt-2 text-[13px] leading-relaxed text-tinta-2">{mensagem}</p>
        <pre className="mt-3 overflow-x-auto rounded border border-linha bg-ficha-alt px-3 py-2 font-mono text-[12px] text-tinta-2">
          npm run sync-data
        </pre>
      </Ficha>
    </div>
  );
}

function Rodape({ indiceConteudo }: { indiceConteudo: IndiceConteudo | null }) {
  return (
    <footer className="border-t border-linha bg-ficha">
      <p className="mx-auto max-w-[1400px] px-4 py-3 font-mono text-[10.5px] leading-relaxed text-tinta-3 lg:px-6">
        {indiceConteudo
          ? `Metadado e link para todos — texto extraído de ${numero(indiceConteudo.resumo.comTexto)} documentos (busca em "Conteúdo"); o resto ainda é só metadado.`
          : "Metadado e link — o texto dentro dos PDFs ainda não foi extraído."}{" "}
        Fonte: portal da transparência da Prefeitura de Santo Antônio de
        Pádua–RJ, via monitor deste repositório.
      </p>
    </footer>
  );
}
