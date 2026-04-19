"use client";

import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { Loader2, ShieldAlert } from 'lucide-react';

export default function ClaimsManager() {
    const [targetEmail, setTargetEmail] = useState('');
    const [selectedRole, setSelectedRole] = useState('user');
    const [isLoading, setIsLoading] = useState(false);
    const { getIDToken } = UserAuth();
    const { toast } = useToast();

    // Note: In a real app, we'd search by email first to get the UID. 
    // For this implementation, we'll assume the user might copy-paste a UID 
    // or we'll add a lookup step if needed. 
    // To make it user-friendly, let's allow entering a UID directly for now,
    // as getting UID from email requires an admin SDK call which we can wrap.

    // Better approach: Use the /api/admin/employees endpoint or similar to find users?
    // For simplicity and robustness, let's ask for UID, but label it clearly.
    // Ideally, we'd pick from a list in the Users tab.

    const [targetUid, setTargetUid] = useState('');

    const handleAssignRole = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!targetUid) {
            toast({ title: "Error", description: "User UID is required", variant: "destructive" });
            return;
        }

        try {
            setIsLoading(true);
            const token = await getIDToken();

            const res = await fetch('/api/admin/claims', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ uid: targetUid, role: selectedRole })
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Failed to assign role');

            toast({
                title: "Role Assigned",
                description: `Successfully assigned ${selectedRole} to ${targetUid}`
            });

            setTargetUid('');
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <ShieldAlert className="h-5 w-5 text-orange-500" />
                    Role Management
                </CardTitle>
                <CardDescription>
                    Assign high-level system roles.
                    <strong> Owner</strong> access required.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleAssignRole} className="space-y-4 max-w-lg">
                    <div className="space-y-2">
                        <label className="text-sm font-medium">Target User UID</label>
                        <Input
                            placeholder="Enter Firebase UID (copy from Users tab)"
                            value={targetUid}
                            onChange={(e) => setTargetUid(e.target.value)}
                        />
                        <p className="text-xs text-muted-foreground">
                            Tip: Copy the ID from the "Users" tab list.
                        </p>
                    </div>

                    <div className="space-y-2">
                        <label className="text-sm font-medium">Assign Role</label>
                        <Select value={selectedRole} onValueChange={setSelectedRole}>
                            <SelectTrigger>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="user">User (Basic)</SelectItem>
                                <SelectItem value="staff">Staff (Workforce Portal)</SelectItem>
                                <SelectItem value="manager">Manager (Inventory Access)</SelectItem>
                                <SelectItem value="admin">Admin (Full Access - No Delete)</SelectItem>
                                <SelectItem value="owner">Owner (God Mode)</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button type="submit" disabled={isLoading}>
                        {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Assign Role
                    </Button>
                </form>
            </CardContent>
        </Card>
    );
}
