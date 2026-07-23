import type { Metadata } from "next";
import { IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Serif } from "next/font/google";
import "./globals.css";

// IBM Plex: desenhada para sistemas técnicos e institucionais. A mono
// carrega todo o dado tabular (número de ato, ano, valor), o que faz a
// listagem ler como registro em vez de feed.
const sans = IBM_Plex_Sans({
  variable: "--fonte-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const mono = IBM_Plex_Mono({
  variable: "--fonte-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const serif = IBM_Plex_Serif({
  variable: "--fonte-serif",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Painel Interno de Transparência — Pádua Lab",
  description:
    "Exploração do inventário de documentos públicos da Prefeitura de Santo Antônio de Pádua–RJ. Uso interno do Pádua Lab.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="pt-BR"
      className={`${sans.variable} ${mono.variable} ${serif.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
