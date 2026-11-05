import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getTenant } from "@/lib/tenant";
import { getFicha, getEstado } from "@/lib/agenteConfig";
import EditorAgente from "@/components/EditorAgente";
import SelectorEmpresa from "@/components/SelectorEmpresa";
import { listarClientes } from "@/lib/admin";

export const dynamic = "force-dynamic";

export default async function FichaAgentePage({ params }: { params: { empresa: string } }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");
  if (!tenant.isAdmin) redirect("/dashboard");

  const empresa = Number(params.empresa);
  if (!Number.isInteger(empresa) || empresa <= 0) notFound();
  const ficha = await getFicha(empresa);
  if (!ficha) notFound();
  const estado = await getEstado(empresa);
  // Selector: la empresa del admin (Sofía) + todos los clientes
  const clientes = await listarClientes();
  const empresas = [
    { empresa: tenant.empresa, nombre: `${tenant.nombreEmpresa} (mi agente)` },
    ...clientes.filter((c) => c.empresa !== tenant.empresa).map((c) => ({ empresa: c.empresa, nombre: c.nombreEmpresa })),
  ];

  return (
    <main className="px-5 py-5 max-w-[1100px] aparecer">
      <div className="mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <Link href="/admin" className="text-[12px] text-tinta-3 hover:text-tinta transicion">← Empresas</Link>
          <SelectorEmpresa actual={empresa} empresas={empresas} />
        </div>
        <h1 className="titulo-pagina mt-1">Ficha del agente · {ficha.nombreEmpresa}</h1>
        <p className="text-tinta-2 text-[12px] mt-0.5">
          Lo que el agente sabe del negocio y cómo atiende. Los cambios se aplican desde el próximo mensaje.
        </p>
      </div>
      <EditorAgente
        empresa={empresa}
        nombreEmpresa={ficha.nombreEmpresa}
        nombreAsistenteInicial={ficha.nombreAsistente}
        configInicial={ficha.config}
        estadoInicial={estado}
      />
    </main>
  );
}
