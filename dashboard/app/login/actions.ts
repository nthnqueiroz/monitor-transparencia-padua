"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, SESSAO_DIAS, criarValorSessao, senhaConfere } from "@/lib/sessao";

export async function entrar(formData: FormData) {
  const senha = String(formData.get("senha") ?? "");

  if (!senhaConfere(senha)) {
    redirect("/login?erro=1");
  }

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_SESSAO, criarValorSessao(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSAO_DIAS * 24 * 60 * 60,
  });

  redirect("/");
}
