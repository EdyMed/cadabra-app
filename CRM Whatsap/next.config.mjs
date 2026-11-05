import { readFileSync } from "node:fs";

/** @type {import('next').NextConfig} */
// Fijo, no por variable: EasyPanel no tiene build args y Next resuelve el
// basePath al compilar. `npm run dev` lo respeta igual (localhost:3000/crm).
const basePath = "/crm";

// Las NEXT_PUBLIC_* del navegador se hornean al compilar. Sin build args, se
// leen aquí del archivo y se pasan por `env` — depender de que Next cargue
// solo el .env falló en el build de Docker.
function leerEnv() {
  for (const archivo of [".env.production", ".env.local"]) {
    try {
      return Object.fromEntries(
        readFileSync(archivo, "utf8")
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("#") && l.includes("="))
          .map((l) => {
            const i = l.indexOf("=");
            return [l.slice(0, i), l.slice(i + 1).replace(/^["']|["']$/g, "")];
          })
      );
    } catch {
      // sigue con el siguiente
    }
  }
  return {};
}

const archivo = leerEnv();
const publicas = {
  NEXT_PUBLIC_SUPABASE_URL:
    process.env.NEXT_PUBLIC_SUPABASE_URL || archivo.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY:
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || archivo.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  // Embedded Signup ("Conectar WhatsApp"): ID de la app y de la configuración de
  // Facebook Login for Business. Son públicos; si faltan, el botón se desactiva.
  NEXT_PUBLIC_META_APP_ID:
    process.env.NEXT_PUBLIC_META_APP_ID || archivo.NEXT_PUBLIC_META_APP_ID || "",
  NEXT_PUBLIC_META_ES_CONFIG_ID:
    process.env.NEXT_PUBLIC_META_ES_CONFIG_ID || archivo.NEXT_PUBLIC_META_ES_CONFIG_ID || "",
  // URL pública del panel (con /crm): enlace "definir contraseña" del correo de alta.
  // Sin ella, en producción el enlace caía a http://localhost:3000.
  NEXT_PUBLIC_APP_URL:
    process.env.NEXT_PUBLIC_APP_URL || archivo.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
};

if (!publicas.NEXT_PUBLIC_SUPABASE_URL || !publicas.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "Faltan NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY al compilar. " +
      "Deben estar en .env.production (o .env.local) en la raíz del proyecto."
  );
}

const nextConfig = {
  reactStrictMode: true,
  output: "standalone", // para deploy en Docker/EasyPanel
  basePath,
  env: publicas,
};

export default nextConfig;
