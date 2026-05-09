import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/admin-layout";
import { resolveDashboardSessionFromCookie } from "@/lib/access-control";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // Extract session cookie for basic admin route protection
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value || cookieStore.get("session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  try {
    const resolved = await resolveDashboardSessionFromCookie(sessionCookie);
    if (!resolved.validation.valid) {
      redirect("/login");
    }
  } catch {
    redirect("/login");
  }

  return (
    <div className="font-roboto">
      <AdminLayout>
        {children}
      </AdminLayout>
    </div>
  );
}
