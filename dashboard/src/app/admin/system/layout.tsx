import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { adminAuth } from "@/lib/firebase/server";

export default async function AdminSystemLayout({ children }: { children: React.ReactNode }) {
  // Extract session cookie
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get("__session")?.value;

  if (!sessionCookie) {
    // No session -> Login
    redirect("/login");
  }

  try {
    // Verify the session cookie via Firebase Admin
    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);

    // Check custom claims
    if (decodedClaims.role !== "admin" && decodedClaims.role !== "owner") {
      // Valid session but not an admin or owner -> Portal or root
      redirect("/admin");
    }
  } catch (error) {
    // Invalid or expired session cookie -> Login
    redirect("/login");
  }

  return <>{children}</>;
}
