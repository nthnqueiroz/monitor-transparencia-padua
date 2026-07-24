"""
Etapa B (OPCIONAL — NÃO rodar agora) — OCR dos documentos que a Etapa A
marcou "precisa_ocr" (PDF escaneado, sem texto nativo).

A Etapa A entrega valor sem nenhuma instalação extra. Isto aqui é só o
gancho pronto pra quando fizer sentido ligar o OCR.

Pré-requisitos (nada disso vem instalado por padrão):
  1. Tesseract OCR no sistema, com o pacote de idioma português:
       Windows:  instalador em https://github.com/UB-Mannheim/tesseract/wiki
                 (garanta que "por.traineddata" está na pasta tessdata e que
                 o executável está no PATH)
       Linux:    sudo apt install tesseract-ocr tesseract-ocr-por
  2. Poppler — o pdf2image usa o utilitário pdftoppm por baixo dos panos:
       Windows:  https://github.com/oschwartz10612/poppler-windows (adicione
                 a pasta bin/ ao PATH)
       Linux:    sudo apt install poppler-utils
  3. Bibliotecas Python:
       pip install pytesseract pdf2image

Depois de instalado, rodar (da raiz do repo):
    python textos/ocr_conteudo.py

Idempotente como a Etapa A: só processa quem ainda está "precisa_ocr" no
estado.json compartilhado. Ao terminar, rode extrair_conteudo.py de novo
(sem apagar nada) — ele pula quem já tem resultado bom e republica o índice
com os textos novos do OCR incluídos.
"""

import json
import sys
from pathlib import Path

try:
    import pytesseract
    from pdf2image import convert_from_path
except ImportError:
    print("Etapa B precisa de pytesseract e pdf2image (ver o docstring deste arquivo).")
    print("Instale com: pip install pytesseract pdf2image")
    print("E garanta que Tesseract + Poppler estão instalados e no PATH do sistema.")
    sys.exit(1)

sys.path.insert(0, str(Path(__file__).resolve().parent))
from extrair_conteudo import (  # noqa: E402 — precisa do sys.path acima
    ESTADO_JSON,
    LIMITE_CHARS_POR_DOC,
    PASTA_PDFS,
    agora_iso,
    salvar_estado,
    slug_arquivo,
)

IDIOMA_OCR = "por"
DPI_RENDERIZACAO = 200  # equilíbrio entre qualidade de OCR e tempo/memória


def ocr_de_um_pdf(caminho_pdf):
    paginas = convert_from_path(str(caminho_pdf), dpi=DPI_RENDERIZACAO)
    partes = [pytesseract.image_to_string(p, lang=IDIOMA_OCR) for p in paginas]
    return "\n".join(partes).strip(), len(paginas)


def main():
    if not ESTADO_JSON.exists():
        print("Não achei estado.json — rode extrair_conteudo.py (Etapa A) primeiro.")
        sys.exit(1)

    estado = json.loads(ESTADO_JSON.read_text(encoding="utf-8"))
    pendentes = [url for url, r in estado.items() if r.get("metodo") == "precisa_ocr"]
    print(f"{len(pendentes)} documentos aguardando OCR.")

    for i, url in enumerate(pendentes, 1):
        anterior = estado[url]
        caminho_pdf = PASTA_PDFS / slug_arquivo(url)
        if not caminho_pdf.exists():
            print(f"  [{i}/{len(pendentes)}] PDF fora do cache — rode a Etapa A de novo antes: {url}")
            continue
        try:
            texto, paginas = ocr_de_um_pdf(caminho_pdf)
        except Exception as e:  # noqa: BLE001 — não pode derrubar o lote inteiro
            print(f"  [{i}/{len(pendentes)}] erro de OCR: {e}")
            continue

        texto = texto.strip()[:LIMITE_CHARS_POR_DOC]
        estado[url] = {
            **anterior,
            "metodo": "ocr",
            "chars": len(texto),
            "paginas": paginas,
            "texto": texto,
            "erro": None,
            "processado_em": agora_iso(),
        }
        print(f"  [{i}/{len(pendentes)}] OK — {len(texto)} caracteres")

    salvar_estado(estado)
    print("\nEstado atualizado. Rode extrair_conteudo.py de novo pra publicar em conteudo.json.")


if __name__ == "__main__":
    main()
