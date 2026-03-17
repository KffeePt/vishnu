import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adminAuth } from "@/lib/firebase/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get("__session")?.value;

    if (!sessionCookie) {
      return NextResponse.json({ error: "Unauthorized: No session cookie" }, { status: 401 });
    }

    const decodedClaims = await adminAuth.verifySessionCookie(sessionCookie, true);

    if (decodedClaims.role !== "admin" && decodedClaims.role !== "owner") {
      return NextResponse.json({ error: "Forbidden: Not an admin or owner" }, { status: 403 });
    }

    // Return system diagnostics securely
    const diagnostics = {
      dashboardVersion: "0.1.0",
      nodeVersion: process.version,
      firebaseProjectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "Not Set",
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "Not Set",
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(diagnostics);
  } catch (error: any) {
    console.error("Error in /api/admin/system:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
