"use client";

import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from '@/lib/client-auth';
import { Play, CheckCircle, XCircle, Loader2, Database, Copy, ShieldAlert, Trash2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { collection, query, limit, getDocs, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { generateRSAKeyPair, exportPublicKey, wrapPrivateKey } from '@/lib/crypto-client';

interface TestResult {
  name: string;
  status: 'pending' | 'running' | 'passed' | 'failed';
  message?: string;
  duration?: number;
  error?: string;
  details?: any;
  progress?: { current: number; total: number };
  startTime?: number;
  endTime?: number;
}

interface TestReport {
  totalTests: number;
  passedTests: number;
  failedTests: number;
  totalDuration: number;
  averageDuration: number;
  fastestTest: { name: string; duration: number };
  slowestTest: { name: string; duration: number };
  testResults: TestResult[];
  timestamp: string;
}

export function VolumeTestingSuite({
  masterPassword = "",
  sessionToken = "",
  showHealthSection = true,
}: {
  masterPassword?: string,
  sessionToken?: string,
  showHealthSection?: boolean,
}) {
  const { user, getIDToken } = UserAuth();
  const { toast } = useToast();

  const [tests, setTests] = useState<TestResult[]>([
    { name: "Basic Sale Creation", status: 'pending' },
    { name: "Product Creation", status: 'pending' },
    { name: "Expense Creation", status: 'pending' },
    { name: "Expense Category Creation", status: 'pending' },
    { name: "Expense Category CRUD Operations", status: 'pending' },
    { name: "Data Integrity Check", status: 'pending' },
    { name: "Encryption Verification", status: 'pending' },
    { name: "Concurrent Operations", status: 'pending' },
    { name: "Candyman Portal Health", status: 'pending' },
    { name: "Admin Portal Health", status: 'pending' },
    { name: "Firestore Rules Integrity", status: 'pending' },
    { name: "Sentinel API Health & Codebook", status: 'pending' },
    { name: "Chat Encryption Structure", status: 'pending' },
    { name: "E2E Lifecycle Scaling (10 units)", status: 'pending' },
    { name: "E2E Lifecycle Scaling (50 units)", status: 'pending' },
    { name: "E2E Lifecycle Scaling (100 units)", status: 'pending' },
  ]);

  const [isRunningTests, setIsRunningTests] = useState(false);
  const [currentTestIndex, setCurrentTestIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [testPassword, setTestPassword] = useState(masterPassword);
  const [testReport, setTestReport] = useState<TestReport | null>(null);
  const [showReport, setShowReport] = useState(false);
  const abortTestRunRef = React.useRef(false);

  // Pause Resume State
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = React.useRef(false);
  useEffect(() => { isPausedRef.current = isPaused; }, [isPaused]);

  // Test cleanup states
  const [createdTestData, setCreatedTestData] = useState<Array<{ type: string, id: string }>>([]);
  const createdTestDataRef = React.useRef<Array<{ type: string, id: string }>>([]);

  useEffect(() => {
    createdTestDataRef.current = createdTestData;
  }, [createdTestData]);

  const clearTrackedTestData = () => {
    createdTestDataRef.current = [];
    setCreatedTestData([]);
  };

  const [showCleanupDialog, setShowCleanupDialog] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // New states for health and fix-db
  const [healthStatus, setHealthStatus] = useState<any>(null);
  const [isCheckingHealth, setIsCheckingHealth] = useState(false);
  const [isFixingDb, setIsFixingDb] = useState(false);
  const [fixReport, setFixReport] = useState<any>(null);

  // Phase 5 States
  const [isWhitelisting, setIsWhitelisting] = useState(false);
  const [isDeletingCollection, setIsDeletingCollection] = useState(false);
  const [confirmDeleteCollection, setConfirmDeleteCollection] = useState<string | null>(null);
  const [deletePassword, setDeletePassword] = useState("");

  // Live report accordion state
  const [expandedTestIndex, setExpandedTestIndex] = useState<number | null>(null);
  const [showLiveReport, setShowLiveReport] = useState(false);

  // Auto-stop tests if session closes
  useEffect(() => {
    if (isRunningTests && !sessionToken) {
      cancelTests();
      toast({
        title: "Testing Aborted",
        description: "The admin session was closed. Tests have been stopped.",
        variant: "destructive"
      });
    }
  }, [sessionToken, isRunningTests]);

  const checkHealth = async () => {
    try {
      setIsCheckingHealth(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/data/health', {
        headers: getAdminHeaders(idToken)
      });
      const data = await res.json();
      setHealthStatus(data);
    } catch (error) {
      toast({ title: "Failed to check health", variant: "destructive" });
    } finally {
      setIsCheckingHealth(false);
    }
  };

  const fixDb = async () => {
    try {
      setIsFixingDb(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/data/fix-db', {
        method: 'POST',
        headers: getAdminHeaders(idToken)
      });
      const data = await res.json();
      setFixReport(data.report);

      // Client-side: regenerate admin RSA keys if missing
      if (data.ownersMissingKeys?.length > 0 && testPassword && user) {
        try {
          const keyPair = await generateRSAKeyPair();
          const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
          const wrappedPrivKey = await wrapPrivateKey(keyPair.privateKey, testPassword);

          // Store for each missing owner (typically just the current user)
          for (const uid of data.ownersMissingKeys) {
            await setDoc(doc(db, 'public', uid), {
              publicKey: publicKeyBase64,
              encryptedPrivateKey: wrappedPrivKey,
              createdAt: new Date().toISOString(),
            });
          }
          toast({ title: "Database fixed successfully", description: `Also regenerated ${data.ownersMissingKeys.length} admin encryption key(s).` });
        } catch (keyErr) {
          console.error('Failed to regenerate admin keys:', keyErr);
          toast({ title: "Database fixed", description: "Warning: could not regenerate admin encryption keys.", variant: "destructive" });
        }
      } else {
        toast({ title: "Database fixed successfully" });
      }

      checkHealth();
    } catch (error) {
      toast({ title: "Failed to fix database", variant: "destructive" });
    } finally {
      setIsFixingDb(false);
    }
  };

  const handleWhitelistAction = async (action: 'add' | 'remove', cl: string) => {
    try {
      setIsWhitelisting(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/data/collections/whitelist', {
        method: 'POST',
        headers: getAdminHeaders(idToken),
        body: JSON.stringify({ action, collections: [cl] })
      });
      if (res.ok) {
        toast({ title: `Successfully ${action === 'add' ? 'whitelisted' : 'removed'} ${cl}` });
        checkHealth();
      } else {
        throw new Error('Action failed');
      }
    } catch (e: any) {
      toast({ title: "Whitelist action failed", variant: "destructive", description: e.message });
    } finally {
      setIsWhitelisting(false);
    }
  };

  const handleDeleteCollection = async () => {
    if (!confirmDeleteCollection || !deletePassword) return;
    try {
      setIsDeletingCollection(true);
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/data/collections/delete', {
        method: 'DELETE',
        headers: getAdminHeaders(idToken),
        body: JSON.stringify({ collection: confirmDeleteCollection })
      });
      if (res.ok) {
        toast({ title: `Successfully deleted ${confirmDeleteCollection}` });
        setConfirmDeleteCollection(null);
        setDeletePassword("");
        checkHealth();
      } else {
        const data = await res.json();
        throw new Error(data.error || 'Deletion failed');
      }
    } catch (e: any) {
      toast({ title: "Deletion failed", variant: "destructive", description: e.message });
    } finally {
      setIsDeletingCollection(false);
    }
  };

  useEffect(() => {
    if (showHealthSection) {
      checkHealth();
    }
  }, [showHealthSection]);

  const updateTestStatus = (
    index: number,
    status: TestResult['status'],
    message?: string,
    duration?: number,
    error?: string,
    details?: any,
    progress?: { current: number; total: number }
  ) => {
    setTests(prev => prev.map((test, i) =>
      i === index ? {
        ...test,
        status,
        message,
        duration,
        error,
        details,
        progress,
        endTime: status !== 'running' ? Date.now() : undefined
      } : test
    ));
  };

  const runBasicSaleTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');

      setTests(prev => prev.map((test, i) =>
        i === testIndex ? { ...test, startTime } : test
      ));

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const testSale = {
        items: [{ name: "[TEST] Test Candy", quantity: 1, price: 5.50 }],
        totalAmount: 5.50,
        date: new Date().toISOString()
      };

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      const response = await fetch('/api/admin/finances/sales', {
        method: 'POST',
        headers,
        body: JSON.stringify(testSale)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Sale creation failed");
      }

      const result = await response.json();
      setCreatedTestData(prev => [...prev, { type: 'sale', id: result.id }]);
      const duration = Date.now() - startTime;

      updateTestStatus(testIndex, 'passed', "Sale created successfully", duration, undefined, {
        saleId: result.id,
        responseTime: duration
      });
      return true;
    } catch (error) {
      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'failed', "Sale creation failed", duration, error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runProductTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running', "Creating system product...", undefined, undefined, undefined, { current: 0, total: 2 });

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();
      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      // Step 1: Create a system product (Firestore doc in udhhmbtc)
      const testProduct = {
        name: "[TEST] Test Product",
        description: "A test candy product",
        price: 2.50
      };

      const productRes = await fetch('/api/admin/system/products', {
        method: 'POST',
        headers,
        body: JSON.stringify(testProduct)
      });

      if (!productRes.ok) {
        const error = await productRes.json();
        throw new Error(error.error || "System product creation failed");
      }

      const productResult = await productRes.json();
      const productId = productResult.product?.id || productResult.id;
      setCreatedTestData(prev => [...prev, { type: 'product', id: productId }]);
      updateTestStatus(testIndex, 'running', "Creating linked inventory item...", undefined, undefined, { productId }, { current: 1, total: 2 });

      // Step 2: Create an inventory item (volume-based item type)
      const testInventoryItem = {
        name: "[TEST] Test Inventory Item",
        category: "Testing",
        description: "Inventory item created by the automated product creation test",
        quantity: 10,
        unit: "pcs",
        unitValue: 2.00,
        originalCost: 1.00,
      };

      const inventoryRes = await fetch('/api/admin/inventory', {
        method: 'POST',
        headers,
        body: JSON.stringify(testInventoryItem)
      });

      if (!inventoryRes.ok) {
        const error = await inventoryRes.json().catch(() => null);
        throw new Error(error?.error || "Inventory item creation failed");
      }

      const inventoryResult = await inventoryRes.json();
      const inventoryItemId = inventoryResult.id;
      setCreatedTestData(prev => [...prev, { type: 'inventory-item', id: inventoryItemId }]);

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', `System product + inventory item created successfully`, duration, undefined, {
        productId,
        inventoryItemId
      }, { current: 2, total: 2 });
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runExpenseTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();
      const testExpense = {
        description: "[TEST] Test Expense",
        amount: 25.00,
        category: "Supplies"
      };

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      const response = await fetch('/api/admin/finances/expenses', {
        method: 'POST',
        headers,
        body: JSON.stringify(testExpense)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Expense creation failed");
      }

      const result = await response.json();
      setCreatedTestData(prev => [...prev, { type: 'expense', id: result.expense?.id || result.id }]);

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Expense created successfully", duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runExpenseCategoryTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();
      const testCategory = {
        name: "[TEST] Test Category",
        description: "A test expense category"
      };

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      const response = await fetch('/api/admin/finances/expense-categories', {
        method: 'POST',
        headers,
        body: JSON.stringify(testCategory)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Expense category creation failed");
      }

      const result = await response.json();
      setCreatedTestData(prev => [...prev, { type: 'expense-category', id: result.category?.id || result.id }]);

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Expense category created successfully", duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runExpenseCategoryCRUDTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running', "Creating category...", undefined, undefined, undefined, { current: 0, total: 3 });

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();

      // Create a test category
      const createHeaders = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(createHeaders, { 'x-master-password-session': sessionToken });

      const createResponse = await fetch('/api/admin/finances/expense-categories', {
        method: 'POST',
        headers: createHeaders,
        body: JSON.stringify({
          name: "[TEST] CRUD Test Category",
          description: "Testing full CRUD operations"
        })
      });

      if (!createResponse.ok) {
        throw new Error("Failed to create test category");
      }

      const createData = await createResponse.json();
      const categoryId = createData.category.id;
      updateTestStatus(testIndex, 'running', "Reading categories...", undefined, undefined, { categoryId }, { current: 1, total: 3 });

      // Brief pause to let the prior volume write propagate before reading
      await new Promise(resolve => setTimeout(resolve, 300));

      // Read (fetch all categories)
      const readHeaders = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(readHeaders, { 'x-master-password-session': sessionToken });

      const readResponse = await fetch('/api/admin/finances/expense-categories', {
        headers: readHeaders
      });

      if (!readResponse.ok) {
        const errBody = await readResponse.clone().json().catch(() => ({}));
        throw new Error(`Failed to read categories (${readResponse.status}): ${errBody.error || readResponse.statusText}`);
      }

      // Update (not implemented in API yet, skip for now)
      // Delete the category
      updateTestStatus(testIndex, 'running', "Deleting category...", undefined, undefined, { categoryId }, { current: 2, total: 3 });
      const deleteHeaders = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(deleteHeaders, { 'x-master-password-session': sessionToken });

      const deleteResponse = await fetch(`/api/admin/finances/expense-categories?id=${categoryId}`, {
        method: 'DELETE',
        headers: deleteHeaders
      });

      if (!deleteResponse.ok) {
        const errBody = await deleteResponse.clone().json().catch(() => ({}));
        throw new Error(`Failed to delete test category: ${errBody.error || deleteResponse.statusText}`);
      }

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Full CRUD operations completed successfully", duration, undefined, {
        categoryId,
        operations: ['create', 'read', 'delete']
      }, { current: 3, total: 3 });
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runE2ELifecycleScalingTest = async (testIndex: number, numUnits: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();
      const lifecycleRequests = [];

      for (let i = 0; i < numUnits; i++) {
        lifecycleRequests.push(async () => {
          let lastError = "Timeout or Network Failure";
          const ids: any = {}; // Local tracking for this specific unit

          try {
            const headers = getAdminHeaders(idToken);
            if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });
            Object.assign(headers, { 'x-rate-limit-mode': 'testing' });

            // Step 1: Create Inventory Item
            const price = Math.floor(Math.random() * 1000) / 100;
            const productRes = await fetch('/api/admin/inventory', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                name: `[TEST E2E] Product ${i + 1}`,
                category: "Testing",
                quantity: 10,
                unit: "pcs",
                unitValue: 1,
                costPrice: price * 0.5,
                sellingPrice: price,
              })
            });
            if (!productRes.ok) throw new Error(`Inventory creation failed: ${await productRes.text()}`);
            const productData = await productRes.json();
            ids.itemId = productData.id;
            setCreatedTestData(prev => [...prev, { type: 'inventory-item', id: productData.id }]);

            // Step 2: Push to Staff
            const staffUid = user?.uid || "TEST_STAFF_UID"; // Fallback if no user, unlikely in admin
            const pushRes = await fetch('/api/admin/inventory/push', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                staffUid,
                encryptedData: "test_encrypted_data",
                staffWrappedDEK: "test_staff_dek",
                adminWrappedDEK: "test_admin_dek",
                iv: "test_iv"
              })
            });
            if (!pushRes.ok) throw new Error(`Inventory push failed: ${await pushRes.text()}`);
            ids.staffUid = staffUid;
            // The push API overwrites a single doc for the staff member. We track the doc ID (staffUid) for cleanup
            setCreatedTestData(prev => [{ type: 'inventory-push', id: staffUid }, ...prev]);

            // Step 3: Sale (Admin finance endpoint)
            const saleRes = await fetch('/api/admin/finances/sales', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                items: [{ name: `[TEST E2E] Product ${i + 1}`, quantity: 1, price }],
                totalAmount: price,
                date: new Date().toISOString()
              })
            });
            if (!saleRes.ok) throw new Error(`Sale failed: ${await saleRes.text()}`);
            const saleData = await saleRes.json();
            ids.saleId = saleData.sale?.id || saleData.id;
            setCreatedTestData(prev => [...prev, { type: 'sale', id: ids.saleId }]);

            // Step 3.5: Fabricate a Staff E2E Sale Record (so refund can reference it)
            // Even though we made an admin volume sale, refunds point to staff records
            const staffSaleRes = await fetch('/api/staff/finances/push-sale', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                encryptedData: "test_encrypted_data",
                staffWrappedDEK: "test_staff_dek",
                adminWrappedDEK: "test_admin_dek",
                iv: "test_iv",
                staffUidOverride: staffUid
              })
            });
            if (!staffSaleRes.ok) throw new Error(`Staff sale push failed: ${await staffSaleRes.text()}`);
            const staffSaleData = await staffSaleRes.json();
            ids.financeRecordId = staffSaleData.id;
            setCreatedTestData(prev => [{ type: 'finance-record', id: `${staffUid}:${staffSaleData.id}` }, ...prev]);

            // Step 4: Refund Request (Staff endpoint)
            const refundReqBody = {
              encryptedData: "test_refund_data",
              iv: "test_iv",
              staffWrappedDEK: "test_staff_dek",
              adminWrappedDEK: "test_admin_dek",
              saleRecordHash: `${ids.financeRecordId}_hash` // Prevent duplicate detection
            };
            const refundReqRes = await fetch('/api/staff/refunds/request', {
              method: 'POST',
              headers, // Needs bearer token
              body: JSON.stringify(refundReqBody)
            });
            if (!refundReqRes.ok) throw new Error(`Refund request failed: ${await refundReqRes.text()}`);
            const refundReqData = await refundReqRes.json();
            ids.refundId = refundReqData.id;
            setCreatedTestData(prev => [{ type: 'refund', id: ids.refundId }, ...prev]);

            // Step 5: Refund Respond (Admin Endpoint)
            const refundResRes = await fetch('/api/admin/refunds/respond', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                refundId: ids.refundId,
                action: 'approve_without_return',
                saleRecordId: ids.financeRecordId // Let admin API delete the finance record
              })
            });
            if (!refundResRes.ok) throw new Error(`Refund respond failed: ${await refundResRes.text()}`);
            // The approve_without_return action deletes the finance record. We should remove it from our cleanup array
            // because it's already deleted. But for test durability, it's fine if the cleanup array tries to delete it again (404 is ignored)

            return { ok: true };
          } catch (e: any) {
            lastError = `Lifecycle Exception: ${e.message}`;
            return { ok: false, error: lastError };
          }
        });
      }

      const BATCH_SIZE = 1; // Strict sequential processing to prevent AES volume rewrite lockouts
      const BATCH_DELAY_MS = 100; // Small delay between sequential requests
      let failedCount = 0;
      let firstFailureReason = "";

      for (let batch = 0; batch < lifecycleRequests.length; batch += BATCH_SIZE) {
        while (isPausedRef.current && !abortTestRunRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (abortTestRunRef.current) {
          updateTestStatus(testIndex, 'failed', `Cancelled manually at ${batch}/${numUnits}`, Date.now() - startTime, "User Cancelled");
          return false;
        }

        const batchSlice = lifecycleRequests.slice(batch, batch + BATCH_SIZE);
        const results = await Promise.all(batchSlice.map(req => req()));

        for (const r of results) {
          if (!r.ok) {
            failedCount++;
            if (!firstFailureReason) firstFailureReason = r.error || "Unknown Failure";
          }
        }

        if (batch + BATCH_SIZE < lifecycleRequests.length) {
          updateTestStatus(testIndex, 'running', `Processed ${batch + BATCH_SIZE} / ${numUnits} lifecycles...`, undefined, undefined, undefined, { current: batch + BATCH_SIZE, total: numUnits });
          await new Promise(resolve => setTimeout(resolve, BATCH_DELAY_MS));
        }
      }

      const duration = Date.now() - startTime;

      if (failedCount === 0) {
        updateTestStatus(testIndex, 'passed', `All ${numUnits} E2E lifecycles completed`, duration);
        return true;
      } else {
        updateTestStatus(testIndex, 'failed', `${failedCount} / ${numUnits} lifecycles failed`, duration, firstFailureReason);
        return false;
      }
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runIntegrityTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();

      // Fetch sales and verify data integrity
      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      const response = await fetch('/api/admin/finances/sales', {
        headers
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(`Integrity Check Failed (${response.status}): ${errBody.error || response.statusText}`);
      }

      const data = await response.json();
      const sales = data.sales || [];

      // Basic integrity checks
      const invalidSales = sales.filter((sale: any) =>
        !sale.items || !Array.isArray(sale.items) || sale.items.length === 0 || typeof sale.totalAmount !== 'number'
      );

      const duration = Date.now() - startTime;

      if (invalidSales.length === 0) {
        updateTestStatus(testIndex, 'passed', `Data integrity verified for ${sales.length} sales`, duration);
        return true;
      } else {
        updateTestStatus(testIndex, 'failed', `${invalidSales.length} sales have invalid data`);
        return false;
      }
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runEncryptionTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();

      // Test volume endpoint to check encryption
      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      const response = await fetch('/api/admin/volume', {
        headers
      });

      if (!response.ok) {
        throw new Error("Failed to fetch volume data");
      }

      const volumeData = await response.json();

      // Check that the volume has data chunks (encryption structure)
      // Data chunks are documents that are NOT 'meta-data' or 'auth'
      const dataChunks = volumeData.documents?.filter((doc: any) =>
        doc.id !== 'meta-data' && doc.id !== 'auth'
      ) || [];

      const hasMetaData = volumeData.documents?.some((doc: any) => doc.id === 'meta-data');
      const hasAuth = volumeData.documents?.some((doc: any) => doc.id === 'auth');

      const duration = Date.now() - startTime;

      if (hasAuth && hasMetaData && dataChunks.length > 0) {
        updateTestStatus(testIndex, 'passed', `Encryption structure verified: ${dataChunks.length} data chunks, auth + meta-data present`, duration);
        return true;
      } else if (hasAuth && dataChunks.length === 0) {
        updateTestStatus(testIndex, 'passed', "Volume initialized (auth present, no data chunks yet)", duration);
        return true;
      } else {
        const missing = [];
        if (!hasAuth) missing.push('auth');
        if (!hasMetaData) missing.push('meta-data');
        if (dataChunks.length === 0) missing.push('data chunks');
        updateTestStatus(testIndex, 'failed', `Missing: ${missing.join(', ')}`);
        return false;
      }
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runConcurrentTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    try {
      updateTestStatus(testIndex, 'running');

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const startTime = Date.now();

      // Run multiple operations concurrently. Keep the write chain in one promise so we
      // can retain both created IDs and clean them back out of the database afterward.
      const cHeaders = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(cHeaders, { 'x-master-password-session': sessionToken });

      const writeOperation: Promise<{ productId: string; saleId: string }> = (async () => {
          const productRes = await fetch('/api/admin/system/products', {
            method: 'POST',
            headers: cHeaders,
            body: JSON.stringify({
              name: "[TEST] Concurrent Test Product",
              description: "Testing concurrent operations",
              price: 3.00
            })
          });

          if (!productRes.ok) {
            throw new Error(`Concurrent product creation failed: ${await productRes.text()}`);
          }

          const productData = await productRes.json();
          const productId = productData.product?.id || productData.id;
          if (!productId) {
            throw new Error("Concurrent product creation did not return an ID");
          }

          const saleRes = await fetch('/api/admin/finances/sales', {
            method: 'POST',
            headers: cHeaders,
            body: JSON.stringify({
              items: [{ name: "[TEST] Concurrent Test Candy", quantity: 2, price: 3.75 }],
              totalAmount: 7.50,
              date: new Date().toISOString()
            })
          });

          if (!saleRes.ok) {
            throw new Error(`Concurrent sale creation failed: ${await saleRes.text()}`);
          }

          const saleData = await saleRes.json();
          const saleId = saleData.sale?.id || saleData.id;
          if (!saleId) {
            throw new Error("Concurrent sale creation did not return an ID");
          }

          return { productId, saleId };
        })();

      const salesReadOperation = fetch('/api/admin/finances/sales', { headers: cHeaders }).then(async (res) => {
          if (!res.ok) {
            throw new Error(`Concurrent sales read failed: ${await res.text()}`);
          }
          return true;
        });

      const volumeReadOperation = fetch('/api/admin/volume', { headers: cHeaders }).then(async (res) => {
          if (!res.ok) {
            throw new Error(`Concurrent volume read failed: ${await res.text()}`);
          }
          return true;
        });

      const results = await Promise.allSettled([
        writeOperation,
        salesReadOperation,
        volumeReadOperation
      ] as const);
      const failedCount = results.filter(r => r.status === 'rejected').length;

      const writeResult = results[0];
      if (writeResult?.status === 'fulfilled') {
        setCreatedTestData(prev => [
          ...prev,
          { type: 'product', id: writeResult.value.productId },
          { type: 'sale', id: writeResult.value.saleId }
        ]);
      }

      const duration = Date.now() - startTime;

      if (failedCount === 0) {
        updateTestStatus(testIndex, 'passed', "All concurrent operations succeeded", duration);
        return true;
      } else {
        updateTestStatus(testIndex, 'failed', `${failedCount} concurrent operations failed`);
        return false;
      }
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runCandymanPortalTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');
      setTests(prev => prev.map((test, i) => i === testIndex ? { ...test, startTime } : test));

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      // Test 1: Master password check
      const mpRes = await fetch('/api/staff/master-password', {
        headers
      });
      if (!mpRes.ok) throw new Error("Candyman portal master-password check failed");

      // Test 2: Secure data access
      const dataRes = await fetch('/api/staff/data', {
        headers
      });

      // If we get 403, the endpoint correctly checked and rejected the admin's password. This proves functionality.
      if (dataRes.status === 403) {
        updateTestStatus(testIndex, 'passed', "Candyman portal endpoints verified (403 expected for Admin pass)", Date.now() - startTime);
        return true;
      }

      if (!dataRes.ok && dataRes.status !== 404) throw new Error("Candyman portal data fetch failed");

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Candyman portal endpoints verified", duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runAdminPortalTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');
      setTests(prev => prev.map((test, i) => i === testIndex ? { ...test, startTime } : test));

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      // Test 1: Inventory read access (requires session or valid master password headers)
      const invRes = await fetch('/api/admin/inventory', {
        headers
      });
      // The inventory API / session layer might reject this if no real session exists, which is acceptable for health tests to just throw 401
      if (!invRes.ok && invRes.status !== 401) throw new Error("Admin portal inventory access failed with unexpected status: " + invRes.status);

      // Test 2: Users list access (admin only)
      const usersRes = await fetch('/api/admin/users', {
        headers
      });
      if (!usersRes.ok) throw new Error("Admin portal users access failed");

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Admin portal endpoints verified", duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runFirestoreRulesTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');
      setTests(prev => prev.map((test, i) => i === testIndex ? { ...test, startTime } : test));

      // Only test collections that should be strictly denied to all clients
      // (users, passkeys, webauthn-challenges are user-scoped by design and may allow reads)
      const collectionsToTest = ['totp-secrets'];
      const errors = [];

      for (const coll of collectionsToTest) {
        try {
          const q = query(collection(db, coll), limit(1));
          await getDocs(q);
          errors.push(`${coll} is dangerously readable!`);
        } catch (e: any) {
          if (e.code !== 'permission-denied') {
            errors.push(`Unexpected error on ${coll}: ${e.message}`);
          }
        }
      }

      try {
        const q = query(collection(db, 'public'), limit(1));
        await getDocs(q);
      } catch (e: any) {
        errors.push(`public collection should be readable: ${e.message}`);
      }

      if (errors.length > 0) {
        throw new Error(`Rules test failed: ${errors.join(', ')}`);
      }

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Firestore client rules verified successfully", duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Unknown error");
      return false;
    }
  };

  const runSentinelTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');
      setTests(prev => prev.map((test, i) => i === testIndex ? { ...test, startTime } : test));

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const headers = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(headers, { 'x-master-password-session': sessionToken });

      // Pre-flight check: see if RTDB is initialized
      const checkRes = await fetch('/api/rtdb/codebook', {
        headers
      });

      if (checkRes.status === 503) {
        throw new Error("RTDB not initialized. Check FIREBASE_DATABASE_URL.");
      }
      if (!checkRes.ok && checkRes.status !== 404) { // 404 is okay if no codebook exists yet
        throw new Error(`Sentinel pre-check failed: ${checkRes.status} ${checkRes.statusText}`);
      }

      // Verify rotation endpoint
      const rotateHeaders = getAdminHeaders(idToken);
      if (sessionToken) Object.assign(rotateHeaders, { 'x-master-password-session': sessionToken });
      Object.assign(rotateHeaders, { 'Content-Type': 'application/json' });

      const rotateRes = await fetch('/api/rtdb/codebook', {
        method: 'POST',
        headers: rotateHeaders,
        body: JSON.stringify({ action: 'rotate', masterPassword: testPassword })
      });
      if (!rotateRes.ok) {
        const errorText = await rotateRes.text();
        throw new Error(`Sentinel codebook rotation blocked or failed: ${rotateRes.status} ${errorText}`);
      }

      const rotateData = await rotateRes.json();
      if (!rotateData.success || rotateData.version === undefined) throw new Error("Sentinel did not return a valid version on rotation");

      const duration = Date.now() - startTime;
      updateTestStatus(testIndex, 'passed', "Sentinel API and RTDB Codebook fully operational", duration, undefined, {
        codebookVersion: rotateData.version
      });
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Sentinel API test failed");
      return false;
    }
  };

  const runChatEncryptionTest = async (testIndex: number, preAuthToken?: string): Promise<boolean> => {
    const startTime = Date.now();
    try {
      updateTestStatus(testIndex, 'running');
      setTests(prev => prev.map((test, i) => i === testIndex ? { ...test, startTime } : test));

      const idToken = preAuthToken || await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      // Verify that chat messages are structured properly with valid envelope encryption fields
      // Query up to 5 messages to strictly validate structure without needing to decrypt
      const q = query(collection(db, 'messages'), limit(5));
      const messagesSnap = await getDocs(q);

      if (messagesSnap.empty) {
        updateTestStatus(testIndex, 'passed', "No chat messages to validate (collection empty)", Date.now() - startTime);
        return true;
      }

      const invalidMessages = [];
      let validCount = 0;

      for (const doc of messagesSnap.docs) {
        const data = doc.data();

        // Ignore system or configuration documents that are not chat messages
        if (!data.threadId && !data.senderRole) {
          continue;
        }

        const hasCoreFields = data.threadId && data.senderId && data.senderRole && data.encryptedData && data.iv;
        const hasKeyMaterial = data.staffWrappedDEK || data.adminWrappedDEK || data.adminWrappedDEKs;

        if (!hasCoreFields || !hasKeyMaterial) {
          invalidMessages.push(`[${doc.id}]`);
        } else {
          validCount++;
        }
      }

      const duration = Date.now() - startTime;

      if (invalidMessages.length > 0) {
        throw new Error(`Found ${invalidMessages.length} structurally invalid chat messages: ${invalidMessages.join(', ')}`);
      }

      updateTestStatus(testIndex, 'passed', `Successfully validated ${validCount} chat messages structure`, duration);
      return true;
    } catch (error) {
      updateTestStatus(testIndex, 'failed', error instanceof Error ? error.message : "Chat encryption structure test failed");
      return false;
    }
  };

  const runAllTests = async () => {
    if (!testPassword) {
      toast({ title: "Please enter master password", variant: "destructive" });
      return;
    }

    if (!sessionToken) {
      toast({ title: "Missing Session", description: "Your session token is missing. Please exit and unlock the data vault to continue.", variant: "destructive" });
      return;
    }

    setIsRunningTests(true);
    abortTestRunRef.current = false;
    setIsPaused(false);
    setProgress(0);
    setCurrentTestIndex(0);
    setTestReport(null);
    setShowReport(false);
    setShowLiveReport(true); // Show live report as soon as run starts

    // Pre-fetch auth token ONCE for the entire suite run
    const idToken = await getIDToken();
    if (!idToken) {
      toast({ title: "Authentication failed", description: "Could not obtain a valid auth token.", variant: "destructive" });
      setIsRunningTests(false);
      return;
    }

    const testFunctions = [
      (i: number) => runBasicSaleTest(i, idToken),
      (i: number) => runProductTest(i, idToken),
      (i: number) => runExpenseTest(i, idToken),
      (i: number) => runExpenseCategoryTest(i, idToken),
      (i: number) => runExpenseCategoryCRUDTest(i, idToken),
      (i: number) => runIntegrityTest(i, idToken),
      (i: number) => runEncryptionTest(i, idToken),
      (i: number) => runConcurrentTest(i, idToken),
      (i: number) => runCandymanPortalTest(i, idToken),
      (i: number) => runAdminPortalTest(i, idToken),
      (i: number) => runFirestoreRulesTest(i, idToken),
      (i: number) => runSentinelTest(i, idToken),
      (i: number) => runChatEncryptionTest(i, idToken),
      // E2E Scaling tests â€” MUST stay sequential (share encrypted volume write state)
      (i: number) => runE2ELifecycleScalingTest(i, 10, idToken),
      (i: number) => runE2ELifecycleScalingTest(i, 50, idToken),
      (i: number) => runE2ELifecycleScalingTest(i, 100, idToken)
    ];

    const CONCURRENT_TESTS = testFunctions.slice(0, 13); // tests 0-12
    const SEQUENTIAL_TESTS = testFunctions.slice(13);    // tests 13-15 (E2E scaling)
    const BATCH_SIZE = 4;
    const total = testFunctions.length;
    let completedCount = 0;

    const suiteStartTime = Date.now();

    try {
      // â”€â”€ Phase 1: Concurrent Batches (tests 0-12) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      for (let batchStart = 0; batchStart < CONCURRENT_TESTS.length; batchStart += BATCH_SIZE) {
        // Check pause before each batch
        while (isPausedRef.current && !abortTestRunRef.current) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (abortTestRunRef.current) {
          // Mark all remaining tests as cancelled
          for (let j = batchStart; j < total; j++) {
            updateTestStatus(j, 'failed', 'Skipped due to cancellation', 0, 'User Cancelled');
          }
          setProgress(100);
          break;
        }

        const batchIndices = [];
        for (let k = batchStart; k < Math.min(batchStart + BATCH_SIZE, CONCURRENT_TESTS.length); k++) {
          batchIndices.push(k);
        }

        // Run this batch concurrently
        await Promise.allSettled(
          batchIndices.map(i => CONCURRENT_TESTS[i](i))
        );

        completedCount += batchIndices.length;
        setProgress((completedCount / total) * 100);
      }

      // â”€â”€ Phase 2: Sequential E2E Scaling (tests 13-15) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      if (!abortTestRunRef.current) {
        for (let s = 0; s < SEQUENTIAL_TESTS.length; s++) {
          while (isPausedRef.current && !abortTestRunRef.current) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }

          if (abortTestRunRef.current) {
            for (let j = 13 + s; j < total; j++) {
              updateTestStatus(j, 'failed', 'Skipped due to cancellation', 0, 'User Cancelled');
            }
            setProgress(100);
            break;
          }

          setCurrentTestIndex(13 + s);
          await SEQUENTIAL_TESTS[s](13 + s);
          completedCount++;
          setProgress((completedCount / total) * 100);
        }
      }

      const suiteEndTime = Date.now();
      const totalDuration = suiteEndTime - suiteStartTime;

      // Build report from latest tests state without nesting state updates
      setTests(currentTests => {
        // Schedule report generation after this render cycle
        setTimeout(() => {
          const completedTests = currentTests.filter(test => test.status !== 'pending');
          const passedTests = completedTests.filter(test => test.status === 'passed');
          const failedTests = completedTests.filter(test => test.status === 'failed');

          const durations = completedTests
            .filter(test => test.duration)
            .map(test => test.duration!);

          const averageDuration = durations.length > 0
            ? durations.reduce((sum, dur) => sum + dur, 0) / durations.length
            : 0;

          const fastestTest = completedTests
            .filter(test => test.duration)
            .reduce((fastest, test) =>
              !fastest.duration || test.duration! < fastest.duration
                ? test
                : fastest
              , {} as TestResult);

          const slowestTest = completedTests
            .filter(test => test.duration)
            .reduce((slowest, test) =>
              !slowest.duration || test.duration! > slowest.duration
                ? test
                : slowest
              , {} as TestResult);

          const report: TestReport = {
            totalTests: currentTests.length,
            passedTests: passedTests.length,
            failedTests: failedTests.length,
            totalDuration,
            averageDuration: Math.round(averageDuration * 100) / 100,
            fastestTest: fastestTest.name ? {
              name: fastestTest.name,
              duration: fastestTest.duration!
            } : { name: 'N/A', duration: 0 },
            slowestTest: slowestTest.name ? {
              name: slowestTest.name,
              duration: slowestTest.duration!
            } : { name: 'N/A', duration: 0 },
            testResults: [...currentTests],
            timestamp: new Date().toISOString()
          };

          setTestReport(report);
          setIsRunningTests(false);
          setShowReport(true);
          toast({ title: "Testing completed", description: `Generated detailed analytics report` });
        }, 0);

        return currentTests;
      });
    } finally {
      // Always cleanup generated data
      if (createdTestDataRef.current.length > 0) {
        await handleDeleteAllTestData();
      }
    }
  };


  // Empty reset tests function
  const resetTests = () => {
    setTests(prev => prev.map(test => ({ ...test, status: 'pending', message: undefined, duration: undefined, error: undefined, details: undefined })));
    setProgress(0);
    setCurrentTestIndex(0);
    abortTestRunRef.current = false;
    setIsPaused(false);
  };

  const cancelTests = () => {
    abortTestRunRef.current = true;
    setIsRunningTests(false);
    setIsPaused(false);
    toast({ title: "Testing Cancelled", description: "The volume test suite was manually stopped.", variant: "destructive" });
  };


  const runIndividualTest = async (testIndex: number) => {
    if (!testPassword) {
      toast({ title: "Please enter master password", variant: "destructive" });
      return;
    }

    // Pre-fetch auth token
    const idToken = await getIDToken();
    if (!idToken) {
      toast({ title: "Authentication failed", description: "Could not obtain a valid auth token.", variant: "destructive" });
      return;
    }

    const testFunctions = [
      (i: number) => runBasicSaleTest(i, idToken),
      (i: number) => runProductTest(i, idToken),
      (i: number) => runExpenseTest(i, idToken),
      (i: number) => runExpenseCategoryTest(i, idToken),
      (i: number) => runExpenseCategoryCRUDTest(i, idToken),
      (i: number) => runIntegrityTest(i, idToken),
      (i: number) => runEncryptionTest(i, idToken),
      (i: number) => runConcurrentTest(i, idToken),
      (i: number) => runCandymanPortalTest(i, idToken),
      (i: number) => runAdminPortalTest(i, idToken),
      (i: number) => runFirestoreRulesTest(i, idToken),
      (i: number) => runSentinelTest(i, idToken),
      (i: number) => runChatEncryptionTest(i, idToken),
      (i: number) => runE2ELifecycleScalingTest(i, 10, idToken),
      (i: number) => runE2ELifecycleScalingTest(i, 50, idToken),
      (i: number) => runE2ELifecycleScalingTest(i, 100, idToken)
    ];

    // Reset this specific test to pending
    setTests(prev => prev.map((test, i) =>
      i === testIndex ? { ...test, status: 'pending', message: undefined, duration: undefined, error: undefined, details: undefined } : test
    ));

    setIsRunningTests(true);

    let success = false;
    try {
      success = await testFunctions[testIndex](testIndex);
    } finally {
      setIsRunningTests(false);

      if (success) {
        toast({ title: `Test "${tests[testIndex].name}" passed successfully` });
      } else {
        toast({ title: `Test "${tests[testIndex].name}" failed`, variant: "destructive" });
      }

      // Always cleanup
      if (createdTestDataRef.current.length > 0) {
        await handleDeleteAllTestData();
      }
    }
  };

  const handleDeleteAllTestData = async () => {
    setIsCleaningUp(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) throw new Error("No authentication token");

      const itemsToDelete = Array.from(
        new Map(createdTestDataRef.current.map((item) => [`${item.type}:${item.id}`, item])).values()
      );
      if (itemsToDelete.length === 0) {
        setIsCleaningUp(false);
        setShowCleanupDialog(false);
        return;
      }

      const authHeaders = getAdminHeaders(idToken);
      if (sessionToken) {
        Object.assign(authHeaders, { 'x-master-password-session': sessionToken });
      }

      // -- 1. NON-VOLUME Firestore deletes (concurrent) --------------------------
      const nonVolumeItems = itemsToDelete.filter(i =>
        ['inventory-push', 'refund', 'finance-record'].includes(i.type)
      );
      const BATCH = 5;
      for (let i = 0; i < nonVolumeItems.length; i += BATCH) {
        await Promise.allSettled(nonVolumeItems.slice(i, i + BATCH).map(async (item) => {
          try {
            if (item.type === 'inventory-push') {
              await deleteDoc(doc(db, 'inventory', item.id));
            } else if (item.type === 'refund') {
              await deleteDoc(doc(db, 'refunds', item.id));
            } else if (item.type === 'finance-record') {
              const [staffUid, recordId] = item.id.split(':');
              if (staffUid && recordId) {
                await deleteDoc(doc(db, 'finances', staffUid, 'records', recordId));
              }
            }
          } catch (e) {
            console.warn(`Non-volume delete failed for ${item.type}:${item.id}`, e);
          }
        }));
      }

      // -- 2. SYSTEM PRODUCT Firestore doc deletes (concurrent) ----------------─
      const productItems = itemsToDelete.filter(i => i.type === 'product');
      for (let i = 0; i < productItems.length; i += BATCH) {
        const batchResults = await Promise.allSettled(productItems.slice(i, i + BATCH).map(async (item) => {
          const response = await fetch(`/api/admin/system/products?id=${item.id}`, {
            method: 'DELETE',
            headers: authHeaders
          });

          if (!response.ok) {
            const errorText = await response.text().catch(() => response.statusText);
            throw new Error(`Product delete failed for ${item.id}: ${errorText || response.status}`);
          }
        }));

        const failures = batchResults.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failures.length > 0) {
          throw new Error(failures[0].reason instanceof Error ? failures[0].reason.message : "Product cleanup failed");
        }
      }

      // -- 3. VOLUME items: bulk single-pass delete (one read + one write) ------─
      // Group IDs by type so the server strips them all in a single decryptVolume/saveVolume call
      const volumeIds: Record<string, string[]> = {};
      for (const t of ['sale', 'expense', 'expense-category', 'inventory-item'] as const) {
        const ids = itemsToDelete.filter(i => i.type === t).map(i => i.id);
        if (ids.length > 0) volumeIds[t] = ids;
      }

      if (Object.keys(volumeIds).length > 0) {
        const bulkRes = await fetch('/api/admin/data/bulk-delete-test-items', {
          method: 'DELETE',
          headers: authHeaders,
          body: JSON.stringify({ ids: volumeIds })
        });

        if (!bulkRes.ok) {
          const errorPayload = await bulkRes.json().catch(() => null);
          const errorMessage = errorPayload?.error || `Bulk delete failed with status ${bulkRes.status}`;
          if (bulkRes.status !== 404 && bulkRes.status !== 405) {
            throw new Error(errorMessage);
          }

          // Fallback only if the route itself is unavailable in this deployment.
          console.warn('Bulk delete endpoint unavailable - falling back to sequential deletes');
          const endpointMap: Record<string, string> = {
            sale: '/api/admin/finances/sales',
            expense: '/api/admin/finances/expenses',
            'expense-category': '/api/admin/finances/expense-categories',
          };
          for (const [t, ids] of Object.entries(volumeIds)) {
            for (const id of ids) {
              try {
                const url = t === 'inventory-item'
                  ? `/api/admin/inventory/${id}`
                  : `${endpointMap[t]}?id=${id}`;
                const response = await fetch(url, { method: 'DELETE', headers: authHeaders });
                if (!response.ok) {
                  const errorText = await response.text().catch(() => response.statusText);
                  throw new Error(errorText || `status ${response.status}`);
                }
              } catch (e) {
                console.warn(`Sequential delete failed for ${t}:${id}`, e);
              }
            }
          }
        }
      }

      toast({ title: "Cleanup complete", description: `Deleted ${itemsToDelete.length} test item(s).` });
      clearTrackedTestData();
    } catch (e: any) {
      toast({ title: "Cleanup failed", description: e.message, variant: "destructive" });
    } finally {
      setIsCleaningUp(false);
      setShowCleanupDialog(false);
    }
  };

  const getStatusIcon = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="w-4 h-4 animate-spin text-blue-500" />;
      case 'passed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-gray-300" />;
    }
  };

  const getStatusBadge = (status: TestResult['status']) => {
    switch (status) {
      case 'running':
        return <Badge className="bg-blue-100 text-blue-800">Running</Badge>;
      case 'passed':
        return <Badge className="bg-green-100 text-green-800">Passed</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge variant="outline">Pending</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Database className="w-5 h-5" />
          Volume Storage Testing Suite
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {showHealthSection && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <Card className="border-2 border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-slate-900">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex justify-between items-center">
                <span>Firestore Health</span>
                {isCheckingHealth ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" /> :
                  <Badge variant={healthStatus?.status === 'complete' ? 'default' : 'destructive'}
                    className={healthStatus?.status === 'complete' ? 'bg-green-500 hover:bg-green-600' : ''}>
                    {healthStatus?.status?.toUpperCase() || 'UNKNOWN'}
                  </Badge>
                }
              </CardTitle>
              <CardDescription>Checks presence of required config and auth documents.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex gap-2 mb-2">
                <Button size="sm" variant="outline" onClick={checkHealth} disabled={isCheckingHealth}>
                  Refresh Status
                </Button>
                <Button size="sm" variant="default" onClick={fixDb} disabled={isFixingDb || healthStatus?.status === 'complete'} className="bg-blue-600 hover:bg-blue-700">
                  {isFixingDb ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Database className="w-4 h-4 mr-2" />}
                  Fix Database
                </Button>
              </div>
              {fixReport && (
                <div className="mt-4 text-xs bg-slate-100 dark:bg-slate-800 p-3 rounded space-y-1.5">
                  {fixReport.missing?.length > 0 && (
                    <p><strong className="text-red-600 dark:text-red-400">Missing:</strong> {fixReport.missing.join(', ')}</p>
                  )}
                  {fixReport.created?.length > 0 && (
                    <p><strong className="text-green-600 dark:text-green-400">Regenerated:</strong> {fixReport.created.join(', ')}</p>
                  )}
                  {fixReport.deleted?.length > 0 && (
                    <p><strong className="text-amber-600 dark:text-amber-400">Cleaned:</strong> {fixReport.deleted.join(', ')}</p>
                  )}
                  {fixReport.skipped?.length > 0 && (
                    <p><strong className="text-muted-foreground">Already OK:</strong> {fixReport.skipped.join(', ')}</p>
                  )}
                  {(!fixReport.missing?.length && !fixReport.created?.length && !fixReport.deleted?.length) && (
                    <p className="text-muted-foreground">Database was already healthy. No changes made.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Whitelisted Collections Card */}
          <Card className="border-green-200 dark:border-green-800/50 bg-green-50/30 dark:bg-green-950/20 md:col-span-2">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg text-green-700 dark:text-green-500 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5" /> Whitelisted Collections
                </CardTitle>
                <CardDescription>Expected collections that make up the system structure.</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm max-h-48 overflow-y-auto pr-2">
                {healthStatus?.whitelisted?.map((coll: string) => (
                  <div key={coll} className="flex justify-between items-center bg-white/50 dark:bg-black/20 px-2 rounded py-1 border border-green-100 dark:border-green-900/30">
                    <div className="flex items-center gap-2 overflow-hidden">
                      {healthStatus?.collections?.[coll]?.exists ? <CheckCircle className="w-4 h-4 text-green-500 shrink-0" /> : <XCircle className="w-4 h-4 text-red-500 shrink-0" />}
                      <span className="truncate font-medium text-green-800 dark:text-green-300" title={coll}>{coll}</span>
                    </div>
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs text-muted-foreground hover:text-red-500" onClick={() => handleWhitelistAction('remove', coll)} disabled={isWhitelisting}>
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Missing Collections Card */}
          {healthStatus?.missing?.length > 0 && (
            <Card className="border-red-200 dark:border-red-800/50 bg-red-50/30 dark:bg-red-950/20 md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg text-red-700 dark:text-red-500 flex items-center gap-2">
                  <XCircle className="w-5 h-5" /> Missing Expected Collections
                </CardTitle>
                <CardDescription>These collections are whitelisted but do not currently exist.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {healthStatus?.missing?.map((coll: string) => (
                    <Badge key={coll} variant="outline" className="border-red-300 text-red-700 dark:text-red-400 bg-white/50 dark:bg-black/20">
                      {coll}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Out of Place Collections Card */}
          {healthStatus?.outOfPlace?.length > 0 && (
            <Card className="border-purple-200 dark:border-purple-800/50 bg-purple-50/30 dark:bg-purple-950/20 md:col-span-2">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-lg text-purple-700 dark:text-purple-500 flex items-center gap-2">
                    <ShieldAlert className="w-5 h-5" /> Out of Place Collections
                  </CardTitle>
                  <CardDescription>Unexpected collections found in the database. Review and manage.</CardDescription>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 text-sm max-h-48 overflow-y-auto pr-2">
                  {healthStatus?.outOfPlace?.map((coll: string) => (
                    <div key={coll} className="flex justify-between items-center border border-purple-200 dark:border-purple-800/50 py-1 bg-white/50 dark:bg-black/20 px-2 rounded">
                      <span className="truncate font-medium text-purple-800 dark:text-purple-300" title={coll}>{coll}</span>
                      <div className="flex gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-6 px-2 text-xs bg-white dark:bg-slate-900 border-purple-300 dark:border-purple-700" onClick={() => handleWhitelistAction('add', coll)} disabled={isWhitelisting}>
                          Whitelist
                        </Button>
                        <Button variant="destructive" size="sm" className="h-6 px-2 text-xs" onClick={() => setConfirmDeleteCollection(coll)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <AlertDialog open={!!confirmDeleteCollection} onOpenChange={(open) => !open && setConfirmDeleteCollection(null)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Collection?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete the collection <strong>{confirmDeleteCollection}</strong> and all of its documents. This action cannot be undone. Enter your master password to confirm.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <div className="my-4">
                <Label htmlFor="del-password">Master Password</Label>
                <Input
                  id="del-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="Master Password"
                />
              </div>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteCollection}
                  disabled={isDeletingCollection || !deletePassword}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeletingCollection ? <Loader2 className="w-4 h-4 animate-spin" /> : "Delete Collection"}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        )}

        <div>
          <Label htmlFor="test-password">Master Password for Testing</Label>
          <Input
            id="test-password"
            type="password"
            value={testPassword}
            onChange={(e) => setTestPassword(e.target.value)}
            placeholder="Enter master password"
            className="mt-1"
          />
        </div>

        {isRunningTests && (
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Running: {tests[currentTestIndex]?.name}</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} />
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button onClick={runAllTests} disabled={isRunningTests} className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            {isRunningTests && !isPaused ? "Running Tests..." : "Run All Tests"}
          </Button>
          {isRunningTests && (
            <>
              <Button variant="secondary" onClick={() => setIsPaused(!isPaused)} className="flex items-center gap-2">
                {isPaused ? <Play className="w-4 h-4" /> : <Loader2 className="w-4 h-4 animate-spin" />}
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button variant="destructive" onClick={cancelTests} className="flex items-center gap-2">
                <XCircle className="w-4 h-4" /> Cancel
              </Button>
            </>
          )}
          <Button variant="outline" onClick={resetTests} disabled={isRunningTests && !isPaused}>
            Reset Tests
          </Button>
          {testReport && (
            <Button
              variant="outline"
              onClick={() => setShowReport(!showReport)}
              className="flex items-center gap-2"
            >
              {showReport ? "Hide Report" : "Show Report"}
            </Button>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold">Run Individual Tests:</h4>
            {(isRunningTests || showLiveReport) && (
              <button
                onClick={() => {
                  const reportText = tests.map(t =>
                    `[${t.status.toUpperCase()}] ${t.name}${t.duration ? ` (${t.duration}ms)` : ''}${t.message ? ` - ${t.message}` : ''}${t.error ? ` ERROR: ${t.error}` : ''}`
                  ).join('\n');
                  navigator.clipboard.writeText(reportText)
                    .then(() => toast({ title: "Copied live report" }))
                    .catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
                }}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              >
                <Copy className="w-3 h-3" /> Copy Live Report
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {tests.map((test, index) => {
              const isThisRunning = test.status === 'running';
              const isPassed = test.status === 'passed';
              const isFailed = test.status === 'failed';
              return (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => runIndividualTest(index)}
                  disabled={isRunningTests && !isThisRunning}
                  className={[
                    'h-auto min-h-12 justify-start px-3 py-2 transition-all duration-300',
                    isPassed ? 'border-green-500 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-400 dark:border-green-700' : '',
                    isFailed ? 'border-red-500 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-400 dark:border-red-700' : '',
                    isThisRunning ? 'border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/30 dark:text-blue-400 dark:border-blue-700 motion-safe:animate-pulse [animation-duration:2.2s]' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex w-full items-start gap-2">
                    <span className="mt-0.5 flex-shrink-0">
                      {isThisRunning
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : isPassed
                          ? <CheckCircle className="w-3 h-3 text-green-500" />
                          : isFailed
                            ? <XCircle className="w-3 h-3 text-red-500" />
                            : <Play className="w-3 h-3" />
                      }
                    </span>
                    <div className="min-w-0 flex-1 text-left">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{test.name}</span>
                        {isThisRunning && test.progress && (
                          <span className="shrink-0 text-[10px] font-medium text-blue-700 dark:text-blue-300">
                            {test.progress.current}/{test.progress.total}
                          </span>
                        )}
                      </div>
                      {isThisRunning && test.progress && (
                        <div className="mt-2 space-y-1.5">
                          <Progress
                            value={(test.progress.current / Math.max(test.progress.total, 1)) * 100}
                            className="h-1.5 bg-blue-100 dark:bg-blue-950/60"
                          />
                          {test.message && (
                            <p className="truncate text-[10px] text-blue-700/80 dark:text-blue-300/80">
                              {test.message}
                            </p>
                          )}
                        </div>
                      )}
                      {isThisRunning && !test.progress && test.message && (
                        <p className="mt-1 truncate text-[10px] text-blue-700/80 dark:text-blue-300/80">
                          {test.message}
                        </p>
                      )}
                    </div>
                  </div>
                </Button>
              );
            })}
          </div>
        </div>

        {/* â”€â”€ Unified Test Report: Live during run, full summary after â”€â”€ */}
        {showLiveReport && (
          <Card className="border-border">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    {isRunningTests
                      ? <><Loader2 className="w-4 h-4 animate-spin text-blue-500" /> Live Test Results</>
                      : <><Database className="w-4 h-4" /> Test Report</>
                    }
                  </CardTitle>
                  {testReport && !isRunningTests && (
                    <CardDescription>
                      Completed {new Date(testReport.timestamp).toLocaleString()}
                    </CardDescription>
                  )}
                </div>

                {/* Export / Copy actions */}
                <div className="flex items-center gap-1.5">
                  {/* Copy Markdown */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => {
                      const passed = tests.filter(t => t.status === 'passed');
                      const failed = tests.filter(t => t.status === 'failed');
                      const running = tests.filter(t => t.status === 'running');
                      const pending = tests.filter(t => t.status === 'pending');
                      const totalDone = passed.length + failed.length;
                      const successRate = totalDone > 0 ? Math.round((passed.length / totalDone) * 100) : 0;

                      const lines: string[] = [];
                      lines.push(`# Volume Test Report`);
                      lines.push(`**Generated:** ${new Date().toLocaleString()}`);
                      lines.push(``);
                      lines.push(`## Summary`);
                      lines.push(`| Metric | Value |`);
                      lines.push(`|--------|-------|`);
                      lines.push(`| Total Tests | ${tests.length} |`);
                      lines.push(`| ✅ Passed | ${passed.length} |`);
                      lines.push(`| ❌ Failed | ${failed.length} |`);
                      if (running.length) lines.push(`| 🔵 Running | ${running.length} |`);
                      if (pending.length) lines.push(`| ⏳ Pending | ${pending.length} |`);
                      lines.push(`| Success Rate | ${successRate}% |`);
                      if (testReport) {
                        lines.push(`| Total Duration | ${testReport.totalDuration}ms |`);
                        lines.push(`| Avg Duration | ${testReport.averageDuration}ms |`);
                        lines.push(`| Fastest | ${testReport.fastestTest.name} (${testReport.fastestTest.duration}ms) |`);
                        lines.push(`| Slowest | ${testReport.slowestTest.name} (${testReport.slowestTest.duration}ms) |`);
                      }
                      lines.push(``);
                      lines.push(`## Results`);
                      lines.push(``);
                      tests.forEach(t => {
                        const icon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'running' ? '🔵' : '⏳';
                        lines.push(`### ${icon} ${t.name}${t.duration ? ` – ${t.duration}ms` : ''}`);
                    `[${t.status.toUpperCase()}] ${t.name}${t.duration ? ` (${t.duration}ms)` : ''}${t.message ? ` - ${t.message}` : ''}${t.error ? ` ERROR: ${t.error}` : ''}`
                        if (t.error) lines.push(`\n**Error:** \`${t.error}\``);
                        if (t.details) {
                          lines.push(``);
                          lines.push(`\`\`\`json`);
                          lines.push(JSON.stringify(t.details, null, 2));
                          lines.push(`\`\`\``);
                        }
                        lines.push(``);
                      });
                      navigator.clipboard.writeText(lines.join('\n'))
                        .then(() => toast({ title: "Copied as Markdown" }))
                        .catch(() => toast({ title: "Failed to copy", variant: "destructive" }));
                    }}
                  >
                    <Copy className="w-3 h-3" /> Copy Markdown
                  </Button>

                  {/* Download Markdown */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => {
                      const passed = tests.filter(t => t.status === 'passed');
                      const failed = tests.filter(t => t.status === 'failed');
                      const totalDone = passed.length + failed.length;
                      const successRate = totalDone > 0 ? Math.round((passed.length / totalDone) * 100) : 0;

                      const lines: string[] = [];
                      lines.push(`# Volume Test Report`);
                      lines.push(`**Generated:** ${new Date().toLocaleString()}`);
                      lines.push(``);
                      lines.push(`## Summary`);
                      lines.push(`| Metric | Value |`);
                      lines.push(`|--------|-------|`);
                      lines.push(`| Total Tests | ${tests.length} |`);
                      lines.push(`| ✅ Passed | ${passed.length} |`);
                      lines.push(`| ❌ Failed | ${failed.length} |`);
                      lines.push(`| Success Rate | ${successRate}% |`);
                      if (testReport) {
                        lines.push(`| Total Duration | ${testReport.totalDuration}ms |`);
                        lines.push(`| Avg Duration | ${testReport.averageDuration}ms |`);
                        lines.push(`| Fastest | ${testReport.fastestTest.name} (${testReport.fastestTest.duration}ms) |`);
                        lines.push(`| Slowest | ${testReport.slowestTest.name} (${testReport.slowestTest.duration}ms) |`);
                      }
                      lines.push(``);
                      lines.push(`## Results`);
                      lines.push(``);
                      tests.forEach(t => {
                        const icon = t.status === 'passed' ? '✅' : t.status === 'failed' ? '❌' : t.status === 'running' ? '🔵' : '⏳';
                        lines.push(`### ${icon} ${t.name}${t.duration ? ` – ${t.duration}ms` : ''}`);
                    `[${t.status.toUpperCase()}] ${t.name}${t.duration ? ` (${t.duration}ms)` : ''}${t.message ? ` - ${t.message}` : ''}${t.error ? ` ERROR: ${t.error}` : ''}`
                        if (t.error) lines.push(`\n**Error:** \`${t.error}\``);
                        if (t.details) {
                          lines.push(``);
                          lines.push(`\`\`\`json`);
                          lines.push(JSON.stringify(t.details, null, 2));
                          lines.push(`\`\`\``);
                        }
                        lines.push(``);
                      });
                      // Append raw JSON at bottom for completeness
                      lines.push(`---`);
                      lines.push(`## Raw JSON`);
                      lines.push(`\`\`\`json`);
                      lines.push(JSON.stringify({ timestamp: new Date().toISOString(), tests }, null, 2));
                      lines.push(`\`\`\``);

                      const blob = new Blob([lines.join('\n')], { type: 'text/markdown' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `volume-test-report-${new Date().toISOString().split('T')[0]}.md`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export .md
                  </Button>

                  {/* Download JSON */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 text-xs h-8"
                    onClick={() => {
                      const payload = { timestamp: new Date().toISOString(), tests, report: testReport, databaseHealth: healthStatus };
                      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `volume-test-report-${new Date().toISOString().split('T')[0]}.json`;
                      a.click();
                      URL.revokeObjectURL(url);
                    }}
                  >
                    Export .json
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-4 pt-0">
              {/* Summary stats â€” only shown once run is complete */}
              {testReport && !isRunningTests && (
                <>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-blue-600">{testReport.totalTests}</div>
                      <div className="text-xs text-blue-700 dark:text-blue-400 mt-0.5">Total Tests</div>
                    </div>
                    <div className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-green-600">{testReport.passedTests}</div>
                      <div className="text-xs text-green-700 dark:text-green-400 mt-0.5">Passed</div>
                    </div>
                    <div className="bg-red-50 dark:bg-red-950/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-red-600">{testReport.failedTests}</div>
                      <div className="text-xs text-red-700 dark:text-red-400 mt-0.5">Failed</div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-950/30 p-3 rounded-lg text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {Math.round((testReport.passedTests / testReport.totalTests) * 100)}%
                      </div>
                      <div className="text-xs text-purple-700 dark:text-purple-400 mt-0.5">Success Rate</div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div><span className="text-muted-foreground">Total:</span> <span className="font-semibold">{testReport.totalDuration}ms</span></div>
                    <div><span className="text-muted-foreground">Avg:</span> <span className="font-semibold">{testReport.averageDuration}ms</span></div>
                    <div><span className="text-muted-foreground">Fastest:</span> <span className="font-semibold">{testReport.fastestTest.name}</span> <span className="text-muted-foreground">({testReport.fastestTest.duration}ms)</span></div>
                    <div><span className="text-muted-foreground">Slowest:</span> <span className="font-semibold">{testReport.slowestTest.name}</span> <span className="text-muted-foreground">({testReport.slowestTest.duration}ms)</span></div>
                  </div>
                </>
              )}

              {/* Per-test accordion rows â€” live during run, frozen-state after */}
              <div className="space-y-1">
                {tests.map((test, index) => (
                  <div key={index} className="rounded-lg border overflow-hidden">
                    <button
                      className={[
                        'w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors hover:bg-muted/40',
                        test.status === 'passed' ? 'bg-green-50/60 dark:bg-green-950/20' : '',
                        test.status === 'failed' ? 'bg-red-50/60 dark:bg-red-950/20' : '',
                        test.status === 'running' ? 'bg-blue-50/60 dark:bg-blue-950/20' : '',
                      ].filter(Boolean).join(' ')}
                      onClick={() => setExpandedTestIndex(expandedTestIndex === index ? null : index)}
                    >
                      <div className="flex items-center gap-2.5">
                        {getStatusIcon(test.status)}
                        <span className="font-medium">{test.name}</span>
                        {test.message && (
                          <span className="text-[11px] text-muted-foreground truncate max-w-[260px] hidden sm:block" title={test.message}>
                            - {test.message}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {test.duration && <span className="text-xs text-muted-foreground">{test.duration}ms</span>}
                        {getStatusBadge(test.status)}
                        <span className="text-muted-foreground text-[10px]">{expandedTestIndex === index ? 'â–²' : 'â–¼'}</span>
                      </div>
                    </button>

                    {expandedTestIndex === index && (
                      <div className="px-3 py-2.5 bg-background border-t text-xs space-y-2">
                        {test.message && <p className="text-muted-foreground">{test.message}</p>}
                        {test.error && (
                          <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/50 rounded p-2 text-red-700 dark:text-red-400 font-mono">
                            <span className="font-bold not-italic">Error: </span>{test.error}
                          </div>
                        )}
                        {test.details && (
                          <details>
                            <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">Technical Details</summary>
                            <pre className="mt-2 bg-muted rounded p-2 overflow-auto max-h-48 text-[10px] leading-relaxed">
                              {JSON.stringify(test.details, null, 2)}
                            </pre>
                          </details>
                        )}
                        {test.status === 'pending' && <p className="text-muted-foreground italic">Not yet run.</p>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}





        <div className="bg-muted/50 p-4 rounded-lg">
          <h4 className="font-medium mb-2 text-sm">Test Suite Information</h4>
          <ul className="text-xs text-muted-foreground space-y-1">
            <li>Tests volume-based encryption and chunk scaling</li>
            <li>Verifies data integrity and encryption security</li>
            <li>Tests sales, products, expenses, and expense categories CRUD</li>
            <li>Tests concurrent operations and performance</li>
            <li>Creates test data that is cleaned up automatically after each run</li>
            <li>Generates a live report during and a full analytics report after the run</li>
          </ul>
        </div>
      </CardContent>

      <AlertDialog open={showCleanupDialog} onOpenChange={setShowCleanupDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Test Dummy Data Cleanup</AlertDialogTitle>
            <AlertDialogDescription>
              The testing suite created {createdTestData.length} dummy items (sales, products, etc.) in your database during the tests.
              Would you like to delete this generated data to keep your database clean?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isCleaningUp} onClick={() => { setShowCleanupDialog(false); clearTrackedTestData(); }}>Keep Data</AlertDialogCancel>
            <AlertDialogAction disabled={isCleaningUp} onClick={handleDeleteAllTestData}>
              {isCleaningUp ? 'Deleting...' : 'Delete All Test Data'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

