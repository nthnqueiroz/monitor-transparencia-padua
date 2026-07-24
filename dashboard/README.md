# Painel Interno de Transparência — Pádua Lab

Ferramenta interna de exploração do inventário de documentos públicos da
Prefeitura de Santo Antônio de Pádua–RJ, coletado pelo `monitor.py` na raiz
deste repositório. Serve para pesquisa de pauta: buscar, filtrar, ver a
cobertura por secretaria e por ano, exportar um recorte em CSV, e — pra um
subconjunto priorizado — **buscar dentro do texto** dos documentos (ver
"Busca no conteúdo" abaixo).

**Não é público.** Ver a seção de LGPD abaixo antes de qualquer publicação.

## Rodar

```bash
cd dashboard && npm install && npm run dev
```

Abre em <http://localhost:3000>. O `npm run dev` já copia o inventário antes
de subir (o script `predev` chama o `sync-data`).

## Atualizar os dados

O monitor regrava o `inventory.csv` na raiz do repositório a cada execução.
Para trazer a versão nova para o painel:

```bash
git pull && cd dashboard && npm run sync-data
```

O script copia `../inventory.csv` para `public/inventory.csv`, que é a única
fonte lida pelo navegador. Essa cópia é derivada e está no `.gitignore` — não
faz sentido versionar 3,3 MB duplicados a cada rodada do monitor.

Pra atualizar o índice de conteúdo depois de rodar a extração (ver
[`../textos/README.md`](../textos/README.md)):

```bash
npm run sync-conteudo
```

## Como funciona

100% client-side: não há backend, banco nem chave de API. O navegador baixa
o CSV, o PapaParse converte, e tudo — busca, filtro, agregação — roda em
memória. A tabela é virtualizada (`@tanstack/react-virtual`), então as 18 mil
linhas não vão para o DOM.

| Script | O que faz |
|---|---|
| `npm run dev` | Sincroniza os dados e sobe o servidor de desenvolvimento |
| `npm run build` | Sincroniza os dados e gera o build de produção |
| `npm run sync-data` | Só copia o `inventory.csv` da raiz para `public/` |
| `npm run sync-conteudo` | Copia `textos/conteudo.json` para `public/` (opcional — pula se não existir) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |

## O que o painel deriva do CSV

O inventário traz só seis colunas de metadado. O painel recupera o que dá
para recuperar, e marca no rodapé da tabela o que foi inferido (`*` no ano):

- **Mês** — a coluna `mes` vem vazia em 93% das linhas, mas o caminho da URL
  do portal carrega o mês (`/2021/06-junho/`). Recupera cerca de 9 mil linhas.
- **Ano** — 1.648 linhas vêm sem ano. O caminho da URL cobre os arquivos e a
  data da sessão cobre as licitações; sobram 372 sem ano identificável.
- **Licitações** — o portal entrega a licitação como uma linha de tabela
  achatada num campo só. O parser (`lib/licitacao.ts`) separa edital,
  processo, modalidade, objeto, data da sessão, valores e status. O monitor
  corta títulos em 200 caracteres, então 302 licitações perdem o fim da linha
  — nesses casos os campos faltantes ficam vazios em vez de errados.

## Busca no conteúdo

Além da busca por título/seção (o padrão), o toggle **Conteúdo** na barra de
filtros busca dentro do **texto extraído** de um subconjunto priorizado do
inventário — 400 documentos na 1ª rodada (licitações, editais, temas de
pauta do Lab e anos recentes), gerado por
[`textos/extrair_conteudo.py`](../textos/README.md). Sem o índice (ninguém
rodou a extração ainda), o toggle fica desabilitado — o painel não finge
uma cobertura que não existe.

No modo Conteúdo:
- Documentos fora do índice **não aparecem** no resultado (não tem o que
  buscar dentro).
- Cada linha mostra um **trecho** do texto em volta do termo, com destaque —
  exceto documentos sinalizados como LGPD, que mostram só um aviso
  ("trecho oculto — dado pessoal sinalizado") em vez do conteúdo real.
- No modo título/seção normal, documentos que fazem parte do lote priorizado
  ganham um selo de status (`texto indexado` · `escaneado — aguarda OCR` ·
  `erro ao extrair`) — os outros ~18 mil ficam sem selo, pra não virar ruído.

Retrato da 1ª rodada: **204 de 400 com texto** (104 nativo + 100 páginas de
licitação), **189 aguardando OCR**, 7 erros (links quebrados no portal, não
falha da extração). Detalhes e como expandir em
[`textos/README.md`](../textos/README.md).

## LGPD

O `CLAUDE.md` pede para sinalizar a seção **FOLHA DE PAGAMENTO**, mas ela não
existe no inventário: nenhuma das 33 seções do portal é folha. O dado pessoal
está espalhado nos títulos dos atos de pessoal.

O painel marca cerca de 1.580 documentos (8,6%) com um selo âmbar — a única
cor quente da interface — a partir das regras em `lib/lgpd.ts`:

| Regra | Documentos |
|---|---:|
| Ato de pessoal (exoneração, nomeação, designação) | 1.077 |
| Previdência (seção FAP, aposentadoria, pensão) | 400 |
| Licença e afastamento | 77 |
| Folha de pagamento | 14 |
| Remuneração | 12 |

É **marca de cautela, não veredito**: como só há metadado, a classificação
erra deliberadamente para o lado de sinalizar demais. Ficaram de fora termos
que na prática se referem a empresas (`RESCISÃO`, `CESSÃO` de uso da zona
industrial) e leis que fixam valores de cargo sem nominar ninguém
(`SUBSÍDIO`, `CONTRATAÇÃO TEMPORÁRIA`). Para estreitar ou ampliar, mexa só na
lista de regras em `lib/lgpd.ts`.

**Não faça deploy público** desta ferramenta sem passar pela Política de
Transparência e LGPD do Lab.

## Limite conhecido

Pra 18k−400 = ~17.980 documentos, o inventário ainda é só metadado e link —
o texto não foi extraído, e a busca (título/seção) continua cega a temas
que não aparecem no título. `ARBORIZAÇÃO` continua zero.

O lote de 400 já mostra o valor e o limite da busca no conteúdo ao mesmo
tempo: uma busca por "saneamento" no modo Conteúdo acha uma portaria sobre
"Água e Esgoto" cujo título não menciona saneamento, mas o texto cita a
"Agência Reguladora de Energia e Saneamento Básico" — achado que a busca por
título nunca faria. Por outro lado, "trânsito" bate hoje só por coincidência
de substring (a palavra "transit**ória**" contém "transit**o**"), não porque
o lote tenha conteúdo real sobre mobilidade — esse tema (como
`ARBORIZAÇÃO`) segue sem cobertura até o subconjunto crescer nessa direção
(`MAX_DOCUMENTOS` em `textos/extrair_conteudo.py`) ou a Etapa B (OCR) rodar
sobre os 189 documentos escaneados que ainda esperam.

## Estrutura

```
dashboard/
├── app/                 layout, tema e página
├── components/          Painel (estado), filtros, matriz, gráficos, tabela
├── lib/
│   ├── dados.ts         carga do CSV e enriquecimento
│   ├── licitacao.ts     parser do título-blob das licitações
│   ├── lgpd.ts          regras de dado pessoal
│   ├── conteudo.ts      carga do índice de conteúdo, trecho, status
│   ├── filtros.ts       busca, filtros e agregações
│   ├── paleta.ts        cores dos gráficos
│   └── texto.ts         normalização, meses, formatação
└── scripts/
    ├── sync-data.mjs
    └── sync-conteudo.mjs

textos/                  pipeline Python de extração (ver textos/README.md)
├── extrair_conteudo.py  Etapa A — texto nativo, sem OCR
├── ocr_conteudo.py       Etapa B — gancho, não rodado
├── conteudo.json         índice publicado (a fonte que dashboard/ sincroniza)
├── estado.json            ledger idempotente por URL
└── pdfs/                   cache de PDFs baixados (gitignored)
```
