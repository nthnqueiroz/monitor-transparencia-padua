# Painel Interno de Transparência — Pádua Lab

Ferramenta interna de exploração do inventário de documentos públicos da
Prefeitura de Santo Antônio de Pádua–RJ, coletado pelo `monitor.py` na raiz
deste repositório. Serve para pesquisa de pauta: buscar, filtrar, ver a
cobertura por secretaria e por ano, e exportar um recorte em CSV.

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

O inventário é metadado e link — o texto dentro dos PDFs não foi extraído.
Na prática isso significa que temas cujo assunto não aparece no título são
invisíveis para a busca: `ARBORIZAÇÃO` e `TRÂNSITO` retornam zero resultados,
e `ENCHENTE` retorna três. A camada de OCR (fase futura) é o que destrava
essas pautas.

## Estrutura

```
dashboard/
├── app/                 layout, tema e página
├── components/          Painel (estado), filtros, matriz, gráficos, tabela
├── lib/
│   ├── dados.ts         carga do CSV e enriquecimento
│   ├── licitacao.ts     parser do título-blob das licitações
│   ├── lgpd.ts          regras de dado pessoal
│   ├── filtros.ts       busca, filtros e agregações
│   ├── paleta.ts        cores dos gráficos
│   └── texto.ts         normalização, meses, formatação
└── scripts/sync-data.mjs
```
