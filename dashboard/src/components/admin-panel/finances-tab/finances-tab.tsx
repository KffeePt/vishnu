"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from '@/hooks/use-toast';
import { UserAuth } from '@/context/auth-context';
import { CandySale, Expense } from '@/types/candyland';
import { Label } from "@/components/ui/label";
import { Plus, Edit, Trash2, Save, Download, RefreshCcw, DollarSign, TrendingUp, Users, Wallet, Loader2, ShoppingCart, Package, ShieldAlert, Lock } from 'lucide-react';
import { db } from '@/config/firebase';
import { collectionGroup, onSnapshot, query, orderBy, doc, deleteDoc, getDocs, collection } from 'firebase/firestore';
import { envelopeDecrypt, unwrapPrivateKey, fingerprintKey } from '@/lib/crypto-client';
import { getAdminHeaders } from '@/lib/client-auth';
import { useTabAuth } from "@/hooks/use-tab-auth";
import { AuthenticationRequired } from "../authentication-tab/authentication-required";

interface FinancesTabProps {
  masterPassword?: string;  // kept for legacy compat during transition
}

// Extended type for E2E sale records with payroll data
interface E2ESaleRecord extends CandySale {
  originalCost?: number;
  staffUid?: string;
  staffName?: string;
  firestorePath?: string; // e.g. finances/{uid}/records/{docId}
  category?: string; // From modern sell payloads
}

const FinancesTab: React.FC<FinancesTabProps> = ({ masterPassword: legacyMasterPassword }) => {
  const { user, getIDToken, userClaims } = UserAuth();
  const { isTabAuthenticated, setIsTabAuthenticated, parentMasterPassword } = useTabAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('sales');
  const [sales, setSales] = useState<CandySale[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

  // Real-time E2E staff-pushed sale records
  const [e2eSales, setE2eSales] = useState<E2ESaleRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isDecrypting, setIsDecrypting] = useState(false);

  // Filter and search states
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'sale' | 'expense'>('all');
  const [filterDate, setFilterDate] = useState('');

  // Dialog states
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<CandySale | Expense | null>(null);

  // Delete E2E confirmation
  const [deleteE2ERecord, setDeleteE2ERecord] = useState<E2ESaleRecord | null>(null);
  const [isDeletingE2E, setIsDeletingE2E] = useState(false);

  // Form states for add/edit
  const [formData, setFormData] = useState({
    type: 'sale' as 'sale' | 'expense',
    candyName: '',
    grams: '',
    totalSold: '',
    description: '',
    amount: '',
    category: '',
    date: new Date().toISOString().split('T')[0]
  });

  // Resolve active password
  const activeMasterPassword = legacyMasterPassword || parentMasterPassword || '';

  const [dateRange, setDateRange] = useState({
    from: new Date(new Date().setHours(0, 0, 0, 0)),
    to: new Date(new Date().setHours(23, 59, 59, 999))
  });

  const fetchData = useCallback(async () => {
    if (!isTabAuthenticated && !activeMasterPassword) return;

    try {
      setIsLoading(true);
      const idToken = await getIDToken();
      if (!idToken) return;

      const [salesRes, expensesRes, invRes] = await Promise.all([
        fetch('/api/admin/finances/sales', { headers: getAdminHeaders(idToken) }),
        fetch('/api/admin/finances/expenses', { headers: getAdminHeaders(idToken) }),
        fetch('/api/admin/inventory', { headers: getAdminHeaders(idToken) })
      ]);

      if (salesRes.ok) {
        const salesData = await salesRes.json();
        setSales(salesData.sales || []);
      }
      if (expensesRes.ok) {
        const expensesData = await expensesRes.json();
        setExpenses(expensesData.expenses || []);
      }
      if (invRes.ok) {
        const invData = await invRes.json();
        setInventoryItems(invData || []);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast({ title: 'Error fetching data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [activeMasterPassword, isTabAuthenticated, getIDToken, toast]);



  useEffect(() => {
    if (!isTabAuthenticated && !activeMasterPassword) return;
    fetchData();
  }, [activeMasterPassword, isTabAuthenticated, fetchData, dateRange]);

  // Real-time listener for E2E finances
  useEffect(() => {
    if (!userClaims || (!userClaims.admin && !userClaims.owner)) return;
    if (!activeMasterPassword && !isTabAuthenticated) return;

    const q = query(
      collectionGroup(db, 'records'),
      orderBy('createdAt', 'desc')
    );

    setIsDecrypting(true);

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      try {
        // Fetch admin's private key for decryption
        const idToken = await getIDToken();
        const keyRes = await fetch('/api/admin/keys', {
          headers: { Authorization: `Bearer ${idToken}` }
        });
        if (!keyRes.ok) throw new Error('Failed to fetch admin key');
        const adminKeyData = await keyRes.json();

        if (!adminKeyData.encryptedPrivateKey) {
          console.warn("No encrypted private key found for admin.");
          setIsDecrypting(false);
          return;
        }

        const privateKey = await unwrapPrivateKey(adminKeyData.encryptedPrivateKey, activeMasterPassword);

        const decryptedSales: E2ESaleRecord[] = [];

        for (const docSnap of snapshot.docs) {
          const data = docSnap.data();
          if (!data.encryptedData || !data.adminWrappedDEK || !data.iv) {
            continue;
          }

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
            // Build Firestore path for deletion
            const pathSegments = docSnap.ref.path.split('/');
            const staffUid = pathSegments.length >= 2 ? pathSegments[1] : '';

            const recordType = decData.type || 'sale';

            if (recordType === 'payment') {
              decryptedSales.push({
                id: docSnap.id,
                candyName: `Payment${decData.note ? ': ' + decData.note : ''}`,
                grams: 0,
                totalSold: 0,
                originalCost: 0,
                recordedBy: data.staffUid || staffUid,
                staffUid: data.staffUid || staffUid,
                firestorePath: docSnap.ref.path,
                createdAt: data.createdAt?.toDate?.() || new Date(decData.paidAt || Date.now()),
                _type: 'payment',
                _amount: decData.amount || 0,
              } as any);
            } else if (recordType === 'debt') {
              decryptedSales.push({
                id: docSnap.id,
                candyName: `Debt${decData.note ? ': ' + decData.note : ''}`,
                grams: 0,
                totalSold: 0,
                originalCost: 0,
                recordedBy: data.staffUid || staffUid,
                staffUid: data.staffUid || staffUid,
                firestorePath: docSnap.ref.path,
                createdAt: data.createdAt?.toDate?.() || new Date(decData.soldAt || Date.now()),
                _type: 'debt',
                _amount: Math.abs(decData.value || 0),
              } as any);
            } else {
              decryptedSales.push({
                id: docSnap.id,
                candyName: decData.itemId || 'Unknown Item',
                grams: typeof decData.value === 'number' ? decData.value : 0,
                totalSold: decData.qtySold,
                originalCost: decData.originalCost ?? 0,
                recordedBy: data.staffUid || staffUid,
                staffUid: data.staffUid || staffUid,
                firestorePath: docSnap.ref.path,
                createdAt: data.createdAt?.toDate?.() || new Date(decData.soldAt || Date.now()),
                category: decData.category, // Future-proofing from new payloads
              });
            }
          } catch (e: any) {
            const pkFp = adminKeyData.publicKey ? await fingerprintKey(adminKeyData.publicKey) : 'none';
            console.warn(`[E2E] Skipped legacy/stale sale record ${docSnap.id}. Current adminPubKey FP: ${pkFp}. Error:`, e.name || e.message);
          }
        }

        setE2eSales(decryptedSales);
      } catch (error) {
        console.error("E2E setup error in onSnapshot", error);
      } finally {
        setIsDecrypting(false);
      }
    });

    return () => unsubscribe();
  }, [activeMasterPassword, userClaims, getIDToken, isTabAuthenticated]);



  // forceSync was here

  const forceSync = async () => {
    setIsDecrypting(true);
    await fetchData();
    setTimeout(() => {
      setIsDecrypting(false);
      toast({ title: 'Treasury Synced', description: 'Latest financial data has been fully synchronized.' });
    }, 800);
  };

  if (!isTabAuthenticated && !legacyMasterPassword) {
    return (
      <AuthenticationRequired
        parentMasterPassword={activeMasterPassword}
        onAuthenticated={() => setIsTabAuthenticated(true)}
        persistent={false}
      />
    );
  }

  // Delete an E2E sale record from Firestore
  const handleDeleteE2E = async () => {
    if (!deleteE2ERecord?.firestorePath) return;
    setIsDeletingE2E(true);
    try {
      const docRef = doc(db, deleteE2ERecord.firestorePath);
      await deleteDoc(docRef);
      toast({ title: 'Record Deleted', description: 'E2E sale record permanently removed from Firestore.' });
      setDeleteE2ERecord(null);
    } catch (error) {
      console.error("Failed to delete E2E record:", error);
      toast({ title: 'Delete Failed', description: 'Could not delete the record. Check permissions.', variant: 'destructive' });
    } finally {
      setIsDeletingE2E(false);
    }
  };

  // Combine and sort data (Sales, E2E Sales, Expenses)
  const getCombinedData = () => {
    const combined = [
      ...sales.map(s => ({ ...s, type: 'sale' as const, source: 'manual' as const })),
      ...e2eSales.map(es => ({ ...es, type: 'sale' as const, source: 'e2e' as const })),
      ...expenses.map(e => ({ ...e, type: 'expense' as const, source: 'manual' as const }))
    ];
    return combined.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  };

  const filteredData = getCombinedData().filter(item => {
    const matchesSearch = searchTerm === '' ||
      ('candyName' in item && item.candyName.toLowerCase().includes(searchTerm.toLowerCase())) ||
      ('description' in item && item.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesType = filterType === 'all' || item.type === filterType;

    const matchesDate = filterDate === '' ||
      new Date(item.createdAt).toISOString().split('T')[0] === filterDate;

    return matchesSearch && matchesType && matchesDate;
  });

  // Summary stats (include payments and debts correctly)
  const saleOnlyRecords = e2eSales.filter((s: any) => !s._type || s._type === 'sale');
  const debtRecords = e2eSales.filter((s: any) => s._type === 'debt');
  const paymentRecords = e2eSales.filter((s: any) => s._type === 'payment');

  const totalE2ERevenue = saleOnlyRecords.reduce((sum, s) => sum + (s.grams * s.totalSold), 0);
  const totalE2ECost = saleOnlyRecords.reduce((sum, s) => sum + ((s.originalCost ?? 0) * s.totalSold), 0);
  const totalE2EPayrollExtracted = (totalE2ERevenue - totalE2ECost) / 2;
  const totalDebts = debtRecords.reduce((sum, s: any) => sum + (s._amount || 0), 0);

  // Total Paid to Staff (positive payments, ignore repayments to admin)
  const totalPaymentsMade = paymentRecords.reduce((sum, s: any) => sum + ((s._amount || 0) > 0 ? s._amount : 0), 0);

  // Net Profit = (Revenue - Cost) + Debts (Admin's profit)
  const totalE2EProfit = (totalE2ERevenue - totalE2ECost) + totalDebts;

  // Personal Profit = Net Profit - Est. Payroll
  const personalProfit = totalE2EProfit - totalE2EPayrollExtracted;

  // Spreadsheet editing functions (Only allowed for manual entries)
  const startEditing = (rowIndex: number) => {
    const item = filteredData[rowIndex];
    if ('source' in item && item.source === 'e2e') {
      toast({ title: 'Cannot edit E2E records', description: 'Staff-pushed real-time sale records are immutable.', variant: 'destructive' });
      return;
    }
    setCurrentItem(item);
  };

  const saveEdit = async () => {
    if (currentItem && currentItem.id) {
      try {
        const idToken = await getIDToken();
        if (!idToken) return;

        const endpoint = 'candyName' in currentItem ? '/api/admin/finances/sales' : '/api/admin/finances/expenses';
        const response = await fetch(`${endpoint}?id=${currentItem.id}`, {
          method: 'PUT',
          headers: getAdminHeaders(idToken),
          body: JSON.stringify(currentItem)
        });

        if (response.ok) {
          toast({ title: 'Update applied immediately' });
          setCurrentItem(null);
          fetchData();
        } else {
          toast({ title: 'Update failed', variant: 'destructive' });
        }
      } catch (e) {
        console.error("Direct update error:", e);
        toast({ title: 'Error', variant: 'destructive' });
      }
    }
  };

  const cancelEdit = () => {
    setCurrentItem(null);
  };

  const deleteRow = async (rowIndex: number) => {
    const item = filteredData[rowIndex];
    try {
      const idToken = await getIDToken();
      if (!idToken) return;

      const endpoint = 'candyName' in item ? '/api/admin/finances/sales' : '/api/admin/finances/expenses';
      const response = await fetch(`${endpoint}?id=${item.id}`, {
        method: 'DELETE',
        headers: getAdminHeaders(idToken)
      });

      if (response.ok) {
        toast({ title: 'Item deleted successfully' });
        fetchData();
      } else {
        const errorData = await response.json();
        toast({ title: 'Failed to delete item', description: errorData.error, variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting item:', error);
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const exportData = () => {
    const csvData = [
      ['Type', 'Date', 'Description', 'Amount', 'Cost', 'Payroll', 'Category', 'Recorded By'],
      ...filteredData.map(item => [
        'candyName' in item ? 'Sale' : 'Expense',
        new Date(item.createdAt).toLocaleDateString(),
        'candyName' in item ? item.candyName : item.description,
        'totalSold' in item ? (item.grams * item.totalSold).toFixed(2) : (item.amount ?? 0).toFixed(2),
        'originalCost' in item ? ((item.originalCost ?? 0) * (item.totalSold ?? 0)).toFixed(2) : '-',
        'originalCost' in item ? (((item.grams * item.totalSold) - ((item.originalCost ?? 0) * item.totalSold)) / 2).toFixed(2) : '-',
        'category' in item ? item.category : '',
        item.recordedBy
      ])
    ];

    const csvContent = csvData.map(row => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'treasury-data.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleAddEntry = async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return;

      const endpoint = formData.type === 'sale' ? '/api/admin/finances/sales' : '/api/admin/finances/expenses';
      const body = formData.type === 'sale' ? {
        candyName: formData.candyName,
        grams: parseFloat(formData.grams),
        totalSold: parseInt(formData.totalSold),
      } : {
        description: formData.description,
        amount: parseFloat(formData.amount),
        category: formData.category,
        date: formData.date,
      };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: getAdminHeaders(idToken),
        body: JSON.stringify(body),
      });

      if (response.ok) {
        toast({ title: 'Entry added successfully' });
        setIsAddDialogOpen(false);
        resetForm();
        fetchData();
      } else {
        toast({ title: 'Failed to add entry', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error adding entry:', error);
      toast({ title: 'An unexpected error occurred', variant: 'destructive' });
    }
  };

  const resetForm = () => {
    setFormData({
      type: 'sale',
      candyName: '',
      grams: '',
      totalSold: '',
      description: '',
      amount: '',
      category: '',
      date: new Date().toISOString().split('T')[0]
    });
  };



  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <Wallet className="h-7 w-7 text-primary" />
            Treasury
          </h2>
          <p className="text-muted-foreground text-sm">
            Unified financial hub — manual records and real-time E2E encrypted staff sales.
          </p>
        </div>
        <Button variant="outline" onClick={exportData}>
          <Download className="mr-2 h-4 w-4" /> Export CSV
        </Button>
      </div>

      {/* Personal Profit Bar */}
      <Card className="mb-4 border-l-4 border-l-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardContent className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-emerald-600 dark:text-emerald-500" />
                <h3 className="font-semibold text-emerald-900 dark:text-emerald-100">Personal Profit</h3>
              </div>
              <p className="text-sm text-emerald-600/80 dark:text-emerald-400/80">Net Profit − Staff Payroll</p>
            </div>
            <div className="text-4xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400">
              ${personalProfit.toFixed(2)}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Primary Financial Metrics */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5 mb-4">
        <Card className="border-l-4 border-l-primary/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">E2E Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalE2ERevenue.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">{e2eSales.length} sale records decrypted</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Cost</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${totalE2ECost.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Cost of goods sold</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalE2EProfit.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Revenue − Cost</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-violet-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Est. Payroll</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-violet-600 dark:text-violet-400">${totalE2EPayrollExtracted.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">(Rev − Cost) ÷ 2</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paid to Staff</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">${totalPaymentsMade.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Total cash transferred</p>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-destructive/60">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Staff Debts</CardTitle>
            <ShieldAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">${totalDebts.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground">Overall staff debts</p>
          </CardContent>
        </Card>
      </div>

      {/* Volume Metrics Cards */}
      <Card className="mb-4">
        <CardContent className="p-0">
          <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
            <div className="p-6 flex flex-col gap-1">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-sm font-medium text-foreground">Total Sales</span>
                <ShoppingCart className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold">{getCombinedData().filter(i => 'candyName' in i || ('source' in i && (i as any).source === 'e2e')).length}</div>
              <p className="text-xs text-muted-foreground">Total volume of sale transactions</p>
            </div>

            <div className="p-6 flex flex-col gap-1">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-sm font-medium text-foreground">Total Quantity</span>
                <Package className="h-4 w-4" />
              </div>
              <div className="text-2xl font-bold">
                {getCombinedData()
                  .filter(i => ('candyName' in i || ('source' in i && (i as any).source === 'e2e')))
                  .filter(i => !('_type' in i) || (i as any)._type === 'sale')
                  .reduce((sum, item) => sum + ('totalSold' in item ? Number((item as any).totalSold) : 0), 0)
                  .toLocaleString()} <span className="text-sm font-normal text-muted-foreground">pcs</span>
              </div>
              <p className="text-xs text-muted-foreground">Total pieces/items sold</p>
            </div>

            <div className="p-6 flex flex-col gap-1">
              <div className="flex items-center justify-between text-muted-foreground mb-1">
                <span className="text-sm font-medium text-foreground">Total Weight</span>
                <div className="h-4 w-4 flex items-center justify-center font-bold text-[10px] bg-muted-foreground/10 rounded-full">KG</div>
              </div>
              <div className="text-2xl font-bold">
                {(getCombinedData()
                  .filter(i => ('candyName' in i || ('source' in i && (i as any).source === 'e2e')))
                  .filter(i => !('_type' in i) || (i as any)._type === 'sale')
                  .reduce((sum, item) => sum + ('totalSold' in item && 'grams' in item ? Number((item as any).totalSold) * Number((item as any).grams) : 0), 0) / 1000)
                  .toFixed(2)} <span className="text-sm font-normal text-muted-foreground">kg</span>
              </div>
              <p className="text-xs text-muted-foreground">Total mass of items sold</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Breakdown (Sales Only) */}
      <Card>
        <CardHeader className="pb-3 border-b bg-muted/20">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-indigo-500" />
            Sales by Type
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Qty Sold</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right text-emerald-600 dark:text-emerald-500 font-bold">Est. Admin Profit</TableHead>
                <TableHead className="text-right">Records</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(() => {
                const saleOnlyRecords = getCombinedData().filter(i =>
                  ('candyName' in i || ('source' in i && (i as any).source === 'e2e')) &&
                  (!('_type' in i) || (i as any)._type === 'sale')
                ) as E2ESaleRecord[];

                if (saleOnlyRecords.length === 0) {
                  return (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-6 text-muted-foreground">No sales data available</TableCell>
                    </TableRow>
                  );
                }

                const catStats = saleOnlyRecords.reduce((acc, sale) => {
                  // Aggregate by item name/type (e.g. "Gummy Bears") rather than high-level category
                  const catKey = (sale.candyName || 'unknown').toLowerCase();

                  if (!acc[catKey]) acc[catKey] = { qty: 0, revenue: 0, cost: 0, count: 0 };

                  const qty = Number(sale.totalSold) || 0;
                  const rev = qty * (Number(sale.grams) || 0); // Handle grams alias for unit value
                  const cost = qty * (Number(sale.originalCost) || 0);

                  acc[catKey].qty += qty;
                  acc[catKey].revenue += rev;
                  acc[catKey].cost += cost;
                  acc[catKey].count += 1;

                  return acc;
                }, {} as Record<string, { qty: number, revenue: number, cost: number, count: number }>);

                // Assuming profit percent needs to be calculated. If we don't have per-employee profit here,
                // we'll use a standard global approximation or just raw margin.
                // Raw margin is Revenue - Cost. Admin profit = (Rev-Cost) * (profitPercent/100).
                // Let's just show raw margin here to keep it simple, since profit % varies per staff.

                return Object.entries(catStats)
                  .sort((a, b) => b[1].revenue - a[1].revenue)
                  .map(([cat, stats]) => (
                    <TableRow key={cat}>
                      <TableCell className="font-medium capitalize">{cat}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{stats.qty.toLocaleString()}</TableCell>
                      <TableCell className="text-right font-mono text-sm">${stats.revenue.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-muted-foreground">${stats.cost.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-mono text-sm text-emerald-600 dark:text-emerald-400 font-bold">${(stats.revenue - stats.cost).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">{stats.count}</TableCell>
                    </TableRow>
                  ));
              })()}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Filters and Search */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                placeholder="Search records..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
              />
            </div>
            <Select value={filterType} onValueChange={(value: typeof filterType) => setFilterType(value)}>
              <SelectTrigger className="w-[150px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="sale">Sales Only</SelectItem>
                <SelectItem value="expense">Expenses Only</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="w-[160px]"
            />
          </div>
        </CardContent>
      </Card>

      {/* Spreadsheet Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="text-xl">Financial Ledger</CardTitle>
              <CardDescription className="mt-1">All records — manual and E2E synced. E2E records show payroll calculations.</CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {isDecrypting && <span className="text-xs text-muted-foreground mr-2 animate-pulse">Decrypting records...</span>}
              <Button size="sm" variant="outline" onClick={forceSync} disabled={isDecrypting}>
                <RefreshCcw className={`mr-2 h-4 w-4 ${isDecrypting ? 'animate-spin' : ''}`} />
                Sync
              </Button>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Entry
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add New Entry</DialogTitle>
                    <DialogDescription>Add a manual sale or expense record to the treasury.</DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="entry-type">Entry Type</Label>
                      <Select value={formData.type} onValueChange={(value: 'sale' | 'expense') => setFormData({ ...formData, type: value })}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="sale">Sale</SelectItem>
                          <SelectItem value="expense">Expense</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {formData.type === 'sale' ? (
                      <>
                        <div>
                          <Label htmlFor="candyName">Product Name</Label>
                          <Input
                            id="candyName"
                            value={formData.candyName}
                            onChange={(e) => setFormData({ ...formData, candyName: e.target.value })}
                            placeholder="Enter product name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="grams">Weight (grams)</Label>
                          <Input
                            id="grams"
                            type="number"
                            step="0.01"
                            value={formData.grams}
                            onChange={(e) => setFormData({ ...formData, grams: e.target.value })}
                            placeholder="e.g., 100.5"
                          />
                        </div>
                        <div>
                          <Label htmlFor="totalSold">Total Sold</Label>
                          <Input
                            id="totalSold"
                            type="number"
                            value={formData.totalSold}
                            onChange={(e) => setFormData({ ...formData, totalSold: e.target.value })}
                            placeholder="e.g., 50"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        <div>
                          <Label htmlFor="description">Description</Label>
                          <Input
                            id="description"
                            value={formData.description}
                            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                            placeholder="Enter expense description"
                          />
                        </div>
                        <div>
                          <Label htmlFor="category">Category</Label>
                          <Input
                            id="category"
                            value={formData.category}
                            onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                            placeholder="e.g., Supplies, Utilities"
                          />
                        </div>
                        <div>
                          <Label htmlFor="amount">Amount ($)</Label>
                          <Input
                            id="amount"
                            type="number"
                            step="0.01"
                            value={formData.amount}
                            onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                            placeholder="e.g., 150.00"
                          />
                        </div>
                      </>
                    )}

                    <div>
                      <Label htmlFor="date">Date</Label>
                      <Input
                        id="date"
                        type="date"
                        value={formData.date}
                        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                    <Button onClick={handleAddEntry}>Add Entry</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Payroll</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : filteredData.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No records found</TableCell>
                  </TableRow>
                ) : (
                  filteredData.map((item, index) => {
                    const isE2E = 'source' in item && item.source === 'e2e';
                    // Payroll calc for E2E records
                    let costDisplay = '-';
                    let payrollDisplay = '-';
                    if (isE2E && 'totalSold' in item) {
                      if ('_type' in item && (item as any)._type !== 'sale') {
                        costDisplay = '-';
                        payrollDisplay = '-';
                      } else {
                        const revenue = item.grams * item.totalSold;
                        const cost = (item.originalCost ?? 0) * item.totalSold;
                        const payroll = (revenue - cost) / 2;
                        costDisplay = `$${cost.toFixed(2)}`;
                        payrollDisplay = `$${payroll.toFixed(2)}`;
                      }
                    }

                    return (
                      <TableRow key={item.id || index} className={isE2E ? 'bg-primary/[0.02]' : ''}>
                        <TableCell>
                          <div className="flex flex-col gap-1 items-start">
                            <Badge variant={item.type === 'sale' ? 'default' : 'secondary'}>
                              {item.type === 'sale' ? 'Sale' : 'Expense'}
                            </Badge>
                            {isE2E && (
                              <Badge variant="outline" className="text-[10px] h-4 bg-primary/5 border-primary/20 text-primary">E2E Sync</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {currentItem?.id === item.id ? (
                            <Input
                              type="date"
                              value={currentItem?.createdAt ? new Date(currentItem.createdAt).toISOString().split('T')[0] : ''}
                              onChange={(e) => {
                                if (currentItem) {
                                  setCurrentItem({
                                    ...currentItem,
                                    createdAt: new Date(e.target.value).toISOString()
                                  });
                                }
                              }}
                            />
                          ) : (
                            new Date(item.createdAt).toLocaleDateString()
                          )}
                        </TableCell>
                        <TableCell>
                          {currentItem?.id === item.id ? (
                            'candyName' in currentItem ? (
                              <Input
                                value={currentItem.candyName || ''}
                                onChange={(e) => {
                                  if (currentItem && 'candyName' in currentItem) {
                                    setCurrentItem({
                                      ...currentItem,
                                      candyName: e.target.value
                                    });
                                  }
                                }}
                              />
                            ) : (
                              <Input
                                value={currentItem.description || ''}
                                onChange={(e) => {
                                  if (currentItem && 'description' in currentItem) {
                                    setCurrentItem({
                                      ...currentItem,
                                      description: e.target.value
                                    });
                                  }
                                }}
                              />
                            )
                          ) : (
                            <span className="font-medium">{'candyName' in item ? item.candyName : item.description}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {currentItem?.id === item.id ? (
                            'totalSold' in currentItem ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={((currentItem.grams * currentItem.totalSold)).toFixed(2)}
                                readOnly
                                className="w-24"
                              />
                            ) : (
                              <Input
                                type="number"
                                step="0.01"
                                value={(currentItem.amount ?? 0).toFixed(2) || ''}
                                onChange={(e) => {
                                  if (currentItem && 'amount' in currentItem) {
                                    setCurrentItem({
                                      ...currentItem,
                                      amount: parseFloat(e.target.value) || 0
                                    });
                                  }
                                }}
                                className="w-24"
                              />
                            )
                          ) : (
                            <span className="font-semibold">
                              {'_type' in item && (item as any)._type !== 'sale'
                                ? `$${((item as any)._amount ?? 0).toFixed(2)}`
                                : 'totalSold' in item
                                  ? `$${(item.grams * item.totalSold).toFixed(2)}`
                                  : `$${(item.amount ?? 0).toFixed(2)}`
                              }
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right text-muted-foreground text-sm">
                          {costDisplay}
                        </TableCell>
                        <TableCell className="text-right">
                          {payrollDisplay !== '-' ? (
                            <span className="font-semibold text-violet-600 dark:text-violet-400">{payrollDisplay}</span>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          {currentItem?.id === item.id ? (
                            'category' in currentItem ? (
                              <Input
                                value={currentItem.category || ''}
                                onChange={(e) => {
                                  if (currentItem && 'category' in currentItem) {
                                    setCurrentItem({
                                      ...currentItem,
                                      category: e.target.value
                                    });
                                  }
                                }}
                                className="w-24"
                              />
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )
                          ) : (
                            'category' in item ? item.category : '-'
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex gap-1 justify-end">
                            {currentItem?.id === item.id ? (
                              <>
                                <Button size="sm" variant="default" onClick={saveEdit}>
                                  <Save className="h-4 w-4" />
                                </Button>
                                <Button size="sm" variant="outline" onClick={cancelEdit}>
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                {isE2E ? (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => setDeleteE2ERecord(item as E2ESaleRecord)}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <>
                                    <Button size="sm" variant="ghost" onClick={() => startEditing(index)}>
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <AlertDialog>
                                      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => deleteRow(index)}>
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </AlertDialog>
                                  </>
                                )}
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* E2E Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteE2ERecord} onOpenChange={(open) => { if (!open) setDeleteE2ERecord(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete E2E Sale Record?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this encrypted sale record from Firestore.
              {deleteE2ERecord && (
                <span className="block mt-2 font-mono text-xs bg-muted p-2 rounded">
                  {'_type' in deleteE2ERecord && deleteE2ERecord._type !== 'sale' ? (
                    `Type: ${deleteE2ERecord.candyName} — Amount: $${(deleteE2ERecord as any)._amount.toFixed(2)}`
                  ) : (
                    `Item: ${deleteE2ERecord.candyName} — Qty: ${deleteE2ERecord.totalSold} — Revenue: $${(deleteE2ERecord.grams * deleteE2ERecord.totalSold).toFixed(2)}`
                  )}
                </span>
              )}
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingE2E}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeletingE2E}
              onClick={handleDeleteE2E}
            >
              {isDeletingE2E && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default FinancesTab;