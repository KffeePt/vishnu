"use client";

import React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import UserManagerTab from "./user-manager-tab";
import ClaimsManager from "./claims-manager";
import { Users, Shield } from 'lucide-react';
import { useTabAuth } from "@/hooks/use-tab-auth";
import { AuthenticationRequired } from "../authentication-tab/authentication-required";

export default function UserManagerHub() {
    const { isTabAuthenticated, setIsTabAuthenticated, parentMasterPassword } = useTabAuth();

    if (!isTabAuthenticated) {
        return (
            <AuthenticationRequired
                parentMasterPassword={parentMasterPassword}
                onAuthenticated={() => setIsTabAuthenticated(true)}
                persistent={false}
            />
        );
    }
    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-2">
                <h2 className="text-3xl font-bold tracking-tight">User Manager</h2>
                <p className="text-muted-foreground">
                    Central hub for managing users, roles, and staff assignments.
                </p>
            </div>

            <Tabs defaultValue="users" className="w-full">
                <TabsList className="grid w-full max-w-md grid-cols-2">
                    <TabsTrigger value="users">
                        <Users className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Users & Log</span>
                    </TabsTrigger>
                    <TabsTrigger value="claims">
                        <Shield className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Claims</span>
                    </TabsTrigger>
                </TabsList>

                <div className="mt-6">
                    <TabsContent value="users">
                        <UserManagerTab />
                    </TabsContent>

                    <TabsContent value="claims">
                        <ClaimsManager />
                    </TabsContent>
                </div>
            </Tabs>
        </div>
    );
}
