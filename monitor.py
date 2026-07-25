#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monitor do Portal da Transparência da Prefeitura de Santo Antônio de Pádua–RJ.

COBERTURA (v2 — completa):
  - Todas as seções/secretarias em /portal/arquivo/{id}, entrando RECURSIVAMENTE
    nas pastas de ano e de mês (ano -> mês -> documentos).
  - Licitações (/licitacao) com paginação (?page=N).
  - Páginas especiais que hospedam arquivos (Estrutura, e-SIC, Dúvidas).

DOIS MODOS (variável de ambiente SCAN_MODE):
  - "recent" (padrão, usado no agendamento diário): varre só o ano atual e o
    anterior (com todos os meses) + primeiras páginas de licitação. Rápido.
    Suficiente para pegar todo documento NOVO.
  - "full": varre TODOS os anos de todas as seções + todas as licitações.
    Use uma vez para montar o inventário histórico completo (inventory.csv/json)
    e a baseline inicial. É bem mais demorado.

SAÍDAS:
  - state/seen.json : memória do que já foi visto (não apagar).
  - inventory.csv / inventory.json : inventário de tudo que já foi catalogado.
  - Notificações por e-mail e WhatsApp quando surge documento NOVO.

Configuração por variáveis de ambiente (ver README.md).
"""

import os
import re
import sys
import csv
import json
import time
import smtplib
import datetime
from email.mime.text import MIMEText
from email.header import Header
from urllib.parse import urljoin, urlparse, unquote, quote_plus

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuração geral
# ---------------------------------------------------------------------------

BASE = "https://santoantoniodepadua.rj.gov.br"
INDEX_URL = f"{BASE}/portal/transparencia"

STATE_FILE = os.path.join(os.path.dirname(__file__), "state", "seen.json")
INVENTORY_CSV = os.path.join(os.path.dirname(__file__), "inventory.csv")
INVENTORY_JSON = os.path.join(os.path.dirname(__file__), "inventory.json")

NOW = datetime.datetime.now(datetime.timezone.utc)
NOW_ISO = NOW.replace(microsecond=0).isoformat()
# Anos varridos no modo "recent" (diário): atual + anterior.
RECENT_YEARS = {NOW.year, NOW.year - 1}

REQUEST_DELAY = float(os.environ.get("REQUEST_DELAY", "0.4"))
REQUEST_TIMEOUT = 30
# Trava de segurança: máximo de páginas por seção (evita loop infinito).
MAX_PAGES_PER_SECTION = int(os.environ.get("MAX_PAGES_PER_SECTION", "1500"))
# Corte do titulo das linhas da tabela de licitacao. A linha inteira (objeto +
# data + valor estimado + valor homologado + status) vem concatenada, e um corte
# curto decapita justamente valor e status, que ficam no fim. Ajustavel por env.
# ATENCAO: este numero esta ESPELHADO em dashboard/lib/dados.ts
# (const CORTE_DO_MONITOR). Se mudar aqui, mude la tambem.
CORTE_TITULO_LICITACAO = int(os.environ.get("CORTE_TITULO_LICITACAO", "600"))
USER_AGENT = (
    "Mozilla/5.0 (compatible; MonitorTransparenciaPadua/2.0; "
    "monitoramento civico de documentos publicos)"
)

FILE_EXT = re.compile(
    r"\.(pdf|docx?|xlsx?|pptx?|odt|ods|csv|txt|zip|rar|7z|png|jpe?g|gif)$", re.I
)
MONTHS = {
    "janeiro", "fevereiro", "marco", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
}

# Seções conhecidas (id -> nome). A auto-descoberta complementa esta lista.
SECTIONS = {
    1: "LEIS", 2: "DECRETOS", 3: "ATOS", 4: "PORTARIAS", 5: "LRF", 6: "DEMUT",
    8: "SECRETARIA DE EDUCACAO", 9: "SECRETARIA DE ADMINISTRACAO",
    12: "TRANSPARENCIA COVID-19", 13: "CONTROLE INTERNO",
    14: "SECRETARIA DE ASSISTENCIA SOCIAL", 15: "SECRETARIA DE FAZENDA",
    16: "EDITAIS", 17: "FOLHA DE PAGAMENTO",
    18: "SECRETARIA DE INDUSTRIA, COMERCIO E RECURSOS MINERAIS", 19: "FAP",
    20: "SECRETARIA DE MEIO AMBIENTE", 24: "CONVENIOS/CONTRATOS",
    25: "SECRETARIA DE SAUDE", 26: "SECRETARIA DE TRANSPORTES",
    27: "SECRETARIA DE OBRAS", 28: "CHEFIA DE GABINETE",
    29: "SECRETARIA DE SEGURANCA PUBLICA", 30: "SECRETARIA DE AGRICULTURA",
    31: "SECRETARIA DE TURISMO", 32: "SECRETARIA DE ESPORTES",
    33: "PROCURADORIA", 34: "SECRETARIA DE CULTURA",
    35: "SECRETARIA DE ILUMINACAO PUBLICA", 36: "AGUA E ESGOTO",
    37: "SECRETARIA DEFESA CIVIL", 39: "LEIS ORCAMENTARIAS",
    40: "PLANEJAMENTO DE CONTRATACOES", 41: "NOTA FISCAL NACIONAL",
    43: "EMENDAS PARLAMENTARES",
}

# Páginas especiais (fora do padrão /arquivo) que podem ter arquivos anexados.
SPECIAL_PAGES = [
    ("ESTRUTURA ADMINISTRATIVA", f"{BASE}/portal/estrutura"),
    ("E-SIC", f"{BASE}/esic"),
    ("DUVIDAS FREQUENTES", f"{BASE}/portal/duvidas"),
]


# ---------------------------------------------------------------------------
# HTTP + parsing helpers
# ---------------------------------------------------------------------------

def make_session():
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT})
    return s


def fetch(session, url):
    """Baixa uma URL. Retorna (html_text, ok). Nunca levanta exceção."""
    try:
        r = session.get(url, timeout=REQUEST_TIMEOUT)
        if r.status_code == 200:
            return r.text, True
        if r.status_code == 404:
            return "", True  # 404 é normal (ano/mês inexistente)
        print(f"  [aviso] {url} -> HTTP {r.status_code}")
        return "", False
    except requests.RequestException as e:
        print(f"  [erro] falha ao acessar {url}: {e}")
        return "", False


def parse_links(text, base_url):
    """Retorna lista de (abs_url, texto_do_link, tag_a)."""
    out = []
    soup = BeautifulSoup(text, "html.parser")
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if (not href or href.startswith("#")
                or href.lower().startswith("javascript:")
                or href.lower().startswith("mailto:")):
            continue
        abs_url = urljoin(base_url, href)
        title = " ".join(a.get_text(strip=True).split())
        out.append((abs_url, title, a))
    return out


def is_file(url):
    clean = url.split("?")[0].split("#")[0]
    return bool(FILE_EXT.search(clean))


def path_of(url):
    return urlparse(url).path


def parse_year_month(path, prefix):
    """Extrai ano e mês (se houver) dos segmentos após o prefixo da seção."""
    seg = [unquote(s) for s in path[len(prefix):].split("/") if s]
    year = month = None
    for s in seg:
        if re.fullmatch(r"\d{4}", s):
            year = s
        elif s.lower() in MONTHS:
            month = s
    return year, month


# ---------------------------------------------------------------------------
# Descoberta de seções
# ---------------------------------------------------------------------------

def discover_sections(session):
    sections = dict(SECTIONS)
    text, ok = fetch(session, INDEX_URL)
    if ok and text:
        for abs_url, atext, _ in parse_links(text, INDEX_URL):
            m = re.search(r"/portal/arquivo/(\d+)(?:/|$)", abs_url)
            if not m:
                continue
            sid = int(m.group(1))
            name = atext or f"SECAO {sid}"
            if sid not in sections or (name and not name.startswith("SECAO")):
                sections[sid] = name
    else:
        print("  [aviso] nao consegui auto-descobrir secoes; usando lista fixa.")
    return sections


# ---------------------------------------------------------------------------
# Crawlers
# ---------------------------------------------------------------------------

def crawl_arquivo_section(session, sid, name, years_allowed, stats):
    """Crawl recursivo dentro de /portal/arquivo/{sid}: entra em anos e meses
    e coleta todos os arquivos. years_allowed=None => todos os anos."""
    docs = {}
    prefix = f"/portal/arquivo/{sid}"
    root = BASE + prefix
    queue = [root]
    enqueued = {root}
    visited = set()
    pages = 0

    while queue and pages < MAX_PAGES_PER_SECTION:
        url = queue.pop()
        base = url.split("#")[0]
        if base in visited:
            continue
        visited.add(base)
        text, ok = fetch(session, url)
        pages += 1
        stats["pages"] += 1
        time.sleep(REQUEST_DELAY)
        if not ok or not text:
            continue

        for abs_url, atext, _ in parse_links(text, url):
            p = path_of(abs_url)
            # Só o que está dentro desta seção (respeitando limite de palavra:
            # seção 4 não pode casar com 40/41/43).
            if not (p == prefix or p.startswith(prefix + "/")):
                continue

            if is_file(abs_url):
                if abs_url not in docs:
                    year, month = parse_year_month(p, prefix)
                    docs[abs_url] = {
                        "title": atext or unquote(abs_url.rsplit("/", 1)[-1]),
                        "section": name, "section_id": sid,
                        "year": year, "month": month, "category": "arquivo",
                    }
                continue

            # É pasta (ano/mês). Filtra ano quando aplicável.
            seg = [s for s in p[len(prefix):].split("/") if s]
            if len(seg) == 1 and re.fullmatch(r"\d{4}", seg[0]):
                if years_allowed is not None and int(seg[0]) not in years_allowed:
                    continue
            b = abs_url.split("#")[0]
            if b not in visited and b not in enqueued:
                enqueued.add(b)
                queue.append(abs_url)

    if pages >= MAX_PAGES_PER_SECTION:
        print(f"  [aviso] secao {sid} atingiu o limite de {MAX_PAGES_PER_SECTION} paginas.")
    return docs


def crawl_licitacoes(session, max_pages, stats):
    """Coleta as licitações (cada linha -> /licitacao/abrir/{id}) paginando."""
    items = {}
    for page in range(1, max_pages + 1):
        url = f"{BASE}/licitacao?page={page}"
        text, ok = fetch(session, url)
        stats["pages"] += 1
        time.sleep(REQUEST_DELAY)
        if not ok or not text:
            break
        found_here = 0
        soup = BeautifulSoup(text, "html.parser")
        for a in soup.find_all("a", href=True):
            abs_url = urljoin(url, a["href"])
            m = re.search(r"/licitacao/abrir/(\d+)", abs_url)
            if not m:
                continue
            lid = m.group(1)
            key = f"{BASE}/licitacao/abrir/{lid}"
            if key in items:
                continue
            row = a.find_parent("tr")
            if row:
                title = " ".join(row.get_text(" ", strip=True).split())[:CORTE_TITULO_LICITACAO]
            else:
                title = a.get_text(strip=True)
            if not title:
                title = f"Licitacao {lid}"
            items[key] = {
                "title": title, "section": "LICITACOES",
                "category": "licitacao", "section_id": None,
                "year": None, "month": None,
            }
            found_here += 1
        if found_here == 0:
            break  # acabou a lista
    return items


def crawl_special(session, name, url, stats):
    """Extrai arquivos anexados de uma página avulsa (sem recursão profunda)."""
    docs = {}
    text, ok = fetch(session, url)
    stats["pages"] += 1
    time.sleep(REQUEST_DELAY)
    if not ok or not text:
        return docs
    for abs_url, atext, _ in parse_links(text, url):
        if is_file(abs_url):
            docs[abs_url] = {
                "title": atext or unquote(abs_url.rsplit("/", 1)[-1]),
                "section": name, "section_id": None,
                "year": None, "month": None, "category": "pagina",
            }
    return docs


def scan(session, sections, mode):
    found = {}
    stats = {"pages": 0, "sections_ok": 0, "sections_fail": 0}
    years_allowed = None if mode == "full" else set(RECENT_YEARS)

    for sid, name in sorted(sections.items()):
        d = crawl_arquivo_section(session, sid, name, years_allowed, stats)
        if d:
            stats["sections_ok"] += 1
        else:
            stats["sections_fail"] += 1
        found.update(d)
        print(f"  secao {sid:>3} {name}: {len(d)} arquivos")

    if env_bool("SPECIAL_ENABLED", True):
        for nm, u in SPECIAL_PAGES:
            sp = crawl_special(session, nm, u, stats)
            found.update(sp)
            if sp:
                print(f"  especial {nm}: {len(sp)} arquivos")

    if env_bool("LICITACOES_ENABLED", True):
        if mode == "full":
            maxp = int(os.environ.get("LICITACOES_MAX_PAGES", "200"))
        else:
            maxp = int(os.environ.get("LICITACOES_RECENT_PAGES", "3"))
        lic = crawl_licitacoes(session, maxp, stats)
        found.update(lic)
        print(f"  licitacoes: {len(lic)} itens")

    return found, stats


# ---------------------------------------------------------------------------
# Estado + inventário
# ---------------------------------------------------------------------------

def load_state():
    if not os.path.exists(STATE_FILE):
        return {"initialized": False, "documents": {}}
    try:
        with open(STATE_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        data.setdefault("initialized", bool(data.get("documents")))
        data.setdefault("documents", {})
        return data
    except (json.JSONDecodeError, OSError):
        return {"initialized": False, "documents": {}}


def save_state(state):
    os.makedirs(os.path.dirname(STATE_FILE), exist_ok=True)
    state["last_run_utc"] = NOW_ISO
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)


def write_inventory(documents):
    """Gera inventory.csv e inventory.json a partir da memória cumulativa."""
    rows = sorted(
        documents.items(),
        key=lambda kv: (
            kv[1].get("category", ""), kv[1].get("section", ""),
            str(kv[1].get("year") or ""), kv[1].get("title", ""),
        ),
    )
    with open(INVENTORY_CSV, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f)
        w.writerow(["categoria", "secao", "ano", "mes", "titulo", "url"])
        for url, m in rows:
            w.writerow([
                m.get("category", ""), m.get("section", ""),
                m.get("year") or "", m.get("month") or "",
                m.get("title", ""), url,
            ])
    with open(INVENTORY_JSON, "w", encoding="utf-8") as f:
        json.dump(
            {"total": len(documents), "generated_utc": NOW_ISO, "documents": documents},
            f, ensure_ascii=False, indent=2, sort_keys=True,
        )
    print(f"  inventario atualizado: {len(documents)} documentos "
          f"(inventory.csv / inventory.json)")


# ---------------------------------------------------------------------------
# Notificações
# ---------------------------------------------------------------------------

def env_bool(name, default=False):
    v = os.environ.get(name)
    if v is None:
        return default
    return v.strip().lower() in ("1", "true", "yes", "sim", "on")


def send_email(subject, body_text):
    if not env_bool("EMAIL_ENABLED"):
        return
    host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    passwd = os.environ.get("SMTP_PASS", "")
    to = os.environ.get("EMAIL_TO", user)
    if not (user and passwd and to):
        print("  [aviso] EMAIL_ENABLED mas faltam SMTP_USER/SMTP_PASS/EMAIL_TO.")
        return
    msg = MIMEText(body_text, "plain", "utf-8")
    msg["Subject"] = Header(subject, "utf-8")
    msg["From"] = user
    msg["To"] = to
    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.starttls()
            server.login(user, passwd)
            server.sendmail(user, [x.strip() for x in to.split(",")], msg.as_string())
        print("  [ok] e-mail enviado.")
    except Exception as e:  # noqa
        print(f"  [erro] falha ao enviar e-mail: {e}")


def send_whatsapp(body_text):
    if not env_bool("WHATSAPP_ENABLED"):
        return
    phone = os.environ.get("CALLMEBOT_PHONE", "").strip()
    apikey = os.environ.get("CALLMEBOT_APIKEY", "").strip()
    if not (phone and apikey):
        print("  [aviso] WHATSAPP_ENABLED mas faltam CALLMEBOT_PHONE/CALLMEBOT_APIKEY.")
        return
    text = body_text
    if len(text) > 900:
        text = text[:880] + "\n... (lista completa no e-mail)"
    url = (
        "https://api.callmebot.com/whatsapp.php"
        f"?phone={quote_plus(phone)}&text={quote_plus(text)}&apikey={quote_plus(apikey)}"
    )
    try:
        r = requests.get(url, timeout=30)
        body = (r.text or "")[:200].replace("\n", " ")
        if r.status_code == 200:
            print(f"  [ok] WhatsApp enviado. Resposta CallMeBot: {body}")
        else:
            print(f"  [aviso] CallMeBot HTTP {r.status_code}: {body}")
    except requests.RequestException as e:
        print(f"  [erro] falha ao enviar WhatsApp: {e}")


def notify(subject, body_text):
    send_email(subject, body_text)
    send_whatsapp(body_text)


def format_new_docs(new_docs):
    by_section = {}
    for url, meta in new_docs:
        by_section.setdefault(meta["section"], []).append(
            (meta.get("year"), meta.get("title", ""), url)
        )
    lines = [f"{len(new_docs)} documento(s) novo(s) no Portal da Transparencia "
             "de Santo Antonio de Padua:\n"]
    for section in sorted(by_section):
        lines.append(f"== {section} ==")
        for year, title, url in by_section[section]:
            tag = f"[{year}] " if year else ""
            lines.append(f"- {tag}{title}")
            lines.append(f"  {url}")
        lines.append("")
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Saúde
# ---------------------------------------------------------------------------

def health_check(found, stats, state):
    prev_count = len(state.get("documents", {}))
    if stats["sections_ok"] == 0:
        return False, (
            "ALERTA: o monitor nao conseguiu acessar NENHUMA secao do portal. "
            "O site pode estar fora do ar. Nenhuma verificacao foi feita."
        )
    if prev_count > 0 and len(found) == 0:
        return False, (
            "ALERTA: o monitor acessou o site mas nao encontrou NENHUM documento, "
            f"sendo que na ultima vez havia {prev_count}. Provavel mudanca de "
            "estrutura do portal — o script precisa de ajuste."
        )
    return True, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    mode = os.environ.get("SCAN_MODE", "recent").strip().lower()
    if mode not in ("recent", "full"):
        mode = "recent"
    print(f"== Monitor Transparencia Padua v2 == {NOW_ISO} | modo: {mode}")

    session = make_session()
    sections = discover_sections(session)
    print(f"Secoes a monitorar: {len(sections)} | "
          f"anos: {'TODOS' if mode == 'full' else sorted(RECENT_YEARS)}")

    found, stats = scan(session, sections, mode)
    print(f"\nResumo: paginas={stats['pages']} | secoes ok={stats['sections_ok']} "
          f"| falhas={stats['sections_fail']} | documentos encontrados={len(found)}")

    state = load_state()

    ok, alert = health_check(found, stats, state)
    if not ok:
        print(alert)
        notify("[Transparencia Padua] Monitor: possivel problema", alert)
        return 1

    if not state.get("initialized"):
        state["documents"] = found
        state["initialized"] = True
        save_state(state)
        write_inventory(state["documents"])
        msg = (
            f"Monitor iniciado (modo {mode}). Baseline registrada com {len(found)} "
            f"documentos. A partir de agora voce sera avisado apenas quando surgir "
            "documento NOVO."
        )
        print(msg)
        notify("[Transparencia Padua] Monitor ativado", msg)
        return 0

    known = state.get("documents", {})
    new_docs = [(u, m) for u, m in found.items() if u not in known]

    merged = dict(known)
    merged.update(found)
    state["documents"] = merged
    save_state(state)
    write_inventory(merged)

    if not new_docs:
        print("Nenhum documento novo.")
        return 0

    new_docs.sort(key=lambda x: (x[1]["section"], str(x[1].get("year") or ""), x[1]["title"]))
    body = format_new_docs(new_docs)
    subject = f"[Transparencia Padua] {len(new_docs)} documento(s) novo(s)"
    print(body)
    notify(subject, body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
