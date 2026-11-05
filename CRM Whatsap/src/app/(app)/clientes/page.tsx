import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getLeads } from "@/lib/metrics";
import { puedeVer } from "@/lib/plan";
import TablaClientes from "@/components/TablaClientes";

export const dynamic = "force-dynamic";

export default async function ClientesPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!puedeVer(tenant, "leads")) redirect("/dashboard");

  const leads = await getLeads(tenant.empresa);

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Leads</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">Todos los leads captados por tu agente de WhatsApp.</p>
      </div>
      <TablaClientes leads={leads} />
    </main>
  );
}
