"""
Etapa A — extração de texto NATIVO (sem OCR) de um subconjunto prioritário
do inventário, para alimentar a busca no conteúdo do painel.

Rodar (da raiz do repo ou de dentro de textos/):
    pip install -r textos/requirements.txt
    python textos/extrair_conteudo.py

Idempotente: mantém um registro por URL em estado.json. Rodar de novo só
baixa/processa o que ainda falta — o resto vem do cache local em pdfs/.
Isso é o que vai permitir, mais pra frente, amarrar a extração ao monitor
diário e processar sozinho só os documentos novos.

Três formas de conteúdo no inventário, três estratégias:
  - arquivo/*.pdf   -> baixa o PDF, extrai texto nativo com pypdf.
  - licitacao       -> a URL é uma PÁGINA HTML (/licitacao/abrir/{id}), não um
                       PDF; extrai o texto visível da página (objeto, valores,
                       situação, anexos).
  - outros formatos (doc/docx/xls/xlsx/jpg...) -> fora do escopo desta etapa
                       (pypdf só lê PDF); fica marcado "formato_nao_suportado".
"""

import hashlib
import io
import json
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path

import requests
from bs4 import BeautifulSoup
from pypdf import PdfReader

# Console do Windows costuma não estar em UTF-8 por padrão; sem isto o
# progresso ao vivo sai com acento quebrado (o dado em si não é afetado).
if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# --- Caminhos -----------------------------------------------------------

AQUI = Path(__file__).resolve().parent
RAIZ_REPO = AQUI.parent
INVENTORY_JSON = RAIZ_REPO / "inventory.json"
PASTA_PDFS = AQUI / "pdfs"
ESTADO_JSON = AQUI / "estado.json"
INDICE_JSON = AQUI / "conteudo.json"

# --- Config ---------------------------------------------------------------

USER_AGENT = (
    "PaduaLabMonitor/1.0 "
    "(+https://github.com/nthnqueiroz/monitor-transparencia-padua; "
    "uso interno de pesquisa de pauta)"
)
PAUSA_ENTRE_REQUISICOES = 0.5  # segundos — gentileza com o servidor da prefeitura
TIMEOUT = 20

MAX_DOCUMENTOS = 400
CHARS_MIN_POR_PAGINA = 20  # abaixo disso, o PDF provavelmente é escaneado
LIMITE_CHARS_POR_DOC = 20_000  # trava contra PDFs enormes fora do padrão

# Temas de pauta do Lab — mantenha em sincronia (manualmente; são bases de
# código diferentes) com TEMAS_DO_LAB em dashboard/components/BarraFiltros.tsx.
TEMAS_DO_LAB = [
    "ponte",
    "rio pomba",
    "enchente",
    "drenagem",
    "esgoto",
    "saneamento",
    "água",
    "arboriza",
    "obra",
]

ANOS_RECENTES = {"2024", "2025", "2026"}


def normalizar(texto):
    """Sem acento, minúsculo — mesma ideia do semAcento() do painel."""
    nfd = unicodedata.normalize("NFD", texto or "")
    sem_acento = "".join(c for c in nfd if not unicodedata.combining(c))
    return sem_acento.lower()


def eh_licitacao(doc):
    return doc.get("category") == "licitacao"


def eh_edital(doc):
    return doc.get("section") == "EDITAIS"


def bate_tema_do_lab(doc):
    titulo = normalizar(doc.get("title") or "")
    return any(normalizar(t) in titulo for t in TEMAS_DO_LAB)


def eh_ano_recente(doc):
    return doc.get("year") in ANOS_RECENTES


# Ordem = prioridade de alocação da cota (ver selecionar_subconjunto).
CRITERIOS_PRIORITARIOS = [
    ("licitacao", eh_licitacao),
    ("edital", eh_edital),
    ("tema_do_lab", bate_tema_do_lab),
    ("ano_recente", eh_ano_recente),
]


# --- LGPD -------------------------------------------------------------------
# Espelha lib/lgpd.ts do painel (mesmas regras, portadas pra Python). Mudou
# lá, mude aqui — são bases de código diferentes, não há como compartilhar.

REGRAS_LGPD = [
    {
        "rotulo": "Folha de pagamento",
        "titulo": re.compile(
            r"FOLHA\s+DE\s+PAGAMENTO|FOLHA\s+SALARIAL|"
            r"FOLHA\s+DE\s+(JANEIRO|FEVEREIRO|MAR[ÇC]O|ABRIL|MAIO|JUNHO|JULHO|"
            r"AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)",
            re.IGNORECASE,
        ),
    },
    {
        "rotulo": "Previdência",
        "titulo": re.compile(r"\bAPOSENTA|\bPENS[ÃA]O\b|\bPENSIONISTA", re.IGNORECASE),
        "secao": re.compile(r"^FAP$", re.IGNORECASE),
    },
    {
        "rotulo": "Ato de pessoal",
        "titulo": re.compile(r"\bEXONERA|\bNOMEA|\bDESIGNA|\bADMISS[ÃA]O\b", re.IGNORECASE),
    },
    {
        "rotulo": "Licença e afastamento",
        "titulo": re.compile(
            r"\bVENCIMENTOS?\b|LICEN[ÇC]A\s+(SEM\s+VENCIMENTO|PR[ÊE]MIO|M[ÉE]DICA|"
            r"MATERNIDADE|PATERNIDADE|PARA\s+TRATAR)",
            re.IGNORECASE,
        ),
    },
    {
        "rotulo": "Remuneração",
        "titulo": re.compile(r"\bREMUNERA|\bCONTRACHEQUE|\bSAL[ÁA]RIO\b", re.IGNORECASE),
    },
]


def marcar_sensivel(titulo, secao):
    titulo = titulo or ""
    secao = secao or ""
    for regra in REGRAS_LGPD:
        secao_bate = "secao" in regra and regra["secao"].search(secao)
        titulo_bate = "titulo" in regra and regra["titulo"].search(titulo)
        if secao_bate or titulo_bate:
            return regra["rotulo"]
    return None


# --- Seleção do subconjunto -------------------------------------------------


def chave_ordem(documentos, url):
    """Mais recente primeiro; sem ano identificável vai pro fim."""
    ano = documentos[url].get("year")
    return (ano is None, -int(ano) if ano else 0)


def selecionar_subconjunto(documentos):
    """
    Cota igual por critério (MAX_DOCUMENTOS / nº de critérios), pra evitar
    que o critério mais numeroso (ano_recente tem milhares de candidatos)
    engula sozinho o lote e deixe a amostra pouco diversa. Sobra de cota
    de um critério com poucos candidatos é redistribuída pros seguintes,
    na ordem de CRITERIOS_PRIORITARIOS.

    Retorna [(url, motivo), ...], no máximo MAX_DOCUMENTOS.
    """
    candidatos_por_criterio = {}
    for nome, teste in CRITERIOS_PRIORITARIOS:
        candidatos = [url for url, doc in documentos.items() if teste(doc)]
        candidatos.sort(key=lambda u: chave_ordem(documentos, u))
        candidatos_por_criterio[nome] = candidatos

    ja_incluido = set()
    escolhidos = []
    quota_base = MAX_DOCUMENTOS // len(CRITERIOS_PRIORITARIOS)

    for nome, _ in CRITERIOS_PRIORITARIOS:
        disponiveis = [u for u in candidatos_por_criterio[nome] if u not in ja_incluido]
        for url in disponiveis[:quota_base]:
            escolhidos.append((url, nome))
            ja_incluido.add(url)

    sobra = MAX_DOCUMENTOS - len(escolhidos)
    if sobra > 0:
        for nome, _ in CRITERIOS_PRIORITARIOS:
            if sobra <= 0:
                break
            disponiveis = [u for u in candidatos_por_criterio[nome] if u not in ja_incluido]
            for url in disponiveis[:sobra]:
                escolhidos.append((url, nome))
                ja_incluido.add(url)
                sobra -= 1

    return escolhidos


# --- Extração ----------------------------------------------------------------


def slug_arquivo(url):
    h = hashlib.sha1(url.encode("utf-8")).hexdigest()[:20]
    return f"{h}.pdf"


def extrair_extensao(url):
    caminho = url.split("?")[0].rsplit("/", 1)[-1]
    if "." in caminho:
        return caminho.rsplit(".", 1)[-1].lower()
    return None


def baixar_pdf(url, sessao):
    """
    Baixa o PDF (ou usa o cache local) e devolve os bytes.

    O portal às vezes devolve HTTP 200 com uma página HTML no lugar do PDF —
    a pasta existe, mas o arquivo sumiu (link quebrado, não um 404 de verdade).
    Sem checar a assinatura, isso vira um "precisa_ocr" falso (0 caracteres,
    mas por um motivo completamente diferente de ser escaneado). Rejeita
    antes de cachear, pra não gravar lixo em pdfs/.
    """
    caminho = PASTA_PDFS / slug_arquivo(url)
    if caminho.exists():
        return caminho.read_bytes()

    time.sleep(PAUSA_ENTRE_REQUISICOES)
    resp = sessao.get(url, timeout=TIMEOUT)
    resp.raise_for_status()

    if not resp.content.startswith(b"%PDF-"):
        tipo = resp.headers.get("content-type", "desconhecido")
        raise ValueError(
            f"resposta não é um PDF (content-type: {tipo}) — "
            "provável link quebrado no portal, não um documento escaneado"
        )

    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_bytes(resp.content)
    return resp.content


def extrair_texto_pdf(conteudo_bytes):
    reader = PdfReader(io.BytesIO(conteudo_bytes))
    n_paginas = len(reader.pages)
    partes = [(pagina.extract_text() or "") for pagina in reader.pages]
    return "\n".join(partes).strip(), n_paginas


def extrair_texto_licitacao(url, sessao):
    """A página de licitação não é cacheada em disco como as PDFs — é HTML
    leve e rápido de buscar de novo; a idempotência já vem de pular URLs
    que já estão em estado.json com sucesso."""
    resp = sessao.get(url, timeout=TIMEOUT)
    resp.raise_for_status()
    soup = BeautifulSoup(resp.text, "html.parser")
    for tag in soup(["script", "style", "nav", "header", "footer"]):
        tag.decompose()
    # Sem seletor CSS estável pro miolo da página, pega o texto inteiro —
    # o menu/rodapé do portal vira ruído, mas a busca convive com isso (é a
    # mesma troca já aceita na busca por título+seção do inventário).
    texto = soup.get_text(separator="\n", strip=True)
    linhas = [l for l in texto.splitlines() if l.strip()]
    return "\n".join(linhas), 1


def agora_iso():
    return datetime.now(timezone.utc).isoformat()


def montar_resultado(url, doc, texto, paginas, metodo, erro=None):
    texto = (texto or "").strip()
    truncado = len(texto) > LIMITE_CHARS_POR_DOC
    if truncado:
        texto = texto[:LIMITE_CHARS_POR_DOC]
    return {
        "url": url,
        "metodo": metodo,
        "chars": len(texto),
        "paginas": paginas,
        "truncado": truncado,
        "sensivel": marcar_sensivel(doc.get("title"), doc.get("section")),
        "texto": texto,
        "erro": erro,
        "processado_em": agora_iso(),
    }


def processar_documento(url, doc, sessao):
    if eh_licitacao(doc):
        try:
            time.sleep(PAUSA_ENTRE_REQUISICOES)
            texto, paginas = extrair_texto_licitacao(url, sessao)
        except Exception as e:  # noqa: BLE001 — não pode derrubar o lote inteiro
            return montar_resultado(url, doc, "", 0, "erro", f"pagina: {e}")
        return montar_resultado(url, doc, texto, paginas, "pagina_html")

    if extrair_extensao(url) != "pdf":
        return montar_resultado(url, doc, "", 0, "formato_nao_suportado")

    try:
        conteudo = baixar_pdf(url, sessao)
    except Exception as e:  # noqa: BLE001
        return montar_resultado(url, doc, "", 0, "erro", f"download: {e}")

    try:
        texto, paginas = extrair_texto_pdf(conteudo)
    except Exception as e:  # noqa: BLE001
        return montar_resultado(url, doc, "", 0, "erro", f"extracao: {e}")

    chars_por_pagina = len(texto) / max(1, paginas)
    metodo = "nativo" if chars_por_pagina >= CHARS_MIN_POR_PAGINA else "precisa_ocr"
    return montar_resultado(url, doc, texto, paginas, metodo)


# --- Estado / índice ----------------------------------------------------------


def carregar_estado():
    if ESTADO_JSON.exists():
        return json.loads(ESTADO_JSON.read_text(encoding="utf-8"))
    return {}


def salvar_estado(estado):
    ESTADO_JSON.write_text(
        json.dumps(estado, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8"
    )


def publicar_indice(estado, escolhidos):
    documentos = [estado[url] for url, _ in escolhidos if url in estado]
    indice = {
        "gerado_em": agora_iso(),
        "criterios": [nome for nome, _ in CRITERIOS_PRIORITARIOS],
        "limite": MAX_DOCUMENTOS,
        "documentos": documentos,
    }
    INDICE_JSON.write_text(json.dumps(indice, ensure_ascii=False), encoding="utf-8")


def imprimir_resumo(estado, escolhidos):
    contagem = {}
    for url, _ in escolhidos:
        metodo = estado.get(url, {}).get("metodo", "nao_processado")
        contagem[metodo] = contagem.get(metodo, 0) + 1

    print("\n=== RESUMO ===")
    print(f"subconjunto selecionado: {len(escolhidos)} documentos")
    for metodo, n in sorted(contagem.items(), key=lambda kv: -kv[1]):
        print(f"  {metodo:<24} {n}")

    sensiveis = sum(1 for url, _ in escolhidos if estado.get(url, {}).get("sensivel"))
    print(f"  {'(sinalizados LGPD)':<24} {sensiveis}")


# --- Main ----------------------------------------------------------------


def main():
    if not INVENTORY_JSON.exists():
        print(f"Não encontrei {INVENTORY_JSON}. Rode da raiz do repo do monitor.")
        sys.exit(1)

    documentos = json.loads(INVENTORY_JSON.read_text(encoding="utf-8"))["documents"]
    escolhidos = selecionar_subconjunto(documentos)
    print(f"{len(escolhidos)} documentos selecionados (limite {MAX_DOCUMENTOS}).")

    estado = carregar_estado()
    ja_prontos = sum(
        1 for url, _ in escolhidos if url in estado and estado[url].get("metodo") not in (None, "erro")
    )
    if ja_prontos:
        print(f"{ja_prontos} já processados em uma rodada anterior — pulando (resumível).")

    sessao = requests.Session()
    sessao.headers.update({"User-Agent": USER_AGENT})

    processados_agora = 0
    for i, (url, motivo) in enumerate(escolhidos, 1):
        anterior = estado.get(url)
        if anterior and anterior.get("metodo") not in (None, "erro"):
            continue

        doc = documentos[url]
        resultado = processar_documento(url, doc, sessao)
        resultado["motivo"] = motivo
        estado[url] = resultado
        processados_agora += 1

        marca = {
            "nativo": "✓",
            "pagina_html": "✓",
            "precisa_ocr": "~",
            "formato_nao_suportado": "-",
            "erro": "✗",
        }.get(resultado["metodo"], "?")
        print(f"  [{i}/{len(escolhidos)}] {marca} {resultado['metodo']:<22} {resultado['chars']:>6}c  {url}")

        if processados_agora % 20 == 0:
            salvar_estado(estado)

    salvar_estado(estado)
    publicar_indice(estado, escolhidos)
    imprimir_resumo(estado, escolhidos)
    print(f"\nÍndice publicado em {INDICE_JSON.relative_to(RAIZ_REPO)}")
    print("Rode `npm run sync-conteudo` (ou `npm run dev`) em dashboard/ para o painel usar a versão nova.")


if __name__ == "__main__":
    main()
