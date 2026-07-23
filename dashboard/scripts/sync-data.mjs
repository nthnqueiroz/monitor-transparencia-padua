/**
 * Copia o inventory.csv da raiz do repositório para dashboard/public/.
 *
 * O monitor (monitor.py) regrava o inventário na raiz a cada execução; o
 * painel só lê a cópia em public/. Rode `npm run sync-data` depois de um
 * `git pull` para atualizar os dados do painel.
 */
import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const aqui = dirname(fileURLToPath(import.meta.url));
const dashboard = resolve(aqui, "..");
const origem = resolve(dashboard, "..", "inventory.csv");
const destino = join(dashboard, "public", "inventory.csv");

if (!existsSync(origem)) {
  console.error(`\n  ✗ inventory.csv não encontrado em ${origem}`);
  console.error("    O painel precisa do inventário gerado pelo monitor.py.\n");
  process.exit(1);
}

mkdirSync(dirname(destino), { recursive: true });
copyFileSync(origem, destino);

const { size, mtime } = statSync(destino);
const mb = (size / 1024 / 1024).toFixed(1);
console.log(
  `  ✓ inventory.csv copiado para public/ (${mb} MB, gerado em ${mtime.toLocaleString("pt-BR")})`,
);
