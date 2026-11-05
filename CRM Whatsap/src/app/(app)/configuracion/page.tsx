import { redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getVendedoresLista, getConsumoPlan } from "@/lib/metrics";
import { puedeVer, topeVendedores } from "@/lib/plan";
import GestionVendedores from "@/components/GestionVendedores";
import DatosEmpresa from "@/components/DatosEmpresa";
import ConectarWhatsapp from "@/components/ConectarWhatsapp";
import { getCuentaWhatsapp } from "@/lib/conexionWhatsapp";

export const dynamic = "force-dynamic";

export default async function ConfiguracionPage() {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  const mostrarVendedores = puedeVer(tenant, "vendedores_config");

  const [vendedores, consumo, cuentaWhatsapp] = await Promise.all([
    mostrarVendedores ? getVendedoresLista(tenant.empresa) : Promise.resolve([]),
    getConsumoPlan(tenant.empresa),
    // Si la tabla aún no existe o la BD falla, la sección se muestra sin conexión.
    getCuentaWhatsapp(tenant.empresa).catch(() => null),
  ]);

  return (
    <main className="px-5 py-5 max-w-[1400px] aparecer">
      <div className="mb-4">
        <h1 className="titulo-pagina">Configuración</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">Ajustes de {tenant.nombreEmpresa}.</p>
      </div>
      <div className="flex flex-col gap-4">
        <DatosEmpresa nombreInicial={tenant.nombreEmpresa} consumo={consumo} />
        <ConectarWhatsapp cuenta={cuentaWhatsapp} />
        {mostrarVendedores && (
          <GestionVendedores
            vendedores={vendedores}
            tope={tenant.isAdmin ? Infinity : topeVendedores(tenant.plan)}
            plan={tenant.plan}
          />
        )}
      </div>
    </main>
  );
}
