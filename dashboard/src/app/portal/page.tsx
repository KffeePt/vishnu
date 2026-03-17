"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Package, CreditCard, HeartPulse, Activity } from "lucide-react";

export default function PortalOverviewPage() {
  const { user } = useAuth();

  return (
    <div className="flex-1 space-y-4 p-8 pt-6">
      <div className="flex items-center justify-between space-y-2">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Dashboard</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 text-zinc-50 shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Active Package</h3>
            <Package className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">Base Package</div>
            <p className="text-xs text-zinc-400">Manage in Packages tab</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 text-zinc-50 shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Balance Due</h3>
            <CreditCard className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">$0.00</div>
            <p className="text-xs text-zinc-400">Next billing cycle: N/A</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 text-zinc-50 shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Project Health</h3>
            <HeartPulse className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">Excellent</div>
            <p className="text-xs text-zinc-400">All systems operational</p>
          </div>
        </div>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 text-zinc-50 shadow">
          <div className="p-6 flex flex-row items-center justify-between space-y-0 pb-2">
            <h3 className="tracking-tight text-sm font-medium">Activity</h3>
            <Activity className="h-4 w-4 text-zinc-400" />
          </div>
          <div className="p-6 pt-0">
            <div className="text-2xl font-bold">+24%</div>
            <p className="text-xs text-zinc-400">Traffic vs last month</p>
          </div>
        </div>
      </div>
    </div>
  );
}
