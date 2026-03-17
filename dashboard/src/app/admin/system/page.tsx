"use client";

import { RoleGuard } from "@/components/providers/role-guard";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Activity, ShieldCheck, Server, Key, TerminalSquare, AlertTriangle } from "lucide-react";
import { useEffect, useState } from "react";

interface SystemDiagnostics {
  dashboardVersion: string;
  nodeVersion: string;
  firebaseProjectId: string;
  authDomain: string;
  environment: string;
  timestamp: string;
}

export default function AdminSystemPage() {
  const [sysInfo, setSysInfo] = useState<SystemDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchSystemInfo() {
      try {
        const res = await fetch("/api/admin/system");
        if (!res.ok) {
          throw new Error("Failed to fetch system diagnostics");
        }
        const data = await res.json();
        setSysInfo(data);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to fetch system diagnostics");
      } finally {
        setLoading(false);
      }
    }
    fetchSystemInfo();
  }, []);

  return (
    <RoleGuard 
      minRole="admin" 
      fallback={
        <div className="flex flex-col items-center justify-center h-[60vh] space-y-4">
          <AlertTriangle className="h-12 w-12 text-zinc-500" />
          <h2 className="text-xl text-zinc-500 font-medium">Restricted Access</h2>
          <p className="text-sm text-zinc-600">You do not have permission to view the system panel.</p>
        </div>
      }
    >
      <div className="space-y-8 max-w-6xl">
        <div>
          <h3 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Server className="h-6 w-6 text-indigo-400" />
            Admin System Panel
          </h3>
          <p className="text-sm text-zinc-400 mt-1">
            High-privilege system controls and live diagnostics for Vishnu instances.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
          {/* Diagnostic Card */}
          <Card className="border-indigo-500/20 bg-zinc-900/50 shadow-lg shadow-indigo-900/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5 text-indigo-400" />
                System Diagnostics
              </CardTitle>
              <CardDescription>Live environment parameters</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 bg-zinc-800 rounded w-full"></div>
                  <div className="h-4 bg-zinc-800 rounded w-5/6"></div>
                  <div className="h-4 bg-zinc-800 rounded w-4/6"></div>
                </div>
              ) : error ? (
                <div className="text-sm text-red-400 bg-red-400/10 p-3 rounded-md border border-red-500/20">
                  {error}
                </div>
              ) : sysInfo ? (
                <div className="space-y-3 text-sm text-zinc-300">
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-zinc-500">Dashboard Version</span>
                    <span className="font-mono text-indigo-300">{sysInfo.dashboardVersion}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-zinc-500">Node Environment</span>
                    <span className="font-mono text-zinc-100">{sysInfo.nodeVersion}</span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-zinc-500">Firebase Project ID</span>
                    <span className="font-mono text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded">
                      {sysInfo.firebaseProjectId}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-1 border-b border-white/5">
                    <span className="text-zinc-500">Auth Domain</span>
                    <span className="font-mono text-zinc-100 text-xs">{sysInfo.authDomain}</span>
                  </div>
                  <div className="flex justify-between items-center py-1">
                    <span className="text-zinc-500">Last Sync</span>
                    <span className="text-zinc-400 text-xs">
                      {new Date(sysInfo.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Role Management */}
          <Card className="bg-zinc-900/50 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-amber-400" />
                Role Management
              </CardTitle>
              <CardDescription>Assign custom claims via Cloud Functions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 flex flex-col justify-between h-[calc(100%-80px)]">
              <p className="text-sm text-zinc-400">
                Manage high-level roles (Admin, Maintainer, Staff) for registered users. Role changes require re-authentication.
              </p>
              <Button className="w-full bg-amber-500 hover:bg-amber-600 text-black font-semibold">
                Open Role Editor
              </Button>
            </CardContent>
          </Card>

          {/* Activity Log */}
          <Card className="col-span-full bg-zinc-900/50 border-white/10">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2">
                  <TerminalSquare className="h-5 w-5 text-zinc-400" />
                  System Activity Logs
                </CardTitle>
                <CardDescription>Audit trail for all administrative actions</CardDescription>
              </div>
              <Button variant="outline" size="sm" className="border-red-500/30 text-red-400 hover:bg-red-500/10">
                Clear Logs
              </Button>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-zinc-500 py-8 text-center border-2 border-dashed border-zinc-800 rounded-md bg-black/20 flex flex-col items-center gap-2">
                <Activity className="h-8 w-8 text-zinc-700" />
                No activity logs found in the <code className="text-zinc-400 bg-zinc-800 px-1 rounded">activity_log</code> collection.
              </div>
            </CardContent>
          </Card>

           {/* Access Registry */}
           <Card className="col-span-full bg-zinc-900/50 border-white/10">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5 text-blue-400" />
                Access Registry
              </CardTitle>
              <CardDescription>Centralized mapping rules for Vishnu capabilities</CardDescription>
            </CardHeader>
            <CardContent>
               <div className="text-sm text-zinc-500 py-8 text-center border-2 border-dashed border-zinc-800 rounded-md bg-black/20">
                Access registry is currently empty or not synchronized.
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </RoleGuard>
  );
}
