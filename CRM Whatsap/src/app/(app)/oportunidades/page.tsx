import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getOportunidades } from "@/lib/metrics";
import { getEtapas } from "@/lib/etapas";
import { puedeVer } from "@/lib/plan";
import TableroOportunidades from "@/components/TableroOportunidades";

export const dynamic = "force-dynamic";

export default async function OportunidadesPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!puedeVer(tenant, "oportunidades")) redirect("/dashboard");

  const [leads, etapas] = await Promise.all([getOportunidades(tenant.empresa), getEtapas(tenant.empresa)]);

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Oportunidades</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">Tus leads organizados por etapa del embudo.</p>
      </div>
      <TableroOportunidades leads={leads} etapas={etapas} />
    </main>
  );
}
