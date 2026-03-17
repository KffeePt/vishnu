"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { PortalSidebar } from "@/components/layout/portal-sidebar";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push("/login");
    }
    // Optional: if logged in as staff and they hit '/', route them to '/admin' or let them stay?
    // Based on requirements, staff can read/write client data and might want to see the portal.
  }, [user, loading, router]);

  if (loading) return null;

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-50 relative overflow-hidden">
        <PortalSidebar />
        <main className="flex-1 overflow-y-auto">
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-zinc-950/80 px-4 backdrop-blur lg:h-[60px] lg:px-6">
            <SidebarTrigger className="-ml-1 text-zinc-50 hover:bg-white/10" />
            <div className="flex-1 font-semibold text-zinc-200">
              Vishnu Business Portal
            </div>
          </header>
          {children}
        </main>
      </div>
    </SidebarProvider>
  );
}
