import AdminPanel from "@/components/admin-panel/admin-panel";
import { Providers } from "@/context/providers";
import { Toaster } from "@/components/ui/toaster";

export const dynamic = "force-dynamic";

export default function AdminControlCenterPage() {
  return (
    <Providers>
      <div className="min-h-screen bg-background text-foreground">
        <AdminPanel />
        <Toaster />
      </div>
    </Providers>
  );
}
