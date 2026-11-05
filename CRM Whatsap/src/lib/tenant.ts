import { createClient } from "@/lib/supabase/server";

export type Tenant = {
  userId: string;
  email: string;
  empresa: number;
  nombreEmpresa: string;
  isAdmin: boolean;
  plan: string | null;
};

/**
 * Resuelve la empresa del usuario autenticado.
 * Lee la sesión de Supabase y consulta la tabla de mapeo `dashboard_usuarios`
 * (auth_user_id -> empresa, nombre_empresa). Devuelve null si no hay sesión o mapeo.
 */
export async function getTenant(): Promise<Tenant | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("dashboard_usuarios")
    .select("empresa, nombre_empresa, is_admin, activo, plan")
    .eq("auth_user_id", user.id)
    .single();

  if (error || !data) return null;
  if (data.activo === false) return null; // cliente suspendido -> tratar como sin sesión

  return {
    userId: user.id,
    email: user.email ?? "",
    empresa: data.empresa,
    nombreEmpresa: data.nombre_empresa ?? "tu negocio",
    isAdmin: data.is_admin === true,
    plan: data.plan,
  };
}
