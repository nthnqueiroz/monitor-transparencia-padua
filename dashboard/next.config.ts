import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Sem isto o Turbopack sobe a árvore procurando lockfile e pode eleger uma
  // pasta acima do repositório como raiz do workspace.
  turbopack: {
    root: path.resolve(import.meta.dirname),
  },
};

export default nextConfig;
