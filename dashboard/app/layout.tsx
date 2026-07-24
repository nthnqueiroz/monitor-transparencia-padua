import type { Metadata } from "next";
import { Inter, JetBrains_Mono, Oswald } from "next/font/google";
import "./globals.css";

// Inter carrega corpo e tabela — é o que se lê em volume, então precisa
// desaparecer atrás do conteúdo.
const sans = Inter({
  variable: "--fonte-sans",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// JetBrains Mono carrega todo o dado tabular (número de ato, ano, valor,
// status): faz a listagem ler como registro em vez de feed.
const mono = JetBrains_Mono({
  variable: "--fonte-mono",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600"],
  display: "swap",
});

// Oswald é o display do Lab: só o corte 700, sempre em caixa alta, reservado
// para títulos e labels de seção — nunca para corpo de texto.
const display = Oswald({
  variable: "--fonte-display",
  subsets: ["latin", "latin-ext"],
  weight: ["700"],
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
      className={`${sans.variable} ${mono.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">{children}</body>
    </html>
  );
}
