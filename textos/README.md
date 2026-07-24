# Busca no conteúdo — extração de texto (Nível 0)

Pipeline que torna os documentos buscáveis **por dentro**, não só pelo
título. Roda fora do painel (é Python, não Next.js) e produz um índice que
o `dashboard/` consome — ver [`dashboard/README.md`](../dashboard/README.md).

## Como funciona

`extrair_conteudo.py` (Etapa A):

1. Lê `inventory.json` da raiz e seleciona um **subconjunto prioritário**
   — não os ~18 mil documentos de uma vez. Os critérios (licitação, seção
   EDITAIS, temas de pauta do Lab, anos recentes) e o limite (`MAX_DOCUMENTOS
   = 400`) estão num array configurável no topo do arquivo. A cota é
   dividida igualmente entre os critérios, pra a amostra não ficar dominada
   por um só (ex.: "ano recente" sozinho teria milhares de candidatos).
2. Para cada documento: baixa o PDF (pulando o que já está em cache),
   extrai texto nativo com `pypdf` — **sem OCR, custo zero**. Licitações são
   um caso à parte: a URL do inventário aponta pra uma **página HTML**
   (`/licitacao/abrir/{id}`), não um PDF, então o texto vem do conteúdo
   visível da página (objeto, valores, situação, anexos).
3. PDF com menos de ~20 caracteres por página é escaneado — marca
   `precisa_ocr` e segue (não trava o lote).
4. Publica `conteudo.json`: `{ url, metodo, chars, texto, sensivel, ... }`
   por documento processado.

## Rodar

```bash
pip install -r textos/requirements.txt
python textos/extrair_conteudo.py
```

Gentil com o servidor da prefeitura: User-Agent identificado, pausa de
~0,5s entre requisições novas (cache local não paga a pausa de novo).

**Idempotente e resumível**: `estado.json` guarda o resultado por URL.
Rodar de novo não reprocessa quem já deu certo — só o que falta (novos
documentos, ou os que deram erro na vez anterior). Isso é o que vai
permitir, mais pra frente, amarrar a extração ao monitor diário e processar
sozinho só os documentos novos, sem reprocessar tudo.

Depois de rodar, sincronize com o painel:

```bash
cd dashboard && npm run sync-conteudo
```

(`npm run dev` e `npm run build` já chamam isso automaticamente.)

## Expandir o subconjunto

Duas alavancas em `extrair_conteudo.py`:

- `MAX_DOCUMENTOS` — sobe o limite. Rodar de novo só baixa o delta (os que
  entraram na cota nova e ainda não foram processados).
- `CRITERIOS_PRIORITARIOS` / `TEMAS_DO_LAB` — adiciona critério ou termo de
  pauta. `TEMAS_DO_LAB` deveria espelhar `TEMAS_DO_LAB` em
  `dashboard/components/BarraFiltros.tsx`, mas são bases de código
  diferentes — sincronize à mão quando mudar um dos dois.

## LGPD

A extração aplica as mesmas regras de `dashboard/lib/lgpd.ts` (portadas pra
Python em `REGRAS_LGPD`, dentro de `extrair_conteudo.py` — mudou lá, mude
aqui também). Documento sinalizado tem o texto extraído e indexado (a busca
precisa enxergar o conteúdo pra funcionar), mas o painel **não mostra o
trecho** desses documentos — só avisa que existe e manda abrir o original.

## Etapa B — OCR (opcional, não rodada)

`ocr_conteudo.py` é o gancho pronto pra rodar OCR nos documentos marcados
`precisa_ocr`. **Não foi instalado nem rodado** — a Etapa A entrega valor
sem nenhuma dependência de sistema. Pré-requisitos e como habilitar estão
no topo do próprio arquivo (Tesseract + idioma português, Poppler,
`pip install pytesseract pdf2image`).

## Retrato da 1ª rodada (2026-07-24)

400 documentos selecionados (100 de cada critério):

| Resultado | Documentos |
|---|---:|
| Texto nativo (PDF) | 104 |
| Texto de página (licitação) | 100 |
| **Total com texto — buscável agora** | **204** |
| Escaneado — aguarda OCR | 189 |
| Erro (link quebrado no portal) | 7 |
| Sinalizados LGPD | 38 |

Os 7 erros são links genuinamente quebrados no portal (a pasta existe, o
arquivo não — duas delas com extensão duplicada `.pdf.pdf`, indício de
problema no upload da prefeitura), não falha do extrator. Vale reportar
pra prefeitura em algum momento.
