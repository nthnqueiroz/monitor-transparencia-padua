/**
 * Copia textos/conteudo.json (índice de texto extraído — ver
 * textos/extrair_conteudo.py) para dashboard/public/.
 *
 * Diferente do sync-data: é OPCIONAL. Ninguém pode ter rodado a Etapa A
 * ainda, e o painel deve subir normalmente mesmo assim — só a busca no
 * conteúdo fica indisponível até o índice existir.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const dashboard = resolve(aqui, "..");
const origem = resolve(dashboard, "..", "textos", "conteudo.json");
const destino = join(dashboard, "public", "conteudo.json");

if (!existsSync(origem)) {
  console.log(
    "  · conteudo.json ainda não existe (rode textos/extrair_conteudo.py pra gerar) — busca no conteúdo fica desativada por enquanto.",
  );
  process.exit(0);
}

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);

const { size, mtime } = statSync(destino);
const mb = (size / 1024 / 1024).toFixed(1);
console.log(
  `  ✓ conteudo.json copiado para public/ (${mb} MB, gerado em ${mtime.toLocaleString("pt-BR")})`,
);
