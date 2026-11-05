"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { BASE_PATH } from "@/lib/api";

// Página pública (ver middleware.ts) donde aterriza el link de recovery que envía
// el correo de bienvenida (Resend) tras el alta de una empresa nueva.
//
// El link llega como #access_token=...&refresh_token=...&type=recovery. A
// diferencia del cliente clásico de supabase-js, createBrowserClient de
// @supabase/ssr guarda la sesión en cookies y NO trae detectSessionInUrl: el
// hash hay que leerlo a mano y pasarlo a setSession() para que la sesión quede
// en la cookie que también ve el middleware.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [listo, setListo] = useState(false);
  const [verificando, setVerificando] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function activarSesionDelLink() {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      const accessToken = hash.get("access_token");
      const refreshToken = hash.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          // Sacar los tokens de la barra de direcciones una vez consumidos.
          window.history.replaceState(null, "", window.location.pathname);
          setListo(true);
          setVerificando(false);
          return;
        }
      }

      // Sin tokens utilizables en el hash: puede que ya exista sesión activa
      // (ej. el usuario recargó la página después de consumir el link).
      const { data } = await supabase.auth.getSession();
      setListo(!!data.session);
      setVerificando(false);
    }

    activarSesionDelLink();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setGuardando(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setGuardando(false);
    if (error) {
      setError(`No se pudo guardar la contraseña: ${error.message}`);
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

        <h1 className="titulo-pagina mb-1">Define tu contraseña</h1>
        <p className="text-[12px] text-tinta-3 mb-6">Último paso para entrar a tu panel.</p>

        {verificando && (
          <div className="flex flex-col gap-3">
            <div className="esqueleto h-[34px]" />
            <div className="esqueleto h-[34px]" />
            <div className="esqueleto h-[32px]" />
          </div>
        )}

        {!verificando && !listo && (
          <p
            className="text-[12px] px-2.5 py-2 rounded-[6px]"
            style={{ background: "var(--rojo-bg)", color: "var(--rojo)" }}
          >
            Este enlace no es válido o ya expiró. Pide al administrador que te envíe uno nuevo.
          </p>
        )}

        {!verificando && listo && (
          <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Nueva contraseña</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="campo"
                placeholder="Mínimo 8 caracteres"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="eyebrow">Repite la contraseña</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                className="campo"
                placeholder="Repite la contraseña"
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

            <button type="submit" disabled={guardando} className="btn-primario mt-1 w-full">
              {guardando ? "Guardando…" : "Guardar y entrar"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
