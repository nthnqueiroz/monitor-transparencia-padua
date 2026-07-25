import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Sessão de login simples (senha única compartilhada, sem banco de dados).
 * Primeira camada de proteção antes do deploy público — usada junto com o
 * Vercel Password Protection nativo (2ª camada). A assinatura HMAC usa a
 * própria PAINEL_SENHA como chave: não precisa de um segredo separado, e o
 * cookie nunca carrega a senha em si, só um prazo de validade assinado.
 */

export const COOKIE_SESSAO = "pl_sessao";
export const SESSAO_DIAS = 30;

function hmac(mensagem: string): Buffer {
  const chave = process.env.PAINEL_SENHA ?? "";
  return createHmac("sha256", chave).update(mensagem).digest();
}

/** Compara senha digitada com PAINEL_SENHA em tempo constante. */
export function senhaConfere(digitada: string): boolean {
  const esperada = process.env.PAINEL_SENHA;
  if (!esperada) return false; // sem env configurada, nega por padrão
  return timingSafeEqual(hmac(digitada), hmac(esperada));
}

/** Gera o valor do cookie de sessão: prazo de validade + assinatura. */
export function criarValorSessao(): string {
  const expiraEm = Date.now() + SESSAO_DIAS * 24 * 60 * 60 * 1000;
  return `${expiraEm}.${hmac(String(expiraEm)).toString("hex")}`;
}

/** Verifica se o valor do cookie é uma sessão válida e ainda não expirada. */
export function sessaoValida(valor: string | undefined | null): boolean {
  if (!valor || !process.env.PAINEL_SENHA) return false;

  const [expiraEmTexto, assinatura] = valor.split(".");
  if (!expiraEmTexto || !assinatura) return false;

  const expiraEm = Number(expiraEmTexto);
  if (!Number.isFinite(expiraEm) || expiraEm < Date.now()) return false;

  const a = Buffer.from(assinatura, "hex");
  const b = hmac(expiraEmTexto);
  return a.length === b.length && timingSafeEqual(a, b);
}
