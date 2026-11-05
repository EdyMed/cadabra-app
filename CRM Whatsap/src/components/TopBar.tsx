"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TopBar({ nombreEmpresa }: { nombreEmpresa: string }) {
  const router = useRouter();

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const inicial = nombreEmpresa.trim().charAt(0).toUpperCase() || "?";

  return (
    <div
      className="flex items-center justify-end gap-2.5 px-4 md:px-5 h-[42px] flex-shrink-0 border-b"
      style={{ borderColor: "var(--linea)", background: "var(--sidebar-bg)" }}
    >
      <span
        className="grid place-items-center rounded-[5px] text-[10px] font-semibold flex-shrink-0"
        style={{ width: 20, height: 20, background: "var(--verde-claro)", color: "var(--verde)" }}
        aria-hidden
      >
        {inicial}
      </span>
      <span className="text-[12px] text-tinta-2 font-medium truncate max-w-[220px]">{nombreEmpresa}</span>
      <button
        onClick={logout}
        className="text-[11.5px] text-tinta-3 hover:text-tinta transicion px-1.5 py-1 rounded"
      >
        Salir
      </button>
    </div>
  );
}
