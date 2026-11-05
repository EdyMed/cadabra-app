import Link from "next/link";
import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { listarClientes } from "@/lib/admin";
import PanelAdminClientes from "@/components/PanelAdminClientes";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.isAdmin) redirect("/dashboard");

  const clientes = await listarClientes();

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="titulo-pagina">Empresas</h1>
          <p className="text-tinta-2 text-[12px] mt-0.5">Administra las empresas que usan Cadabra CRM.</p>
        </div>
        {/* La empresa del admin (Sofía) no aparece en la tabla de clientes */}
        <Link href={`/admin/agente/${tenant.empresa}`} className="btn-secundario whitespace-nowrap">
          Ficha de mi agente
        </Link>
      </div>
      <PanelAdminClientes clientesIniciales={clientes} />
    </main>
  );
}
