import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import PanelPlantillas from "@/components/PanelPlantillas";

export const dynamic = "force-dynamic";

export default async function PlantillasPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Plantillas</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">
          Mensajes aprobados por WhatsApp para escribirle a un cliente fuera de la ventana de 24 horas.
        </p>
      </div>
      <PanelPlantillas />
    </main>
  );
}
