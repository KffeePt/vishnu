"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Settings</h2>
        <p className="text-zinc-400 mt-2">Manage your account preferences and notifications.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 flex flex-col shadow text-zinc-300">
          <h3 className="text-lg font-medium text-zinc-50 mb-4 border-b border-white/10 pb-2">Profile</h3>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-zinc-400">Email Address</label>
              <div className="mt-1 p-2 bg-black/20 rounded border border-white/5">{user?.email || "No email available"}</div>
            </div>
            <div>
              <label className="text-sm font-medium text-zinc-400">User ID</label>
              <div className="mt-1 p-2 bg-black/20 rounded border border-white/5 font-mono text-xs truncate">{user?.uid || "N/A"}</div>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-zinc-900/50 p-6 flex flex-col shadow text-zinc-300">
          <h3 className="text-lg font-medium text-zinc-50 mb-4 border-b border-white/10 pb-2">Preferences</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-200">Email Notifications</div>
                <div className="text-xs text-zinc-500">Receive billing and support updates</div>
              </div>
              <Button variant="outline" size="sm">Enabled</Button>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium text-zinc-200">New Login Alerts</div>
                <div className="text-xs text-zinc-500">Security alerts on unknown devices</div>
              </div>
              <Button variant="outline" size="sm">Enabled</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
