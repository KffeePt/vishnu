"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserAuth } from "@/context/auth-context";
import { Loader2, DollarSign, Package, Activity, Users, Wallet, TrendingUp } from 'lucide-react';
import { InventoryItem, InventoryTransaction, Employee } from '@/types/candyland';
import { getAdminHeaders } from '@/lib/client-auth';

export default function InventoryOverviewTab() {
    const [stats, setStats] = useState({
        totalValue: 0,
        totalItems: 0,
        assignedValue: 0,
        totalCost: 0,
        totalMargin: 0,
    });
    const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
    const [employeeStats, setEmployeeStats] = useState<{ name: string, value: number, itemCount: number }[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const { getIDToken } = UserAuth();

    useEffect(() => {
        fetchData();

        // Listen for new inventory items added globally
        const handleRefresh = () => fetchData();
        window.addEventListener('inventory-updated', handleRefresh);
        return () => window.removeEventListener('inventory-updated', handleRefresh);
    }, []);

    const fetchData = async () => {
        try {
            setIsLoading(true);
            const token = await getIDToken();
            if (!token) return;

            const [itemsRes, transRes, empRes] = await Promise.all([
                fetch('/api/admin/inventory', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/inventory/transactions', { headers: getAdminHeaders(token) }),
                fetch('/api/admin/staff', { headers: getAdminHeaders(token) }),
            ]);

            if (itemsRes.ok && transRes.ok && empRes.ok) {
                const items: InventoryItem[] = await itemsRes.json();
                const trans: InventoryTransaction[] = await transRes.json();
                const employees: Employee[] = await empRes.json();

                // Calculate Stats
                let totalVal = 0;
                let totalCostAmount = 0;
                let assignedVal = 0;
                const empMap = new Map<string, { name: string, value: number, itemCount: number }>();

                items.forEach(item => {
                    const val = item.unitValue * item.quantity;
                    const cost = (item.originalCost || 0) * item.quantity;
                    totalVal += val;
                    totalCostAmount += cost;

                    // Compute assigned value from the assignments array
                    const itemAssignments = (item as any).assignments ?? [];
                    itemAssignments.forEach((a: { employeeId: string; employeeName: string; quantity: number }) => {
                        const assignedVal_partial = item.unitValue * a.quantity;
                        assignedVal += assignedVal_partial;
                        if (!empMap.has(a.employeeId)) {
                            empMap.set(a.employeeId, { name: a.employeeName, value: 0, itemCount: 0 });
                        }
                        const entry = empMap.get(a.employeeId)!;
                        entry.value += assignedVal_partial;
                        entry.itemCount += 1;
                    });
                });

                setStats({
                    totalValue: totalVal,
                    totalItems: items.length,
                    assignedValue: assignedVal,
                    totalCost: totalCostAmount,
                    totalMargin: totalVal - totalCostAmount,
                });

                setTransactions(trans);
                setEmployeeStats(Array.from(empMap.values()));
            }
        } catch (error) {
            console.error("Failed to load overview data", error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-3xl font-bold tracking-tight">Inventory Overview</h2>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Inventory Value</CardTitle>
                        <DollarSign className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">${stats.totalValue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Across all categories</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
                        <Wallet className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-amber-600 dark:text-amber-500">${stats.totalCost.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Original acquisition cost</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Expected Margin</CardTitle>
                        <TrendingUp className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-green-600 dark:text-green-500">${stats.totalMargin.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Value minus cost</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Unique Items</CardTitle>
                        <Package className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{stats.totalItems}</div>
                        <p className="text-xs text-muted-foreground">SKUs tracking</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Value Entrusted</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">${stats.assignedValue.toFixed(2)}</div>
                        <p className="text-xs text-muted-foreground">Currently held by staff</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Recent Activity</CardTitle>
                        <Activity className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{transactions.length}</div>
                        <p className="text-xs text-muted-foreground">Total transactions logged</p>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Entrusted Inventory by Employee</CardTitle>
                        <CardDescription>Value of equipment/goods currently assigned to staff.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Employee</TableHead>
                                    <TableHead className="text-right">Items Held</TableHead>
                                    <TableHead className="text-right">Total Value</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {employeeStats.length === 0 ? (
                                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">No items assigned.</TableCell></TableRow>
                                ) : (
                                    employeeStats.map((stat, i) => (
                                        <TableRow key={i}>
                                            <TableCell className="font-medium">{stat.name}</TableCell>
                                            <TableCell className="text-right">{stat.itemCount}</TableCell>
                                            <TableCell className="text-right">${stat.value.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </CardContent>
                </Card>

                <Card className="col-span-1">
                    <CardHeader>
                        <CardTitle>Recent Transactions</CardTitle>
                        <CardDescription>Latest inventory movements and assignments.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="max-h-[300px] overflow-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Item</TableHead>
                                        <TableHead className="text-right">Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {transactions.slice(0, 10).map((t) => (
                                        <TableRow key={t.id}>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span className="font-medium capitalize">{t.type}</span>
                                                    <span className="text-xs text-muted-foreground">{t.employeeName ? `User: ${t.employeeName}` : ''}</span>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col">
                                                    <span>{t.itemName}</span>
                                                    {t.quantityChange !== 0 && <span className="text-xs text-muted-foreground">{t.quantityChange > 0 ? '+' : ''}{t.quantityChange}</span>}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-right text-xs">
                                                {new Date(t.createdAt).toLocaleDateString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
