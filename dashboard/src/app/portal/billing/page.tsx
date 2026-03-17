"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { CreditCard, Receipt, Activity, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function BillingPage() {
  const { user } = useAuth();

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Billing & Subscriptions</h2>
        <p className="text-zinc-400 mt-2">Manage your active plans, payment methods, and billing history.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Subscription */}
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 flex flex-col shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-zinc-50 flex items-center gap-2">
               <Activity className="h-5 w-5 text-emerald-400" />
               Current Plan
            </h3>
            <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">Active</span>
          </div>
          <div className="mb-4">
            <div className="text-3xl font-bold text-white">$49.00 <span className="text-sm font-normal text-zinc-400">/ mo</span></div>
            <p className="text-sm text-zinc-400 mt-1">Base Portal</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-zinc-300 mb-6 bg-white/5 p-3 rounded-md">
            <Clock className="h-4 w-4 text-zinc-400" />
            <span>Next billing date: <strong>April 8, 2026</strong></span>
          </div>
          <div className="mt-auto flex gap-3">
            <Button variant="outline" className="flex-1">Manage Plan</Button>
            <Button variant="destructive" className="flex-1 bg-red-500/10 text-red-400 hover:bg-red-500/20 border-red-500/20">Cancel Sub</Button>
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 flex flex-col shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-zinc-50 flex items-center gap-2">
               <CreditCard className="h-5 w-5 text-indigo-400" />
               Payment Method
            </h3>
          </div>
          
          <div className="border border-white/10 rounded-lg p-4 flex items-center justify-between bg-zinc-950 mb-6">
            <div className="flex items-center gap-4">
              <div className="h-8 w-12 bg-white/10 rounded flex items-center justify-center text-xs font-bold font-mono">VISA</div>
              <div>
                <div className="text-sm font-medium text-zinc-200">Visa ending in 4242</div>
                <div className="text-xs text-zinc-500">Expires 12/28</div>
              </div>
            </div>
            <span className="text-xs text-zinc-400">Default</span>
          </div>

          <div className="mt-auto">
            <Button variant="secondary" className="w-full">Update Payment Method</Button>
          </div>
        </div>
      </div>

      {/* Invoice History */}
      <div>
        <h3 className="text-xl font-medium text-zinc-50 mb-4">Invoice History</h3>
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden shadow">
          <div className="grid grid-cols-4 gap-4 p-4 text-sm font-medium text-zinc-400 border-b border-white/10">
            <div>Date</div>
            <div>Amount</div>
            <div>Status</div>
            <div className="text-right">Invoice</div>
          </div>
          <div className="divide-y divide-white/5">
            {[1].map((i) => (
              <div key={i} className="grid grid-cols-4 gap-4 p-4 text-sm items-center hover:bg-white/5 transition-colors">
                <div className="text-zinc-300">Mar 8, 2026</div>
                <div className="text-zinc-50 font-medium">$49.00</div>
                <div>
                  <span className="px-2 py-1 rounded inline-flex bg-emerald-500/10 text-emerald-400 text-xs border border-emerald-500/20">Paid</span>
                </div>
                <div className="text-right">
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-indigo-400 hover:text-indigo-300">
                    <Receipt className="h-4 w-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
