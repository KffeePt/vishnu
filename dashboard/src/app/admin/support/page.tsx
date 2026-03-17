"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Support</h3>
        <p className="text-sm text-zinc-400">
          Handle client messages and support tickets.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Active Tickets</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-500 py-6 text-center border-2 border-dashed border-zinc-800 rounded-md">
            No active tickets.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
