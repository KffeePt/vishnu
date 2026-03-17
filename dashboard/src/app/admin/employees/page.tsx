"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function EmployeesPage() {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-2xl font-bold tracking-tight">Employees</h3>
        <p className="text-sm text-zinc-400">
          Manage team members, roles, and access controls.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-zinc-500 py-6 text-center border-2 border-dashed border-zinc-800 rounded-md">
            Needs Firestore Sync
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
