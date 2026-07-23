#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monitor do Portal da Transparência da Prefeitura de Santo Antônio de Pádua–RJ.

O que faz:
  - Varre todas as seções/secretarias do portal (auto-descoberta + lista fixa).
  - Extrai todos os documentos (PDFs) publicados por seção/ano.
  - Compara com o estado da última verificação (state/seen.json).
  - Se houver documento NOVO, avisa por e-mail e/ou WhatsApp (CallMeBot).
  - No primeiro run, apenas registra a "baseline" (não dispara alerta de tudo).
  - Detecta se o site caiu ou mudou de estrutura e avisa em vez de ficar mudo.

Só depende de: requests, beautifulsoup4  (ver requirements.txt)

Configuração por variáveis de ambiente (ver README.md):
  # E-mail (Gmail recomendado)
  EMAIL_ENABLED=true
  SMTP_HOST=smtp.gmail.com
  SMTP_PORT=587
  SMTP_USER=seuemail@gmail.com
  SMTP_PASS=app_password_de_16_digitos
  EMAIL_TO=destino@gmail.com          # pode ser o mesmo do SMTP_USER

  # WhatsApp via CallMeBot (grátis)
  WHATSAPP_ENABLED=true
  CALLMEBOT_PHONE=+5522999999999
  CALLMEBOT_APIKEY=123456
"""

import os
import re
import sys
import json
import time
import html
import smtplib
import datetime
from email.mime.text import MIMEText
from email.header import Header
from urllib.parse import urljoin, quote_plus

import requests
from bs4 import BeautifulSoup

# ---------------------------------------------------------------------------
# Configuração geral
# ---------------------------------------------------------------------------

BASE = "https://santoantoniodepadua.rj.gov.br"
# Página que lista o menu da transparência (usada para auto-descobrir seções).
INDEX_URL = f"{BASE}/portal/transparencia"
# Padrão de URL de cada seção: /portal/arquivo/{id}/{ano}
SECTION_URL = BASE + "/portal/arquivo/{sid}/{year}"

STATE_FILE = os.path.join(os.path.dirname(__file__), "state", "seen.json")

# Quais anos varrer em cada seção. Mantemos o ano atual e o anterior para
# pegar documentos publicados de forma retroativa. Ajuste se quiser.
NOW = datetime.datetime.utcnow()
YEARS = [NOW.year, NOW.year - 1]

# Espera entre requisições (segundos) para não sobrecarregar o servidor.
REQUEST_DELAY = 0.6
REQUEST_TIMEOUT = 30
USER_AGENT = (
    "Mozilla/5.0 (compatible; MonitorTransparenciaPadua/1.0; "
    "monitoramento civico de documentos publicos)"
)

# Seções conhecidas (id -> nome). A auto-descoberta complementa esta lista,
# então se a prefeitura criar uma secretaria nova ela entra sozinha.
SECTIONS = {
    1:  "LEIS",
    2:  "DECRETOS",
    3:  "ATOS",
    4:  "PORTARIAS",
    5:  "LRF",
    6:  "DEMUT",
    8:  "SECRETARIA DE EDUCACAO",
    9:  "SECRETARIA DE ADMINISTRACAO",
    12: "TRANSPARENCIA COVID-19",
    13: "CONTROLE INTERNO",
    14: "SECRETARIA DE ASSISTENCIA SOCIAL",
    15: "SECRETARIA DE FAZENDA",
    16: "EDITAIS",
    17: "FOLHA DE PAGAMENTO",
    18: "SECRETARIA DE INDUSTRIA, COMERCIO E RECURSOS MINERAIS",
    19: "FAP",
    20: "SECRETARIA DE MEIO AMBIENTE",
    24: "CONVENIOS/CONTRATOS",
    25: "SECRETARIA DE SAUDE",
    26: "SECRETARIA DE TRANSPORTES",
    27: "SECRETARIA DE OBRAS",
    28: "CHEFIA DE GABINETE",
    29: "SECRETARIA DE SEGURANCA PUBLICA",
    30: "SECRETARIA DE AGRICULTURA",
    31: "SECRETARIA DE TURISMO",
    32: "SECRETARIA DE ESPORTES",
    33: "PROCURADORIA",
    34: "SECRETARIA DE CULTURA",
    35: "SECRETARIA DE ILUMINACAO PUBLICA",
    36: "AGUA E ESGOTO",
    37: "SECRETARIA DEFESA CIVIL",
    39: "LEIS ORCAMENTARIAS",
    40: "PLANEJAMENTO DE CONTRATACOES",
    41: "NOTA FISCAL NACIONAL",
    43: "EMENDAS PARLAMENTARES",
}


# ---------------------------------------------------------------------------
# HTTP helper
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
        # 404 é normal (seção sem aquele ano) -> ok=True, conteúdo vazio.
        if r.status_code == 404:
            return "", True
        print(f"  [aviso] {url} respondeu HTTP {r.status_code}")
        return "", False
    except requests.RequestException as e:
        print(f"  [erro] falha ao acessar {url}: {e}")
        return "", False


# ---------------------------------------------------------------------------
# Descoberta de seções e extração de documentos
# ---------------------------------------------------------------------------

def discover_sections(session):
    """Lê o menu da transparência e descobre IDs de seção automaticamente.
    Faz UNIÃO com a lista fixa SECTIONS. Se a descoberta falhar, usamos só
    a lista fixa (o monitor continua funcionando)."""
    sections = dict(SECTIONS)
    text, ok = fetch(session, INDEX_URL)
    if not ok or not text:
        print("  [aviso] nao consegui auto-descobrir secoes; usando lista fixa.")
        return sections

    soup = BeautifulSoup(text, "html.parser")
    for a in soup.find_all("a", href=True):
        m = re.search(r"/portal/arquivo/(\d+)", a["href"])
        if not m:
            continue
        sid = int(m.group(1))
        name = " ".join(a.get_text(strip=True).split()) or f"SECAO {sid}"
        # Só sobrescreve o nome se ainda não tínhamos ou se o descoberto é melhor.
        if sid not in sections or (name and not name.startswith("SECAO")):
            sections[sid] = name
    return sections


def extract_documents(text, page_url):
    """Extrai todos os documentos (links de arquivo) de uma página de seção.
    Retorna lista de dicts {url, title}. Robusto: pega qualquer <a> cujo href
    aponte para um arquivo (pdf/doc/xls/etc.) dentro de /portal/arquivo/."""
    docs = []
    if not text:
        return docs
    soup = BeautifulSoup(text, "html.parser")
    file_ext = re.compile(r"\.(pdf|docx?|xlsx?|odt|ods|csv|zip|rar|txt|png|jpe?g)$", re.I)
    seen_local = set()
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href:
            continue
        abs_url = urljoin(page_url, href)
        # Só nos interessam arquivos de documento hospedados no portal.
        if "/portal/arquivo/" not in abs_url:
            continue
        if not file_ext.search(abs_url.split("?")[0]):
            continue
        if abs_url in seen_local:
            continue
        seen_local.add(abs_url)
        title = " ".join(a.get_text(strip=True).split())
        if not title:
            title = abs_url.rsplit("/", 1)[-1]
        docs.append({"url": abs_url, "title": title})
    return docs


def scan(session, sections):
    """Varre todas as seções e anos. Retorna:
       found: dict url -> {title, section, section_id, year}
       stats: métricas do run para detectar falhas."""
    found = {}
    stats = {"sections_ok": 0, "sections_fail": 0, "pages": 0}
    for sid, name in sorted(sections.items()):
        section_had_success = False
        for year in YEARS:
            url = SECTION_URL.format(sid=sid, year=year)
            text, ok = fetch(session, url)
            stats["pages"] += 1
            if ok:
                section_had_success = True
                for doc in extract_documents(text, url):
                    if doc["url"] not in found:
                        found[doc["url"]] = {
                            "title": doc["title"],
                            "section": name,
                            "section_id": sid,
                            "year": year,
                        }
            time.sleep(REQUEST_DELAY)
        if section_had_success:
            stats["sections_ok"] += 1
        else:
            stats["sections_fail"] += 1
            print(f"  [aviso] secao {sid} ({name}) falhou em todos os anos.")
    return found, stats


# ---------------------------------------------------------------------------
# Estado (persistência)
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
    state["last_run_utc"] = NOW.replace(microsecond=0).isoformat() + "Z"
    with open(STATE_FILE, "w", encoding="utf-8") as f:
        json.dump(state, f, ensure_ascii=False, indent=2, sort_keys=True)


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
    # CallMeBot tem limite de tamanho; cortamos com folga.
    text = body_text
    if len(text) > 900:
        text = text[:880] + "\n... (lista completa no e-mail)"
    url = (
        "https://api.callmebot.com/whatsapp.php"
        f"?phone={quote_plus(phone)}&text={quote_plus(text)}&apikey={quote_plus(apikey)}"
    )
    try:
        r = requests.get(url, timeout=30)
        if r.status_code == 200:
            print("  [ok] WhatsApp enviado.")
        else:
            print(f"  [aviso] CallMeBot respondeu HTTP {r.status_code}: {r.text[:200]}")
    except requests.RequestException as e:
        print(f"  [erro] falha ao enviar WhatsApp: {e}")


def notify(subject, body_text):
    send_email(subject, body_text)
    send_whatsapp(body_text)


# ---------------------------------------------------------------------------
# Formatação das mensagens
# ---------------------------------------------------------------------------

def format_new_docs(new_docs):
    """new_docs: lista de (url, meta). Monta corpo legível agrupado por seção."""
    by_section = {}
    for url, meta in new_docs:
        by_section.setdefault(meta["section"], []).append((meta["title"], url, meta["year"]))
    lines = [f"{len(new_docs)} documento(s) novo(s) no Portal da Transparencia de Santo Antonio de Padua:\n"]
    for section in sorted(by_section):
        lines.append(f"== {section} ==")
        for title, url, year in by_section[section]:
            lines.append(f"- [{year}] {title}")
            lines.append(f"  {url}")
        lines.append("")
    return "\n".join(lines).strip()


# ---------------------------------------------------------------------------
# Detecção de falha / mudança de estrutura
# ---------------------------------------------------------------------------

def health_check(found, stats, state):
    """Retorna (ok, mensagem_alerta_ou_None).
    Dispara alerta se: (a) todas as seções falharam, ou (b) já tínhamos
    documentos no estado mas agora não achamos NENHUM (provável mudança de
    estrutura ou site fora do ar)."""
    prev_count = len(state.get("documents", {}))
    if stats["sections_ok"] == 0:
        return False, (
            "ALERTA: o monitor nao conseguiu acessar NENHUMA secao do portal. "
            "O site pode estar fora do ar. Nenhuma verificacao de documentos foi feita."
        )
    if prev_count > 0 and len(found) == 0:
        return False, (
            "ALERTA: o monitor acessou o site mas nao encontrou NENHUM documento, "
            f"sendo que na ultima vez havia {prev_count}. Isso normalmente indica "
            "que o layout/estrutura do portal mudou e o script precisa de ajuste."
        )
    return True, None


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print(f"== Monitor Transparencia Padua == {NOW.isoformat()}Z")
    session = make_session()

    sections = discover_sections(session)
    print(f"Secoes a monitorar: {len(sections)} | anos: {YEARS}")

    found, stats = scan(session, sections)
    print(f"Paginas verificadas: {stats['pages']} | "
          f"secoes ok: {stats['sections_ok']} | falhas: {stats['sections_fail']} | "
          f"documentos encontrados: {len(found)}")

    state = load_state()

    # 1) Checagem de saúde antes de comparar (evita falso alarme quando o site cai).
    ok, alert = health_check(found, stats, state)
    if not ok:
        print(alert)
        notify("[Transparencia Padua] Monitor: possivel problema", alert)
        # Não sobrescreve o estado para não "esquecer" os documentos conhecidos.
        return 1

    # 2) Primeiro run: registra baseline sem alertar tudo.
    if not state.get("initialized"):
        state["documents"] = found
        state["initialized"] = True
        save_state(state)
        msg = (
            f"Monitor iniciado. Baseline registrada com {len(found)} documentos "
            f"em {stats['sections_ok']} secoes. A partir de agora voce sera avisado "
            "apenas quando surgir documento NOVO."
        )
        print(msg)
        notify("[Transparencia Padua] Monitor ativado", msg)
        return 0

    # 3) Diff: o que é novo em relação ao estado salvo.
    known = state.get("documents", {})
    new_docs = [(url, meta) for url, meta in found.items() if url not in known]

    # Atualiza o estado com tudo o que foi encontrado (adiciona os novos).
    merged = dict(known)
    merged.update(found)
    state["documents"] = merged
    save_state(state)

    if not new_docs:
        print("Nenhum documento novo.")
        return 0

    # Ordena por seção e título para uma mensagem estável.
    new_docs.sort(key=lambda x: (x[1]["section"], x[1]["title"]))
    body = format_new_docs(new_docs)
    subject = f"[Transparencia Padua] {len(new_docs)} documento(s) novo(s)"
    print(body)
    notify(subject, body)
    return 0


if __name__ == "__main__":
    sys.exit(main())
