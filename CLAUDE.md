# CLAUDE.md — Painel Interno de Transparência (Pádua Lab)

Regras e contexto deste projeto. Leia antes de agir.

## O que é
Painel **interno** de exploração do inventário de documentos públicos da
Prefeitura de Santo Antônio de Pádua–RJ, coletados pelo monitor deste repositório.
Uso interno do **Pádua Lab** (Nathan e Matheus) para **pesquisa de pautas** e
jornalismo de dados: pontes (Ponte Raul Veiga), enchentes / Rio Pomba, saneamento,
arborização, trânsito, licitações. Não é público nesta fase.

O Pádua Lab é uma **mídia / laboratório cívico** (não é empresa, não é o In Tha Houz).

## Dados
Fonte: `inventory.csv` na **raiz do repositório** (gerado pelo `monitor.py`).
- Colunas: `categoria` (`arquivo` | `licitacao` | `pagina`), `secao`, `ano`, `mes`, `titulo`, `url`.
- ~18 mil linhas. **É só metadado + link** para o documento — o texto dentro dos
  PDFs ainda NÃO foi extraído (isso é fase futura, OCR).
- `url` aponta para o arquivo/página original no site da prefeitura.

## Stack (alinhada ao roadmap da Central do Lab)
- **Next.js (App Router) + TypeScript + Tailwind CSS**
- **Recharts** para gráficos · **PapaParse** para ler o CSV
- **100% client-side no v1**: sem backend, sem Supabase, sem banco. O CSV é lido no
  navegador. Roda local com `npm run dev`; deploy no Vercel fica para depois.
- App fica na subpasta **`dashboard/`** deste repo. Copie/atualize o CSV para
  `dashboard/public/inventory.csv` (crie um script npm `sync-data` que copia da raiz).

## Funcionalidades do v1
1. **Busca textual** por `titulo` (e `secao`), com destaque do termo.
2. **Filtros**: por `categoria`, por `secao` (secretaria), por `ano` (intervalo/seleção).
3. **Tabela de resultados**: título, seção, ano/mês e botão que abre a `url`.
   Contador de resultados. Use **paginação ou virtualização** (são 18k linhas).
4. **Visão geral (overview)** com gráficos Recharts: documentos por secretaria,
   por ano (linha do tempo), por categoria.
5. **"Recentes"**: documentos do ano/mês mais recentes.
6. **Exportar CSV** do resultado filtrado (útil para montar dossiê de pauta).

Backlog (não fazer agora, só deixar anotado): salvar buscas, marcar documento para
uma pauta, anotações, e futura camada de OCR + "Pergunte à Prefeitura".

## Regras do Lab (importantes)
- **LGPD**: a seção/categoria **FOLHA DE PAGAMENTO** contém dado pessoal
  (nomes e salários). Como é interno, mantenha — mas **sinalize visualmente** esses
  documentos como sensíveis e **não** faça deploy público desta ferramenta sem antes
  passar pela Política de Transparência e LGPD do Lab. Nada de publicar sem revisão.
- **Neutralidade**: é ferramenta de transparência e pesquisa, com tom **neutro e
  factual** na interface. Não é ferramenta de ataque a pessoas.

## Convenções
- Não altere `monitor.py` nem `.github/workflows/` — é o robô de monitoramento
  (projeto separado que vive no mesmo repo). O painel é só a pasta `dashboard/`.
- `node_modules/` e `.next/` no `.gitignore`.
- Commits pequenos e descritivos, em **português**.
- Rodar: `cd dashboard && npm install && npm run dev`.

## Pronto quando (Definition of Done do v1)
Roda local sem erro, carrega os ~18k registros, busca + filtros + gráficos +
exportar CSV funcionando, tabela performática, e um `dashboard/README.md` curto
explicando como rodar e atualizar os dados.
