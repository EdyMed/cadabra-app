import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { getTenant } from "@/lib/tenant";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const tenant = await getTenant();
  if (!tenant) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={tenant.isAdmin} plan={tenant.plan} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar nombreEmpresa={tenant.nombreEmpresa} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
