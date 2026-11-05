import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Cliente ADMIN de Supabase Auth (service_role) — SOLO server-side, SOLO para
// invitar usuarios nuevos (supabase.auth.admin.inviteUserByEmail) desde el alta
// de cliente. Nunca importar este archivo desde código que corra en el navegador.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
