"use client";

import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";

export default function OverviewPage() {
  const { user, role, hasMinRole } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Overview</h3>
        <p className="text-sm text-zinc-400">
          Welcome back to the Vishnu Admin Dashboard.
        </p>
      </div>

      <Card className="border-cyan-500/20 bg-zinc-900/60">
        <CardHeader>
          <CardTitle>Vishnu Control Center</CardTitle>
          <CardDescription>
            Launch the encrypted operations console transplanted from the hardened admin panel stack.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <p className="max-w-2xl text-sm text-zinc-400">
            Use the Control Center for secure claims, staff workflows, protected data operations, and the full master-password session experience.
          </p>
          <Button asChild className="bg-cyan-500 text-black hover:bg-cyan-400">
            <Link href="/admin/control-center">Open Control Center</Link>
          </Button>
        </CardContent>
      </Card>

      {hasMinRole("maintainer") ? (
        // Admin / Maintainer View (Overall Team Stats)
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Logged in As</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{user?.displayName || user?.email?.split('@')[0] || "User"}</div>
              <p className="text-xs text-muted-foreground">
                Role: <span className="capitalize text-zinc-300">{role || "Loading..."}</span>
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Active Branches</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Needs GitHub Sync
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Open PRs</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Needs GitHub Sync
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Employees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Needs Firestore Sync
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        // Staff View (Personal Stats)
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">My Pull Requests</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Needs GitHub Sync
              </p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Lines Edited</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Since last sync
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Commits Made</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Past 30 days
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Files Changed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">--</div>
              <p className="text-xs text-muted-foreground">
                Past 30 days
              </p>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* Add activity feed placeholder here */}
      <Card className="col-span-4">
        <CardHeader>
          <CardTitle>{hasMinRole("maintainer") ? "Recent Activity" : "My Recent Activity"}</CardTitle>
          <CardDescription>
            System logs and recent PR actions will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-500 py-6 text-center border-2 border-dashed border-zinc-800 rounded-md">
            No activity recorded yet.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
