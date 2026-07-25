import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE_SESSAO, sessaoValida } from "@/lib/sessao";
import { entrar } from "./actions";

export const metadata = {
  title: "Entrar — Painel Pádua Lab",
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ erro?: string }>;
}) {
  const { erro } = await searchParams;
  const cookieStore = await cookies();
  if (sessaoValida(cookieStore.get(COOKIE_SESSAO)?.value)) {
    redirect("/");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-plano px-4">
      <div className="w-full max-w-sm rounded border border-linha bg-ficha p-6">
        <h1 className="font-display text-[13px] font-bold tracking-[0.05em] text-tinta uppercase">
          Painel Interno — Pádua Lab
        </h1>
        <p className="mt-1 text-[12.5px] text-tinta-3">
          Uso interno. Peça a senha a quem já tem acesso.
        </p>

        <form action={entrar} className="mt-5 space-y-3">
          <div>
            <label
              htmlFor="senha"
              className="block font-mono text-[11px] tracking-[0.06em] text-tinta-3 uppercase"
            >
              Senha
            </label>
            <input
              id="senha"
              name="senha"
              type="password"
              required
              autoFocus
              className="mt-1 w-full rounded border border-linha-forte bg-ficha-alt px-2.5 py-1.5 text-[13px] text-tinta"
            />
          </div>

          {erro ? (
            <p className="text-[12px] text-selo">Senha incorreta. Tente de novo.</p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded border border-registro bg-registro px-3 py-1.5 text-[13px] font-medium text-white transition-colors hover:bg-registro-escuro"
          >
            Entrar
          </button>
        </form>
      </div>
    </div>
  );
}
