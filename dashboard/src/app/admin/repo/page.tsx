"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function RepoPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Repository</h3>
        <p className="text-sm text-zinc-400">
          Manage GitHub integration and deployment status.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Branches & Commits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-500 py-6 text-center border-2 border-dashed border-zinc-800 rounded-md">
            Needs GitHub Sync
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
