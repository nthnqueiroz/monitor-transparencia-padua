import Papa from "papaparse";
import type { Doc } from "./tipos";
import { nomeMes } from "./texto";

/** Marca de ordem de bytes — faz o Excel em pt-BR abrir os acentos certos. */
const BOM = "﻿";

/**
 * Exporta o resultado filtrado. Além das seis colunas do inventário, leva os
 * campos derivados (mês recuperado, dados da licitação, marca de LGPD) para
 * o CSV servir de base de dossiê sem precisar refazer o parsing na planilha.
 */
export function linhasParaExportar(docs: Doc[]) {
  return docs.map((d) => ({
    categoria: d.categoria,
    secao: d.secao,
    ano: d.anoEfetivo ?? "",
    mes: nomeMes(d.mes) ?? "",
    titulo: d.titulo,
    url: d.url,
    dado_pessoal: d.sensivel ? d.sensivel.rotulo : "",
    lic_edital: d.licitacao?.edital ?? "",
    lic_processo: d.licitacao?.processo ?? "",
    lic_modalidade: d.licitacao?.modalidade ?? "",
    lic_objeto: d.licitacao?.objeto ?? "",
    lic_data_sessao: d.licitacao?.dataSessao ?? "",
    lic_valor_estimado: d.licitacao?.valorEstimado ?? "",
    lic_valor_homologado: d.licitacao?.valorHomologado ?? "",
    lic_status: d.licitacao?.status ?? "",
    titulo_truncado_pelo_monitor: d.truncado ? "sim" : "",
  }));
}

export function nomeDoArquivo(termo: string): string {
  const hoje = new Date().toISOString().slice(0, 10);
  const fatia = termo
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  return fatia
    ? `inventario-padua_${fatia}_${hoje}.csv`
    : `inventario-padua_${hoje}.csv`;
}

export function baixarCsv(docs: Doc[], termo: string): void {
  const csv = Papa.unparse(linhasParaExportar(docs));
  const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = nomeDoArquivo(termo);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
