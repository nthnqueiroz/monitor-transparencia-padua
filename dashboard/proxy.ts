import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";

/**
 * Gancho de autenticação (Next.js 16 renomeou middleware.ts para proxy.ts —
 * ver dashboard/AGENTS.md). Primeira camada de proteção antes do deploy
 * público; a 2ª camada é o Vercel Password Protection nativo.
 */

const ROTA_LOGIN = "/login";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const autenticado = sessaoValida(request.cookies.get(COOKIE_SESSAO)?.value);

  if (pathname === ROTA_LOGIN) {
    return autenticado
      ? NextResponse.redirect(new URL("/", request.url))
      : NextResponse.next();
  }

  if (!autenticado) {
    return NextResponse.redirect(new URL(ROTA_LOGIN, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
