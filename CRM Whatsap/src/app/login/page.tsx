"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BASE_PATH } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.push("/dashboard");
    router.refresh();
  }

  return (
    <main className="min-h-screen grid place-items-center px-4" style={{ background: "var(--crema)" }}>
      <div className="w-full max-w-[320px] aparecer panel p-7">
        <div className="flex items-center mb-6">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`${BASE_PATH}/cadabra-logo.png`} alt="Cadabra" className="h-[30px] w-auto" />
        </div>

        <h1 className="titulo-pagina mb-1">Panel de negocio</h1>
        <p className="text-[12px] text-tinta-3 mb-6">Ingresa para ver los resultados de tu agente.</p>

        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Correo</span>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="campo"
              placeholder="tu@correo.cl"
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="eyebrow">Contraseña</span>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="campo"
              placeholder="••••••••"
            />
          </label>

          {error && (
            <p
              className="text-[12px] px-2.5 py-2 rounded-[6px]"
              style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
            >
              {error}
            </p>
          )}

          <button type="submit" disabled={loading} className="btn-primario mt-1 w-full">
            {loading ? "Ingresando…" : "Ingresar"}
          </button>
        </form>
      </div>
    </main>
  );
}
