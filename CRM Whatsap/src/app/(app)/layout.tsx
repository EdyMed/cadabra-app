import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { getTenant } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  return (
    <div className="flex min-h-screen">
      {/* display:contents mantiene el layout; .no-print los oculta al imprimir el informe */}
      <div className="no-print contents">
        <Sidebar isAdmin={tenant.isAdmin} plan={tenant.plan} />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="no-print contents">
          <TopBar nombreEmpresa={tenant.nombreEmpresa} />
        </div>
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
