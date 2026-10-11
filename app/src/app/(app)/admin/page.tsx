import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { getAdminDashboardData } from "@/lib/admin";

export const metadata = { title: "Admin dashboard" };

export default async function AdminPage() {
  return <AdminDashboard data={await getAdminDashboardData()} />;
}
