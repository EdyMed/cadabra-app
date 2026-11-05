"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { puedeVer, type Modulo } from "@/lib/plan";
import { BASE_PATH } from "@/lib/api";

// Iconografía consistente: un solo set, trazo 1.6, 18px, heredando color.
const ICONOS: Record<string, React.ReactNode> = {
  dashboard: <><path d="M3 9.5 10 4l7 5.5" /><path d="M5 9v7h10V9" /></>,
  conversaciones: <path d="M16.5 10.5c0 3-2.9 5.4-6.5 5.4-.8 0-1.6-.1-2.3-.35L4 16.5l1.1-2.9A5.1 5.1 0 0 1 3.5 10.5C3.5 7.5 6.4 5 10 5s6.5 2.5 6.5 5.5Z" />,
  leads: <><circle cx="10" cy="7" r="2.6" /><path d="M4.5 16c0-2.6 2.5-4.2 5.5-4.2s5.5 1.6 5.5 4.2" /></>,
  oportunidades: <><rect x="3.5" y="4.5" width="4" height="11" rx="1" /><rect x="9" y="4.5" width="4" height="7" rx="1" /><rect x="14.5" y="4.5" width="2.5" height="9" rx="1" /></>,
  agenda: <><rect x="3.5" y="5" width="13" height="11" rx="1.6" /><path d="M3.5 8.5h13M7 3.5v3M13 3.5v3" /></>,
  plantillas: <><rect x="4" y="3.5" width="12" height="13" rx="1.6" /><path d="M7 7.5h6M7 10.5h6M7 13.5h3.5" /></>,
  agente: <><rect x="4.5" y="7" width="11" height="8" rx="2.2" /><path d="M10 7V4.5M7.5 11h.01M12.5 11h.01" /></>,
  configuracion: <><circle cx="10" cy="10" r="2.4" /><path d="M10 3.6v1.8M10 14.6v1.8M16.4 10h-1.8M5.4 10H3.6M14.5 5.5l-1.3 1.3M6.8 13.2l-1.3 1.3M14.5 14.5l-1.3-1.3M6.8 6.8 5.5 5.5" /></>,
  empresas: <><path d="M4 16.5V6.2l5-2v12.3" /><path d="M9 16.5V8.4l6.5 1.8v6.3" /><path d="M3 16.5h14" /></>,
};

function Icono({ tipo }: { tipo: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="flex-shrink-0"
    >
      {ICONOS[tipo]}
    </svg>
  );
}

type Item = { href: string; label: string; icono: string; modulo?: Modulo };

// Agrupado por el flujo de trabajo real: primero atender, después gestionar.
const ATENDER: Item[] = [
  { href: "/dashboard", label: "Resumen", icono: "dashboard" },
  { href: "/conversaciones", label: "Conversaciones", icono: "conversaciones" },
  { href: "/plantillas", label: "Plantillas", icono: "plantillas" },
];

const GESTIONAR: Item[] = [
  { href: "/clientes", label: "Leads", icono: "leads", modulo: "leads" },
  { href: "/oportunidades", label: "Oportunidades", icono: "oportunidades", modulo: "oportunidades" },
  { href: "/agenda", label: "Agenda", icono: "agenda", modulo: "agenda" },
];

const SISTEMA: Item[] = [
  { href: "/preguntale", label: "Agente IA", icono: "agente" },
  { href: "/configuracion", label: "Configuración", icono: "configuracion" },
];

export default function Sidebar({
  isAdmin,
  plan,
}: {
  isAdmin?: boolean;
  plan?: string | null;
}) {
  const pathname = usePathname();
  const tenant = { isAdmin: isAdmin ?? false, plan: plan ?? null };
  const visible = (items: Item[]) => items.filter((i) => !i.modulo || puedeVer(tenant, i.modulo));

  const grupos: { titulo: string; items: Item[] }[] = [
    { titulo: "Atender", items: visible(ATENDER) },
    { titulo: "Gestionar", items: visible(GESTIONAR) },
    {
      titulo: "Sistema",
      items: [...visible(SISTEMA), ...(isAdmin ? [{ href: "/admin", label: "Empresas", icono: "empresas" }] : [])],
    },
  ].filter((g) => g.items.length > 0);

  return (
    <aside
      className="w-[196px] flex-shrink-0 flex flex-col gap-6 px-2.5 py-4 min-h-screen border-r"
      style={{ background: "var(--sidebar-bg)", borderColor: "var(--linea)" }}
    >
      <div className="flex items-center px-2.5 pt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE_PATH}/cadabra-logo.png`} alt="Cadabra" className="h-[26px] w-auto" />
      </div>

      <nav className="flex flex-col gap-5">
        {grupos.map((grupo) => (
          <div key={grupo.titulo}>
            <div className="eyebrow px-2.5 mb-1.5" style={{ fontSize: 9.5 }}>
              {grupo.titulo}
            </div>
            <div className="flex flex-col gap-px">
              {grupo.items.map((item) => {
                const activo = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={activo ? "page" : undefined}
                    className="relative flex items-center gap-2.5 pl-2.5 pr-2 py-[7px] rounded-[6px] text-[12.5px] transicion"
                    style={{
                      background: activo ? "var(--card-2)" : undefined,
                      color: activo ? "var(--tinta)" : "var(--tinta-2)",
                      fontWeight: activo ? 600 : 500,
                    }}
                  >
                    {activo && (
                      <span
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[2px] h-[14px] rounded-r"
                        style={{ background: "var(--verde)" }}
                      />
                    )}
                    <span style={{ color: activo ? "var(--verde)" : "var(--tinta-3)" }}>
                      <Icono tipo={item.icono} />
                    </span>
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
