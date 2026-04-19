"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { UserAuth } from '@/context/auth-context';
import { getAdminHeaders } from '@/lib/client-auth';
import { Loader2, DollarSign, TrendingUp, Activity, ShieldAlert, CheckCircle2, XCircle } from 'lucide-react';
import { db } from '@/config/firebase';
import { collectionGroup, onSnapshot, query, orderBy } from 'firebase/firestore';
import { envelopeDecrypt, unwrapPrivateKey } from '@/lib/crypto-client';

interface OverviewTabProps {
  masterPassword?: string;
}

interface AccessAttempt {
  id: string;
  timestamp: any;
  email: string;
  success: boolean;
  ipAddress: string;
  userAgent: string;
}

const OverviewTab: React.FC<OverviewTabProps> = ({ masterPassword }) => {
  const { getIDToken, userClaims } = UserAuth();

  const [isLoadingFinances, setIsLoadingFinances] = useState(true);
  const [isLoadingLogs, setIsLoadingLogs] = useState(true);

  const [metrics, setMetrics] = useState({
    totalRevenue: 0,
    netProfit: 0,
    todayRevenue: 0,
    weekRevenue: 0,
  });

  const [accessLogs, setAccessLogs] = useState<AccessAttempt[]>([]);

  // 1. Fetch Staff Activity Logs
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const idToken = await getIDToken();
        if (!idToken) return;

        const res = await fetch('/api/admin/logging/access-attempts', {
          headers: getAdminHeaders(idToken)
        });

        if (res.ok) {
          const data = await res.json();
          // Take only the 10 most recent
          setAccessLogs((data.attempts || []).slice(0, 10));
        }
      } catch (err) {
        console.error("Failed to fetch access logs", err);
      } finally {
        setIsLoadingLogs(false);
      }
    };

    fetchLogs();
  }, [getIDToken]);

  // 2. Fetch & Decrypt Financial Metrics
  useEffect(() => {
    if (!userClaims || (!userClaims.admin && !userClaims.owner)) return;
    if (!masterPassword) {
      setIsLoadingFinances(false);
      return;
    }

    const q = query(
      collectionGroup(db, 'records'),
      orderBy('createdAt', 'desc')
    );

    setIsLoadingFinances(true);

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        const idToken = await getIDToken();
        const keyRes = await fetch('/api/admin/keys', {
          headers: { Authorization: `Bearer ${idToken}` }
        });

        if (!keyRes.ok) throw new Error('Failed to fetch admin key');
        const adminKeyData = await keyRes.json();
        if (!adminKeyData.encryptedPrivateKey) throw new Error('No encrypted private key');

        const privateKey = await unwrapPrivateKey(adminKeyData.encryptedPrivateKey, masterPassword);

        let totalRev = 0;
        let totalCost = 0;
        let totalDebts = 0;
        let todayRev = 0;
        let weekRev = 0;

        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        // Calculate start of week (assuming Monday is start of week)
        const day = now.getDay() || 7;
        if (day !== 1) now.setHours(-24 * (day - 1));
        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (!data.encryptedData || !data.adminWrappedDEK || !data.iv) continue;

          try {
            const decStr = await envelopeDecrypt(
              {
                encryptedData: data.encryptedData,
                staffWrappedDEK: data.staffWrappedDEK || '',
                adminWrappedDEK: data.adminWrappedDEK,
                iv: data.iv,
                encryptionVersion: data.encryptionVersion ?? 2
              },
              data.adminWrappedDEK,
              privateKey
            );

            const decData = JSON.parse(decStr);
            const recordType = decData.type || 'sale';
            const recordDate = data.createdAt?.toDate?.() || new Date(decData.soldAt || decData.paidAt || Date.now());
            const recordTime = recordDate.getTime();

            if (recordType === 'sale' || !decData.type) {
              const qty = decData.qtySold || 0;
              const unitPrice = typeof decData.value === 'number' ? decData.value : 0;
              const cost = decData.originalCost || 0;

              const revenue = qty * unitPrice;
              totalRev += revenue;
              totalCost += (qty * cost);

              if (recordTime >= startOfDay) todayRev += revenue;
              if (recordTime >= startOfWeek) weekRev += revenue;
            } else if (recordType === 'debt') {
              totalDebts += Math.abs(decData.value || 0);
            }
          } catch (e: any) {
            // Silently ignore decryption errors for legacy docs
          }
        }

        // Net profit calculation: (Revenue - Cost) + Debts Admin Profit
        const netProfit = (totalRev - totalCost) + totalDebts;

        setMetrics({
          totalRevenue: totalRev,
          netProfit: netProfit,
          todayRevenue: todayRev,
          weekRevenue: weekRev,
        });
      } catch (error) {
        console.error("Error decrypting overview metrics:", error);
      } finally {
        setIsLoadingFinances(false);
      }
    });

    return () => unsubscribe();
  }, [masterPassword, userClaims, getIDToken]);

  return (
    <div className="space-y-6">
      {/* Financial Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="border-l-4 border-l-primary/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingFinances ? (
              <Loader2 className="h-4 w-4 animate-spin my-1" />
            ) : !masterPassword ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><ShieldAlert className="h-3 w-3" /> Locked</div>
            ) : (
              <div className="text-2xl font-bold">${metrics.totalRevenue.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-blue-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingFinances ? (
              <Loader2 className="h-4 w-4 animate-spin my-1" />
            ) : !masterPassword ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><ShieldAlert className="h-3 w-3" /> Locked</div>
            ) : (
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">${metrics.netProfit.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-emerald-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingFinances ? (
              <Loader2 className="h-4 w-4 animate-spin my-1" />
            ) : !masterPassword ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><ShieldAlert className="h-3 w-3" /> Locked</div>
            ) : (
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">${metrics.todayRevenue.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-l-4 border-l-violet-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingFinances ? (
              <Loader2 className="h-4 w-4 animate-spin my-1" />
            ) : !masterPassword ? (
              <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1"><ShieldAlert className="h-3 w-3" /> Locked</div>
            ) : (
              <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">${metrics.weekRevenue.toFixed(2)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff Activity Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Recent Staff Login Activity</CardTitle>
          <CardDescription>Latest access attempts across the platform.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingLogs ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : accessLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No recent activity</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="hidden md:table-cell">IP Address</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accessLogs.map((log) => {
                    const time = log.timestamp?._seconds
                      ? new Date(log.timestamp._seconds * 1000).toLocaleString()
                      : new Date(log.timestamp).toLocaleString();

                    return (
                      <TableRow key={log.id}>
                        <TableCell>
                          {log.success ? (
                            <Badge variant="outline" className="border-emerald-500 text-emerald-600 bg-emerald-50 dark:bg-emerald-950">
                              <CheckCircle2 className="h-3 w-3 mr-1" /> Success
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="border-destructive text-destructive bg-destructive/10">
                              <XCircle className="h-3 w-3 mr-1" /> Failed
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{log.email}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{time}</TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground font-mono">
                          {log.ipAddress}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewTab;