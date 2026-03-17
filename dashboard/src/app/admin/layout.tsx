import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/server";
import { AdminLayout } from "@/components/layout/admin-layout";

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // Extract session cookie for basic admin route protection
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    redirect("/login");
  }

  try {
    // Basic verification - just ensure they are logged in
    // Real role checks are done inside pages or deeper layouts (like admin/system)
    await adminAuth.verifySessionCookie(sessionCookie, true);
  } catch (error) {
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
