import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getCitas } from "@/lib/metrics";
import { puedeVer } from "@/lib/plan";
import CalendarioAgenda from "@/components/CalendarioAgenda";

export const dynamic = "force-dynamic";

export default async function AgendaPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!puedeVer(tenant, "agenda")) redirect("/dashboard");

  const citas = await getCitas(tenant.empresa);

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Agenda</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">Citas y visitas coordinadas con tus leads.</p>
      </div>
      <CalendarioAgenda citas={citas} />
    </main>
  );
}
