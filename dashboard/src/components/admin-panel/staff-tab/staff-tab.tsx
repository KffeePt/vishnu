"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Combobox } from "@/components/ui/combobox";
import { Checkbox } from "@/components/ui/checkbox";
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
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Plus, UserPlus, Shield, User, Trash2, KeyRound, Eye, EyeOff, Copy, RefreshCcw, MoreHorizontal, CalendarClock, Package, MessageSquare, DollarSign, HandCoins, Percent, Settings } from 'lucide-react';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Employee } from '@/types/candyland';
import { getAdminHeaders } from '@/lib/client-auth';
import { AuthenticationRequired } from '../authentication-tab/authentication-required';
import InventoryAssignmentPanel from '../inventory-management-tab/inventory-assignment-panel';
import { SentinelMonitorTab } from '../data-tab/sentinel-monitor-tab';
import AdminChatPanel from './admin-chat-panel';
import { useMasterPassword } from '@/hooks/use-master-password';
import { useTabAuth } from "@/hooks/use-tab-auth";
import { collection, collectionGroup, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db as clientDb, db } from '@/config/firebase';
import { SellingRulesDialog } from './selling-rules-dialog';
import { envelopeDecrypt, unwrapPrivateKey, fingerprintKey } from '@/lib/crypto-client';
import { pushSaleRecord } from '@/lib/client-push';

interface AuthUser {
    uid: string;
    email?: string;
    displayName?: string;
}

interface DebtRecord {
    id: string;
    amount: number;
    note: string;
    date: string;
    status?: 'due' | 'paid';
}

const PendingCountdown = ({ createdAt }: { createdAt: string | Date }) => {
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    useEffect(() => {
        if (!createdAt) {
            setTimeLeft(null);
            return;
        }

        const setupTimeMs = new Date(createdAt).getTime();
        const expiryTimeMs = setupTimeMs + 5 * 60 * 1000;

        const calculateTimeLeft = () => {
            const now = Date.now();
            if (now >= expiryTimeMs) return 0;
            return Math.ceil((expiryTimeMs - now) / 1000);
        };

        const initialLeft = calculateTimeLeft();
        setTimeLeft(initialLeft);

        if (initialLeft <= 0) return;

        const interval = setInterval(() => {
            const left = calculateTimeLeft();
            setTimeLeft(left);
            if (left <= 0) {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [createdAt]);

    if (timeLeft === null) return null;
    if (timeLeft <= 0) return <span className="text-destructive font-bold text-xs">Expirado</span>;

    const mins = Math.floor(timeLeft / 60);
    const secs = timeLeft % 60;
    const formatted = `${mins}:${secs.toString().padStart(2, '0')}`;

    return (
        <span className={`text-xs ml-2 font-mono ${timeLeft <= 60 ? 'text-destructive font-bold animate-pulse' : 'text-primary'}`}>
            ⏱ {formatted}
        </span>
    );
};

interface StaffTabProps {
    onSubTabChange?: (tab: string) => void;
}

export default function StaffTab({ onSubTabChange }: StaffTabProps) {
    const [employees, setEmployees] = useState<Employee[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Auth users for the combobox
    const [allUsers, setAllUsers] = useState<AuthUser[]>([]);
    const [isLoadingUsers, setIsLoadingUsers] = useState(false);
    const [selectedUserId, setSelectedUserId] = useState('');

    // Derived from selected user
    const [newName, setNewName] = useState('');
    const [newUsername, setNewUsername] = useState('');
    const [newEmail, setNewEmail] = useState('');
    const [newRole, setNewRole] = useState<'admin' | 'manager' | 'staff'>('staff');
    const [newPhone, setNewPhone] = useState('');
    const [creationMode, setCreationMode] = useState<'existing' | 'new'>('existing');
    const [tempPassword, setTempPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    // Pending Integrations
    const [pendingEmployees, setPendingEmployees] = useState<Employee[]>([]);
    const [isLoadingPending, setIsLoadingPending] = useState(true);

    // AlertDialog state
    const [deactivateTarget, setDeactivateTarget] = useState<{ id: string; isActive: boolean } | null>(null);
    const [resetTarget, setResetTarget] = useState<{ id: string; name: string } | null>(null);
    const [generateTempPassword, setGenerateTempPassword] = useState(false);
    const [expirationTarget, setExpirationTarget] = useState<{ id: string; name: string } | null>(null);
    const [expirationDays, setExpirationDays] = useState('30');

    const { getIDToken, user } = UserAuth();
    const { toast } = useToast();
    const { isTabAuthenticated, setIsTabAuthenticated, parentMasterPassword } = useTabAuth();
    const { authSession, handleAuthenticated } = useMasterPassword();
    const [activeTab, setActiveTab] = useState('employees');

    // E2E Payroll cache map (staffUid -> total payroll amount)
    const [staffPayrollMap, setStaffPayrollMap] = useState<Record<string, number>>({});
    const [staffSoldMap, setStaffSoldMap] = useState<Record<string, number>>({});
    const [staffCraftingMap, setStaffCraftingMap] = useState<Record<string, number>>({});
    const [staffRecoveredMap, setStaffRecoveredMap] = useState<Record<string, number>>({});
    const [staffDebtMap, setStaffDebtMap] = useState<Record<string, number>>({});
    const [staffPaidMap, setStaffPaidMap] = useState<Record<string, number>>({});
    const [isDecryptingPayroll, setIsDecryptingPayroll] = useState(false);

    // New Dialog States
    const [profitTarget, setProfitTarget] = useState<{ id: string; name: string; currentPercent: number } | null>(null);
    const [profitPercent, setProfitPercent] = useState('50');
    const [usernameTarget, setUsernameTarget] = useState<{ id: string; name: string } | null>(null);
    const [usernameValue, setUsernameValue] = useState('');
    const [isSavingUsername, setIsSavingUsername] = useState(false);

    // Selling Rules State
    const [rulesTargetId, setRulesTargetId] = useState<string | null>(null);
    const [rulesTargetName, setRulesTargetName] = useState<string | null>(null);

    const [payTarget, setPayTarget] = useState<{ id: string; name: string; balanceDue: number } | null>(null);
    const [payAmount, setPayAmount] = useState('');
    const [payNote, setPayNote] = useState('');
    const [isPaying, setIsPaying] = useState(false);

    const [debtTarget, setDebtTarget] = useState<{ id: string; name: string } | null>(null);
    const [debtAmount, setDebtAmount] = useState('');
    const [debtNote, setDebtNote] = useState('');
    const [isAddingDebt, setIsAddingDebt] = useState(false);
    const [isRemovingDebt, setIsRemovingDebt] = useState<string | null>(null);

    // E2E Debt and Payment list cache (staffUid -> Record[])
    const [staffDebtsList, setStaffDebtsList] = useState<Record<string, DebtRecord[]>>({});
    const [staffPaymentsList, setStaffPaymentsList] = useState<Record<string, DebtRecord[]>>({});
    const [isRemovingPayment, setIsRemovingPayment] = useState<string | null>(null);

    // Track whether we've done the initial fetch
    const initialFetchDone = useRef(false);

    // Track loading states for approval actions
    const [isApproving, setIsApproving] = useState<Record<string, string>>({});

    // Trigger onSubTabChange when activeTab changes
    useEffect(() => {
        onSubTabChange?.(activeTab);
    }, [activeTab, onSubTabChange]);

    useEffect(() => {
        if (!isTabAuthenticated && !parentMasterPassword && !authSession?.masterPassword) return;
        fetchEmployees();
        fetchPendingEmployees();
        initialFetchDone.current = true;
    }, [isTabAuthenticated, parentMasterPassword, authSession?.masterPassword]);

    // Listeners for FAB actions from admin-panel UI
    useEffect(() => {
        const handleOpenStaffDialog = () => {
            setActiveTab('employees');
            handleDialogOpenChange(true);
        };
        window.addEventListener('open-add-staff-dialog', handleOpenStaffDialog);
        return () => window.removeEventListener('open-add-staff-dialog', handleOpenStaffDialog);
    }, []);

    // Real-time listener: auto-refresh when staff-data collection changes
    useEffect(() => {
        if (!isTabAuthenticated && !parentMasterPassword && !authSession?.masterPassword) return;

        const collRef = collection(clientDb, 'staff-data');
        const unsubscribe = onSnapshot(collRef, () => {
            // Skip the initial snapshot (we already fetched above)
            if (!initialFetchDone.current) return;
            // Re-fetch via API to get decrypted data
            fetchEmployees();
            fetchPendingEmployees();
        }, (error) => {
            console.error('Staff-data listener error:', error);
        });

        return () => unsubscribe();
    }, [isTabAuthenticated, parentMasterPassword, authSession?.masterPassword]);

    // Real-time listener for E2E finances to compute payroll per staff
    useEffect(() => {
        if (!isTabAuthenticated && !parentMasterPassword && !authSession?.masterPassword) return;

        const q = query(
            collectionGroup(db, 'records')
        );

        setIsDecryptingPayroll(true);

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            try {
                // Fetch admin's private key for decryption
                const idToken = await getIDToken();
                if (!idToken) return;

                const keyRes = await fetch('/api/admin/keys', {
                    headers: { Authorization: `Bearer ${idToken}` }
                });
                if (!keyRes.ok) throw new Error('Failed to fetch admin key');
                const adminKeyData = await keyRes.json();

                if (!adminKeyData.encryptedPrivateKey) {
                    setIsDecryptingPayroll(false);
                    return;
                }

                const privateKey = await unwrapPrivateKey(adminKeyData.encryptedPrivateKey, parentMasterPassword || authSession?.masterPassword || '');

                const payrollMap: Record<string, number> = {};
                const soldMap: Record<string, number> = {};
                const craftingMap: Record<string, number> = {};
                const recoveredMap: Record<string, number> = {};
                const debtMap: Record<string, number> = {};
                const paidMap: Record<string, number> = {};
                const debtsListMap: Record<string, DebtRecord[]> = {};
                const paymentsListMap: Record<string, DebtRecord[]> = {};

                // Find profit percentages for all staff
                const staffDocs = await getDocs(collection(clientDb, 'staff-data'));
                const profitPercents: Record<string, number> = {};

                const decryptionPromises: Promise<void>[] = [];
                staffDocs.forEach((doc: any) => {
                    const data = doc.data();
                    if (data.encryptedData) {
                        try {
                            const promise = envelopeDecrypt(
                                {
                                    encryptedData: data.encryptedData,
                                    iv: data.iv,
                                    staffWrappedDEK: data.staffWrappedDEK || '',
                                    adminWrappedDEK: data.adminWrappedDEK || '',
                                    encryptionVersion: data.encryptionVersion ?? 2
                                },
                                data.adminWrappedDEK,
                                privateKey
                            ).then(str => {
                                const parsed = JSON.parse(str);
                                profitPercents[doc.id] = parsed.profitPercent ?? 50;
                            }).catch(() => {
                                profitPercents[doc.id] = 50;
                            });
                            decryptionPromises.push(promise);
                        } catch (e) {
                            profitPercents[doc.id] = 50;
                        }
                    } else {
                        profitPercents[doc.id] = data.profitPercent ?? 50;
                    }
                });

                await Promise.all(decryptionPromises);

                // Since we need to wait for decryption of profit percents (which is async):
                // We map from the raw staffDocs above to avoid infinite dependency loops on the `employees` state.
                const getProfitPercent = (uid: string) => {
                    return profitPercents[uid] ?? 50;
                };

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
                        // Build Firestore path to extract staffUid
                        const pathSegments = docSnap.ref.path.split('/');
                        const staffUid = data.staffUid || (pathSegments.length >= 2 ? pathSegments[1] : '');

                        if (staffUid) {
                            const type = decData.type || 'sale'; // 'sale', 'debt', 'payment', 'crafting', 'recovery'

                            if (type === 'payment') {
                                const paymentStatus = decData.status || 'paid'; // legacy records default to paid
                                if (paymentStatus === 'paid') {
                                    paidMap[staffUid] = (paidMap[staffUid] || 0) + (Number(decData.amount) || 0);
                                }

                                if (!paymentsListMap[staffUid]) paymentsListMap[staffUid] = [];
                                paymentsListMap[staffUid].push({
                                    id: docSnap.id,
                                    amount: Number(decData.amount) || 0,
                                    note: decData.note || 'No note',
                                    date: decData.soldAt || new Date().toISOString(),
                                    status: paymentStatus
                                });
                            } else if (type === 'debt') {
                                // Debt values are already negative and should NOT have the profit split applied
                                // They subtract 1:1 from the total payroll
                                const debtVal = Number(decData.value) || 0;
                                payrollMap[staffUid] = (payrollMap[staffUid] || 0) + debtVal;
                                debtMap[staffUid] = (debtMap[staffUid] || 0) + Math.abs(debtVal);

                                if (!debtsListMap[staffUid]) debtsListMap[staffUid] = [];
                                debtsListMap[staffUid].push({
                                    id: docSnap.id,
                                    amount: Math.abs(debtVal),
                                    note: decData.note || 'No note',
                                    date: decData.soldAt || new Date().toISOString()
                                });
                            } else if (type === 'crafting') {
                                // Crafting consumption: deducts from assigned quantity
                                // but does NOT impact payroll/finances.
                                const qty = typeof decData.qtySold === 'number' ? decData.qtySold : 0;
                                const resolvedItemId = decData.itemId || decData.itemName;
                                if (resolvedItemId) {
                                    const key = `${staffUid}_${resolvedItemId}`;
                                    craftingMap[key] = (craftingMap[key] || 0) + qty;
                                }
                            } else if (type === 'recovery') {
                                // Salvage/Recovery: adds back to assigned quantity
                                const qty = typeof decData.qtySold === 'number' ? decData.qtySold : 0;
                                const resolvedItemId = decData.itemId || decData.itemName;
                                if (resolvedItemId) {
                                    const key = `${staffUid}_${resolvedItemId}`;
                                    recoveredMap[key] = (recoveredMap[key] || 0) + qty;
                                }
                            } else {
                                // Regular sale
                                const value = typeof decData.value === 'number' ? decData.value : 0;
                                const qty = typeof decData.qtySold === 'number' ? decData.qtySold : 0;
                                const cost = typeof decData.originalCost === 'number' ? decData.originalCost : 0;

                                const percent = getProfitPercent(staffUid) / 100;
                                const recordPayroll = ((value * qty) - (cost * qty)) * percent;

                                payrollMap[staffUid] = (payrollMap[staffUid] || 0) + recordPayroll;
                                const resolvedItemId = decData.itemId || decData.itemName;
                                if (resolvedItemId) {
                                    const key = `${staffUid}_${resolvedItemId}`;
                                    soldMap[key] = (soldMap[key] || 0) + qty;
                                } else {
                                    console.warn(`[E2E Payroll] Sale record ${docSnap.id} has no itemId or itemName — soldMap entry skipped.`);
                                }
                            }
                        }
                    } catch (e: any) {
                        // Skip un-decryptable or stale records
                        const pkFp = adminKeyData.publicKey ? await fingerprintKey(adminKeyData.publicKey) : 'none';
                        console.warn(`[E2E Payroll] Skipped record ${docSnap.id}. Current adminPubKey FP: ${pkFp}. Error:`, e.name || e.message);
                    }
                }

                // Sort arrays descending by date to substitute for the removed orderBy clause
                Object.keys(debtsListMap).forEach(uid => {
                    debtsListMap[uid].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                });
                Object.keys(paymentsListMap).forEach(uid => {
                    paymentsListMap[uid].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                });

                setStaffPayrollMap(payrollMap);
                setStaffSoldMap(soldMap);
                setStaffCraftingMap(craftingMap);
                setStaffRecoveredMap(recoveredMap);
                setStaffDebtMap(debtMap);
                setStaffPaidMap(paidMap);
                setStaffDebtsList(debtsListMap);
                setStaffPaymentsList(paymentsListMap);
            } catch (error) {
                console.error("E2E Payroll setup error:", error);
            } finally {
                setIsDecryptingPayroll(false);
            }
        });

        return () => unsubscribe();
    }, [isTabAuthenticated, parentMasterPassword, authSession?.masterPassword, getIDToken]);

    const fetchEmployees = async () => {
        try {
            setIsLoading(true);
            const token = await getIDToken();
            if (!token) return;

      const sessionToken = authSession?.token || (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('vishnu_admin_session') || '{}').token : '');

            const response = await fetch('/api/admin/staff', {
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': sessionToken
                }
            });

            if (!response.ok) {
                console.warn(`Staff fetch returned ${response.status}`);
                setEmployees([]);
                return;
            }

            const data = await response.json();
            setEmployees(Array.isArray(data) ? data : []);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Could not load employees", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const fetchPendingEmployees = async () => {
        try {
            setIsLoadingPending(true);
            const token = await getIDToken();
            if (!token) return;

      const sessionToken = authSession?.token || (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('vishnu_admin_session') || '{}').token : '');

            const response = await fetch('/api/admin/staff?status=pending', {
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': sessionToken
                }
            });

            if (!response.ok) throw new Error('Failed to fetch pending approvals');

            const data = await response.json();
            setPendingEmployees(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoadingPending(false);
        }
    };

    const fetchAllUsers = async () => {
        try {
            setIsLoadingUsers(true);
            const token = await getIDToken();
            if (!token) return;

            const response = await fetch('/api/admin/users', {
                headers: getAdminHeaders(token)
            });

            if (!response.ok) throw new Error('Failed to fetch users');

            const data = await response.json();
            setAllUsers(data.users || []);
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Could not load users", variant: "destructive" });
        } finally {
            setIsLoadingUsers(false);
        }
    };

    const handleDialogOpenChange = (open: boolean) => {
        setIsDialogOpen(open);
        if (open) {
            fetchAllUsers();
        } else {
            resetForm();
        }
    };

    const handleUserSelect = (uid: string) => {
        setSelectedUserId(uid);
        const user = allUsers.find(u => u.uid === uid);
        if (user) {
            setNewName(user.displayName || '');
            setNewEmail(user.email || '');
        }
    };

    const handleCreateEmployee = async (e: React.FormEvent) => {
        e.preventDefault();
        if (creationMode === 'existing' && !selectedUserId) {
            toast({ title: "Error", description: "Please select a user", variant: "destructive" });
            return;
        }
        if (creationMode === 'new' && (!newName || !newEmail || !tempPassword)) {
            toast({ title: "Error", description: "Name, email, and password are required", variant: "destructive" });
            return;
        }
        try {
            setIsSubmitting(true);
            const token = await getIDToken();
            if (!token) return;

      const tokenToUse = authSession?.token || (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('vishnu_admin_session') || '{}').token : '');
            if (!tokenToUse) {
                toast({ title: "Error", description: "Session token not found. Please log in again.", variant: "destructive" });
                setIsSubmitting(false);
                return;
            }

            const payload: any = {
                name: newName,
                username: newUsername || undefined,
                email: newEmail,
                role: newRole,
                phoneNumber: newPhone,
                isActive: true
            };

            if (creationMode === 'existing') {
                payload.userId = selectedUserId;
            } else {
                payload.password = tempPassword;
            }

            const headers = {
                ...getAdminHeaders(token),
                'x-master-password-session': tokenToUse
            };

            const response = await fetch('/api/admin/staff', {
                method: 'POST',
                headers,
                body: JSON.stringify(payload)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create employee');
            }

            toast({ title: "Success", description: "Employee added successfully" });
            setIsDialogOpen(false);
            resetForm();
            fetchEmployees();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleApprovalAction = async (uid: string, action: 'approve' | 'reject') => {
        try {
            setIsApproving(prev => ({ ...prev, [uid]: action }));
            const token = await getIDToken();
            if (!token) return;

      const sessionToken = authSession?.token || (typeof window !== 'undefined' ? JSON.parse(sessionStorage.getItem('vishnu_admin_session') || '{}').token : '');
            const response = await fetch('/api/admin/staff/approve', {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': sessionToken
                },
                body: JSON.stringify({ uid, action })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || `Failed to ${action} staff registration`);
            }

            toast({ title: "Success", description: `Staff registration ${action}d successfully` });
            // Real-time listener will auto-refresh, but do an immediate fetch too
            fetchPendingEmployees();
            fetchEmployees();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsApproving(prev => {
                const newState = { ...prev };
                delete newState[uid];
                return newState;
            });
        }
    };

    const handleDeactivate = (id: string, currentStatus: boolean) => {
        setDeactivateTarget({ id, isActive: currentStatus });
    };

    const confirmDeactivate = async () => {
        if (!deactivateTarget) return;
        const { id, isActive } = deactivateTarget;
        setDeactivateTarget(null);
        try {
            const token = await getIDToken();
            const response = await fetch(`/api/admin/staff/${id}`, {
                method: 'PUT',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({ isActive: !isActive })
            });

            if (!response.ok) throw new Error('Failed to update status');

            toast({ title: "Success", description: "Employee status updated" });
            fetchEmployees();
        } catch (error) {
            toast({ title: "Error", description: "Failed to update status", variant: "destructive" });
        }
    };

    const handleResetRegistration = async (uid: string) => {
        try {
            // Reusing isApproving state just for the loading spinner
            setIsApproving(prev => ({ ...prev, [uid]: 'reset' }));
            const token = await getIDToken();
            if (!token) return;

            const response = await fetch('/api/admin/staff/reset', {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({ uid })
            });

            if (!response.ok) {
                const data = await response.json();
                throw new Error(data.error || 'Failed to reset registration');
            }

            toast({ title: "Success", description: "Staff registration reset. They can now redo the First Time Setup." });

            // Re-fetch to clear them from the list
            fetchEmployees();
            fetchPendingEmployees();
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsApproving(prev => {
                const newState = { ...prev };
                delete newState[uid];
                return newState;
            });
        }
    };

    const handleResetSecurity = (id: string, name: string) => {
        setResetTarget({ id, name });
    };

    const confirmResetSecurity = async () => {
        if (!resetTarget) return;
        const { id, name } = resetTarget;
        setResetTarget(null);
        try {
            const token = await getIDToken();
            let tempPass = '';

            if (generateTempPassword) {
                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$*';
                tempPass = 'Reset-';
                for (let i = 0; i < 10; i++) tempPass += chars.charAt(Math.floor(Math.random() * chars.length));
            }

            const response = await fetch('/api/admin/staff/reset-security', {
                method: 'POST',
                headers: getAdminHeaders(token),
                body: JSON.stringify({ uid: id, tempPassword: tempPass || undefined })
            });

            if (!response.ok) throw new Error('Failed to reset security');

            if (tempPass) {
                await navigator.clipboard.writeText(tempPass);
                toast({ title: "Security Reset", description: `Temporary password for ${name} copied to clipboard.` });
            } else {
                toast({ title: "Security Reset", description: `Major reset complete for ${name}.` });
            }

            fetchEmployees();
        } catch (error) {
            toast({ title: "Error", description: "Failed to reset security", variant: "destructive" });
        }
    };

    const handleSetExpiration = (id: string, name: string) => {
        setExpirationTarget({ id, name });
        setExpirationDays('30');
    };

    const confirmSetExpiration = async () => {
        if (!expirationTarget || !expirationDays) return;
        const { id, name } = expirationTarget;
        setExpirationTarget(null);

        try {
            const token = await getIDToken();
            const response = await fetch('/api/admin/staff/set-expiration', {
                method: 'POST',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({
                    uid: id,
                    days: parseInt(expirationDays, 10)
                })
            });

            if (!response.ok) throw new Error('Failed to set password expiration');

            toast({ title: "Success", description: `Password expiration policy updated for ${name}.` });
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to set expiration", variant: "destructive" });
        }
    };

    const handleSetProfits = (id: string, name: string, currentPercent: number) => {
        setProfitTarget({ id, name, currentPercent });
        setProfitPercent((currentPercent ?? 50).toString());
    };

    const handleSetUsername = (id: string, name: string, currentUsername?: string) => {
        setUsernameTarget({ id, name });
        setUsernameValue(currentUsername || '');
    };

    const confirmSetUsername = async () => {
        if (!usernameTarget) return;

        try {
            setIsSavingUsername(true);
            const token = await getIDToken();
            if (!token) return;

            const response = await fetch(`/api/admin/staff/${usernameTarget.id}`, {
                method: 'PUT',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({
                    username: usernameValue.trim()
                })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to update username');
            }

            toast({ title: "Success", description: `Username updated for ${usernameTarget.name}.` });
            setUsernameTarget(null);
            setUsernameValue('');
            fetchEmployees();
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to update username", variant: "destructive" });
        } finally {
            setIsSavingUsername(false);
        }
    };

    const confirmSetProfits = async () => {
        if (!profitTarget || !profitPercent) return;
        const { id, name } = profitTarget;
        setProfitTarget(null);

        try {
            const token = await getIDToken();
            const response = await fetch(`/api/admin/staff/${id}`, {
                method: 'PUT',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({
                    profitPercent: parseInt(profitPercent, 10)
                })
            });

            if (!response.ok) throw new Error('Failed to set profit percentage');

            toast({ title: "Success", description: `Profit split updated for ${name}.` });
            fetchEmployees();
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to set profits", variant: "destructive" });
        }
    };

    const handleMarkPaid = (id: string, name: string) => {
        const earned = staffPayrollMap[id] || 0;
        const paid = staffPaidMap[id] || 0;
        const balance = earned - paid;
        setPayTarget({ id, name, balanceDue: balance === 0 ? 0 : balance });
        setPayAmount(balance === 0 ? '' : Math.abs(balance).toFixed(2));
        setPayNote('');
    };

    const handleManageRules = (id: string, name: string) => {
        setRulesTargetId(id);
        setRulesTargetName(name);
    };

    const confirmMarkPaid = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!payTarget || !payAmount) return;
        const { id, name } = payTarget;

        try {
            setIsPaying(true);
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            // 1. Fetch Staff Public Key
            const staffKeyRes = await fetch(`/api/staff/master-password?uid=${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const staffKeyData = await staffKeyRes.json();
            if (!staffKeyRes.ok || !staffKeyData.hasKeys || !staffKeyData.publicKey) {
                throw new Error(`${name} has not set up their encryption keys yet.`);
            }

            // 2. Fetch Admin Public Key
            const adminKeyRes = await fetch('/api/staff/admin-key', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const adminKeyData = await adminKeyRes.json();
            if (!adminKeyRes.ok || !adminKeyData.publicKey) {
                throw new Error("Admin encryption keys not found.");
            }

            // If balance is negative, the staff is paying the admin (repayment), so the payment from Admin->Staff is negative
            const isRepayment = payTarget.balanceDue < 0;
            const amountParsed = parseFloat(payAmount);
            const amountToRecord = isRepayment ? -amountParsed : amountParsed;

            // 3. Push E2E Encrypted Record
            const res = await pushSaleRecord(
                {
                    type: 'payment',
                    status: 'due',
                    amount: amountToRecord,
                    note: payNote,
                    paidAt: new Date().toISOString()
                },
                staffKeyData.publicKey,
                adminKeyData.publicKey,
                token,
                id // Pass targeted staff ID to API
            );

            if (!res.success) throw new Error(res.error || "Failed to record payment");

            toast({ title: "Payment Recorded", description: `Successfully recorded $${payAmount} payment for ${name}.` });
            setPayTarget(null);
            // the onSnapshot listener will update the table automatically
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to record payment", variant: "destructive" });
        } finally {
            setIsPaying(false);
        }
    };

    const handleAddDebt = (id: string, name: string) => {
        setDebtTarget({ id, name });
        setDebtAmount('');
        setDebtNote('');
    };

    const confirmAddDebt = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!debtTarget || !debtAmount) return;
        const { id, name } = debtTarget;

        try {
            setIsAddingDebt(true);
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            // 1. Fetch Staff Public Key
            const staffKeyRes = await fetch(`/api/staff/master-password?uid=${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const staffKeyData = await staffKeyRes.json();
            if (!staffKeyRes.ok || !staffKeyData.hasKeys || !staffKeyData.publicKey) {
                throw new Error(`${name} has not set up their encryption keys yet.`);
            }

            // 2. Fetch Admin Public Key
            const adminKeyRes = await fetch('/api/staff/admin-key', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const adminKeyData = await adminKeyRes.json();
            if (!adminKeyRes.ok || !adminKeyData.publicKey) {
                throw new Error("Admin encryption keys not found.");
            }

            // 3. Push E2E Encrypted Record
            const res = await pushSaleRecord(
                {
                    type: 'debt',
                    value: -parseFloat(debtAmount), // Debts are negative values in the ledger
                    qtySold: 1,
                    originalCost: 0,
                    note: debtNote,
                    soldAt: new Date().toISOString()
                },
                staffKeyData.publicKey,
                adminKeyData.publicKey,
                token,
                id // Pass targeted staff ID to API
            );

            if (!res.success) throw new Error(res.error || "Failed to record debt");

            toast({ title: "Debt Added", description: `Successfully added $${debtAmount} debt for ${name}.` });
            setDebtTarget(null);
            // the onSnapshot listener will update the table automatically
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to add debt", variant: "destructive" });
        } finally {
            setIsAddingDebt(false);
        }
    };

    const handleRemoveDebt = async (recordId: string) => {
        try {
            if (!debtTarget?.id) return;
            setIsRemovingDebt(recordId);
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            const response = await fetch(`/api/staff/finances/delete-record`, {
                method: 'DELETE',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({ recordId, staffUid: debtTarget.id })
            });

            if (!response.ok) {
                const text = await response.text();
                let errorMsg = 'Failed to delete debt record';
                try { errorMsg = JSON.parse(text).error || errorMsg; } catch { }
                throw new Error(errorMsg);
            }

            toast({ title: "Success", description: "Debt record removed securely." });
            // onSnapshot listener handles state update
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsRemovingDebt(null);
        }
    };

    const handleRemovePayment = async (recordId: string) => {
        try {
            if (!payTarget?.id) return;
            setIsRemovingPayment(recordId);
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            const response = await fetch(`/api/staff/finances/delete-record`, {
                method: 'DELETE',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({ recordId, staffUid: payTarget.id })
            });

            if (!response.ok) {
                const text = await response.text();
                let errorMsg = 'Failed to delete payment record';
                try { errorMsg = JSON.parse(text).error || errorMsg; } catch { }
                throw new Error(errorMsg);
            }

            toast({ title: "Success", description: "Payment record reverted securely." });
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsRemovingPayment(null);
        }
    };

    const handleTogglePaymentStatus = async (payment: DebtRecord) => {
        try {
            if (!payTarget?.id) return;
            setIsRemovingPayment(payment.id); // reuse spinner state
            const token = await getIDToken();
            if (!token) throw new Error("Not authenticated");

            // 1. Delete old record
            const deleteRes = await fetch('/api/staff/finances/delete-record', {
                method: 'DELETE',
                headers: {
                    ...getAdminHeaders(token),
                    'x-master-password-session': authSession?.token || ''
                },
                body: JSON.stringify({ recordId: payment.id, staffUid: payTarget.id })
            });
            if (!deleteRes.ok) {
                const text = await deleteRes.text();
                let errorMsg = 'Failed to delete payment record';
                try { errorMsg = JSON.parse(text).error || errorMsg; } catch { }
                throw new Error(errorMsg);
            }

            // 2. Fetch keys
            const staffKeyRes = await fetch(`/api/staff/master-password?uid=${payTarget.id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const staffKeyData = await staffKeyRes.json();
            if (!staffKeyRes.ok || !staffKeyData.hasKeys || !staffKeyData.publicKey) {
                throw new Error("Staff encryption keys not available.");
            }

            const adminKeyRes = await fetch('/api/staff/admin-key', {
                headers: { Authorization: `Bearer ${token}` }
            });
            const adminKeyData = await adminKeyRes.json();
            if (!adminKeyRes.ok || !adminKeyData.publicKey) {
                throw new Error("Admin encryption keys not found.");
            }

            // 3. Re-push with toggled status
            const newStatus = payment.status === 'paid' ? 'due' : 'paid';
            const res = await pushSaleRecord(
                {
                    type: 'payment',
                    status: newStatus,
                    amount: payment.amount,
                    note: payment.note,
                    paidAt: payment.date
                },
                staffKeyData.publicKey,
                adminKeyData.publicKey,
                token,
                payTarget.id
            );
            if (!res.success) throw new Error(res.error || "Failed to re-push payment record");

            toast({
                title: "Status Updated",
                description: `Payment marked as ${newStatus}.`
            });
        } catch (error: any) {
            toast({ title: "Error", description: error.message, variant: "destructive" });
        } finally {
            setIsRemovingPayment(null);
        }
    };

    const resetForm = () => {
        setSelectedUserId('');
        setNewName('');
        setNewUsername('');
        setNewEmail('');
        setNewRole('staff');
        setNewPhone('');
        setCreationMode('existing');
        setTempPassword('');
        setAllUsers([]);
    };

    const getRoleBadgeColor = (role: string) => {
        switch (role) {
            case 'admin': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
            case 'manager': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            default: return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300';
        }
    };

    const userOptions = allUsers.map(u => ({
        value: u.uid,
        label: u.displayName ? `${u.displayName} (${u.email})` : (u.email || u.uid),
    }));

    return (
        <div className="container mx-auto py-8">
            <div className="mb-6 flex items-center justify-between">
                <div>
                    {/* Title removed per request to rely on tab names */}
                </div>
                <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Employee</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={handleCreateEmployee} className="space-y-4">
                            <Tabs value={creationMode} onValueChange={(v: any) => {
                                setCreationMode(v);
                                if (v === 'new' && !tempPassword) {
                                    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$*';
                                    let pass = 'Candy-';
                                    for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                                    setTempPassword(pass);
                                }
                            }}>
                                <TabsList className="grid w-full grid-cols-2">
                                    <TabsTrigger value="existing">Existing User</TabsTrigger>
                                    <TabsTrigger value="new">Create New User</TabsTrigger>
                                </TabsList>
                            </Tabs>

                            {creationMode === 'existing' ? (
                                <>
                                    <div className="grid gap-2">
                                        <Label>Select User</Label>
                                        {isLoadingUsers ? (
                                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                Loading users...
                                            </div>
                                        ) : (
                                            <Combobox
                                                options={userOptions}
                                                value={selectedUserId}
                                                onChange={handleUserSelect}
                                                placeholder="Search for a user..."
                                                searchPlaceholder="Type name or email..."
                                                emptyMessage="No users found."
                                            />
                                        )}
                                    </div>
                                    {selectedUserId && (
                                        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
                                            <p><span className="text-muted-foreground">Name:</span> {newName || <span className="italic text-muted-foreground">No display name</span>}</p>
                                            <p><span className="text-muted-foreground">Email:</span> {newEmail}</p>
                                        </div>
                                    )}
                                </>
                            ) : (
                                <>
                                    <div className="grid gap-2">
                                        <Label>Name</Label>
                                        <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Full Name" required />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Email</Label>
                                        <Input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@example.com" required />
                                    </div>
                                    <div className="grid gap-2">
                                        <Label>Temporary Password</Label>
                                        <div className="flex gap-2">
                                            <div className="relative flex-1">
                                                <Input
                                                    type={showPassword ? "text" : "password"}
                                                    value={tempPassword}
                                                    readOnly
                                                    className="pr-10 font-mono"
                                                />
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    className="absolute right-0 top-0 h-full px-3"
                                                    onClick={() => setShowPassword(!showPassword)}
                                                >
                                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                                </Button>
                                            </div>
                                            <Button type="button" variant="outline" size="icon" onClick={() => {
                                                navigator.clipboard.writeText(tempPassword);
                                                toast({ title: "Copied", description: "Password copied to clipboard" });
                                            }}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                            <Button type="button" variant="outline" size="icon" onClick={() => {
                                                const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$*';
                                                let pass = 'Candy-';
                                                for (let i = 0; i < 8; i++) pass += chars.charAt(Math.floor(Math.random() * chars.length));
                                                setTempPassword(pass);
                                            }}>
                                                <RefreshCcw className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">Be sure to copy this password securely before submitting.</p>
                                    </div>
                                </>
                            )}
                            <div className="grid gap-2">
                                <Label>Username</Label>
                                <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="staff.username" />
                                <p className="text-xs text-muted-foreground">Optional. Stored in plain text at `staff/{'{uid}'}.username`.</p>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="phone">Phone (optional)</Label>
                                <Input id="phone" value={newPhone} onChange={e => setNewPhone(e.target.value)} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="role">Role</Label>
                                <Select value={newRole} onValueChange={(v: any) => setNewRole(v)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="staff">Staff</SelectItem>
                                        <SelectItem value="manager">Manager</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <DialogFooter>
                                <Button type="submit" disabled={isSubmitting || (creationMode === 'existing' && !selectedUserId) || (creationMode === 'new' && (!newName || !newEmail || !tempPassword))}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    Create Employee
                                </Button>
                            </DialogFooter>
                        </form>
                    </DialogContent>
                </Dialog>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-6 gap-1">
                    <TabsTrigger value="employees">
                        <User className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Employees</span>
                    </TabsTrigger>
                    <TabsTrigger value="stock">
                        <Package className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Staff Stock</span>
                    </TabsTrigger>
                    <TabsTrigger value="sentinel">
                        <Shield className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Sentinel Monitor</span>
                    </TabsTrigger>
                    <TabsTrigger value="chat">
                        <MessageSquare className="h-4 w-4 md:mr-2" />
                        <span className="hidden md:inline">Chat</span>
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="employees" className="space-y-6">
                    <div className="mb-4">
                        <h3 className="text-2xl font-semibold tracking-tight">Employees</h3>
                        <p className="text-sm text-muted-foreground">Manage your staff operations and accounts.</p>
                    </div>
                    {pendingEmployees.length > 0 && (
                        <Card className="border-amber-500/50 shadow-md">
                            <CardHeader className="pb-3 bg-amber-50/50 dark:bg-amber-950/20">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-amber-500" />
                                    <CardTitle className="text-amber-700 dark:text-amber-500">Pending Approvals</CardTitle>
                                </div>
                                <CardDescription>
                                    These staff members generated keys but require admin authorization to access the dashboard.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Registered</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {isLoadingPending ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-4">
                                                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            pendingEmployees.map((emp) => (
                                                <TableRow key={emp.id} className="bg-amber-50/30 dark:bg-amber-950/10">
                                                    <TableCell className="font-medium">
                                                        <div className="flex flex-col">
                                                            <span>{emp.name}</span>
                                                            <span className="text-xs text-muted-foreground">{emp.email}</span>
                                                        </div>
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                                                            Pending
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">
                                                        {new Date(emp.createdAt).toLocaleDateString()}
                                                        <PendingCountdown createdAt={emp.createdAt} />
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <div className="flex justify-end gap-2">
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                className="border-destructive/50 text-destructive hover:bg-destructive/10"
                                                                onClick={() => handleApprovalAction(emp.id, 'reject')}
                                                                disabled={isApproving[emp.id] === 'reject' || isApproving[emp.id] === 'approve'}
                                                            >
                                                                {isApproving[emp.id] === 'reject' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                                                                Reject
                                                            </Button>
                                                            <Button
                                                                size="sm"
                                                                className="bg-green-600 hover:bg-green-700 text-white"
                                                                onClick={() => handleApprovalAction(emp.id, 'approve')}
                                                                disabled={isApproving[emp.id] === 'reject' || isApproving[emp.id] === 'approve'}
                                                            >
                                                                {isApproving[emp.id] === 'approve' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                                                                Approve
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    {employees.some(e => e.status === 'rejected') && (
                        <Card className="border-destructive/30 shadow-md">
                            <CardHeader className="pb-3 bg-destructive/10">
                                <div className="flex items-center gap-2">
                                    <Shield className="h-5 w-5 text-destructive" />
                                    <CardTitle className="text-destructive">Rejected Registrations</CardTitle>
                                </div>
                                <CardDescription>
                                    These staff members were rejected. You can reset their registration to allow them to try again.
                                </CardDescription>
                            </CardHeader>
                            <CardContent className="p-0">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>User</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Registered</TableHead>
                                            <TableHead className="text-right">Action</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {employees.filter(e => e.status === 'rejected').map((emp) => (
                                            <TableRow key={emp.id} className="bg-destructive/5">
                                                <TableCell className="font-medium">
                                                    <div className="flex flex-col">
                                                        <span>{emp.name}</span>
                                                        <span className="text-xs text-muted-foreground">{emp.email}</span>
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="bg-destructive/20 text-destructive border-transparent">
                                                        Rejected
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(emp.createdAt).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        className="border-destructive/50 text-destructive hover:bg-destructive hover:text-destructive-foreground"
                                                        onClick={() => handleResetRegistration(emp.id)}
                                                        disabled={isApproving[emp.id] === 'reset'}
                                                    >
                                                        {isApproving[emp.id] === 'reset' ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <RefreshCcw className="h-4 w-4 mr-1" />}
                                                        Reset Registration
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </CardContent>
                        </Card>
                    )}

                    <Card>
                        <CardContent className="p-0 overflow-x-auto scroll-fade-x">
                            <Table>
                                <colgroup>
                                <col className="min-w-[140px]" />
                                    <col className="min-w-[140px]" />
                                    <col className="min-w-[80px]" />
                                    <col className="min-w-[160px]" />
                                    <col className="min-w-[80px]" />
                                    <col className="min-w-[200px]" />
                                    <col className="min-w-[90px]" />
                                    <col className="min-w-[50px]" />
                                </colgroup>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Username</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Payroll (Due / Paid / Total)</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead className="text-right">Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {isLoading ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-10">
                                                <Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
                                            </TableCell>
                                        </TableRow>
                                    ) : employees.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                                No staff members found. Add one to get started.
                                            </TableCell>
                                        </TableRow>
                                    ) : employees.filter(e => e.status !== 'rejected').length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                                                No active staff members.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        employees.filter(e => e.status !== 'rejected').map((employee) => (
                                            <TableRow key={employee.id} className={!employee.isActive ? 'opacity-50' : ''}>
                                                <TableCell className="font-medium">
                                                    <div className="flex items-center gap-2">
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                                            <User className="h-4 w-4 text-primary" />
                                                        </div>
                                                        {employee.name}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="font-mono text-sm text-muted-foreground">
                                                    {employee.username || 'Not set'}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`capitalize ${getRoleBadgeColor(employee.role)}`}>
                                                        {employee.role}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{employee.email}</TableCell>
                                                <TableCell>
                                                    <Badge variant={employee.isActive ? "default" : "secondary"}>
                                                        {employee.isActive ? 'Active' : 'Deactivated'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {isDecryptingPayroll ? (
                                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground inline-block" />
                                                    ) : (
                                                        <div className="flex flex-col gap-1 text-sm">
                                                            <div className="flex justify-between items-center w-full max-w-[180px]">
                                                                <span className="text-muted-foreground">Due:</span>
                                                                <span className={`font-mono font-semibold ${((staffPayrollMap[employee.id] || 0) - (staffPaidMap[employee.id] || 0)) < 0 ? 'text-red-500 font-bold' : 'text-blue-600 dark:text-blue-400'}`}>
                                                                    ${((staffPayrollMap[employee.id] || 0) - (staffPaidMap[employee.id] || 0)).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center w-full max-w-[180px]">
                                                                <span className="text-muted-foreground text-xs">Paid:</span>
                                                                <span className="font-mono text-xs text-green-600 dark:text-green-500">
                                                                    ${(staffPaidMap[employee.id] || 0).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            <div className="flex justify-between items-center w-full max-w-[180px]">
                                                                <span className="text-muted-foreground text-xs">Gross Earned:</span>
                                                                <span className="font-mono text-xs text-muted-foreground">
                                                                    ${((staffPayrollMap[employee.id] || 0) + (staffDebtMap[employee.id] || 0)).toFixed(2)}
                                                                </span>
                                                            </div>
                                                            {(staffDebtMap[employee.id] || 0) > 0 && (
                                                                <div className="flex justify-between items-center w-full max-w-[180px] border-t border-border/50 pt-1 mt-1">
                                                                    <span className="text-red-500/70 text-xs">Debts Accrued:</span>
                                                                    <span className="font-mono text-xs text-red-500">
                                                                        ${(staffDebtMap[employee.id] || 0).toFixed(2)}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground text-sm">
                                                    {new Date(employee.createdAt).toLocaleDateString()}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <div className="flex justify-end">
                                                        <DropdownMenu>
                                                            <DropdownMenuTrigger asChild>
                                                                <Button variant="ghost" size="icon">
                                                                    <span className="sr-only">Open menu</span>
                                                                    <MoreHorizontal className="h-4 w-4" />
                                                                </Button>
                                                            </DropdownMenuTrigger>
                                                            <DropdownMenuContent align="end">
                                                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                                                <DropdownMenuItem onClick={() => handleDeactivate(employee.id, employee.isActive)}>
                                                                    {employee.isActive ? <span className="text-destructive font-medium">Deactivate</span> : <span className="text-primary font-medium">Activate</span>}
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem onClick={() => handleMarkPaid(employee.id, employee.name)}>
                                                                    <DollarSign className="mr-2 h-4 w-4 text-green-600 dark:text-green-500" />
                                                                    Manage Payroll
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleAddDebt(employee.id, employee.name)}>
                                                                    <HandCoins className="mr-2 h-4 w-4 text-red-500" />
                                                                    Manage Debts
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => handleSetProfits(employee.id, employee.name, employee.profitPercent ?? 50)}>
                                                                    <Percent className="mr-2 h-4 w-4 text-blue-500" />
                                                                    Set Profit Split
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => handleSetUsername(employee.id, employee.name, employee.username)}
                                                                    disabled={user?.uid === employee.id && employee.role === 'admin'}
                                                                >
                                                                    <User className="mr-2 h-4 w-4 text-violet-500" />
                                                                    Set Username
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem onClick={() => {
                                                                    setRulesTargetId(employee.id);
                                                                    setRulesTargetName(employee.name);
                                                                }}>
                                                                    <Settings className="mr-2 h-4 w-4 text-orange-500" />
                                                                    Manage Rules
                                                                </DropdownMenuItem>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    onClick={() => handleResetSecurity(employee.id, employee.name)}
                                                                    className="text-amber-600 dark:text-amber-500 focus:text-amber-700 dark:focus:text-amber-400"
                                                                >
                                                                    <KeyRound className="mr-2 h-4 w-4" />
                                                                    Reset Security
                                                                </DropdownMenuItem>
                                                                <DropdownMenuItem
                                                                    onClick={() => handleSetExpiration(employee.id, employee.name)}
                                                                >
                                                                    <CalendarClock className="mr-2 h-4 w-4" />
                                                                    Set Expiration
                                                                </DropdownMenuItem>
                                                            </DropdownMenuContent>
                                                        </DropdownMenu>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="stock">
                    <InventoryAssignmentPanel soldMap={staffSoldMap} />
                </TabsContent>

                <TabsContent value="sentinel">
                    <AuthenticationRequired persistent={false} parentMasterPassword={authSession?.masterPassword} onAuthenticated={() => { }}>
                        <SentinelMonitorTab employees={employees} />
                    </AuthenticationRequired>
                </TabsContent>

                <TabsContent value="chat">
                    <AuthenticationRequired persistent={false} parentMasterPassword={authSession?.masterPassword} onAuthenticated={() => { }}>
                        <AdminChatPanel />
                    </AuthenticationRequired>
                </TabsContent>
            </Tabs>
            {/* Deactivate/Activate Confirmation Dialog */}
            <AlertDialog open={!!deactivateTarget} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            {deactivateTarget?.isActive ? 'Deactivate Employee?' : 'Re-activate Employee?'}
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {deactivateTarget?.isActive
                                ? 'This will prevent the employee from accessing staff features. You can re-activate them at any time.'
                                : 'This will restore the employee\'s access to staff features.'}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmDeactivate}
                            className={deactivateTarget?.isActive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : ''}
                        >
                            {deactivateTarget?.isActive ? 'Deactivate' : 'Re-activate'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Reset Security Confirmation Dialog */}
            <AlertDialog open={!!resetTarget} onOpenChange={(open) => { if (!open) setResetTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="text-amber-600 dark:text-amber-400">
                            ⚠️ Reset Security for {resetTarget?.name}?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-sm">
                                <p>This will permanently delete:</p>
                                <ul className="list-disc list-inside space-y-1 text-destructive">
                                    <li>Their master password &amp; encryption keys</li>
                                    <li>All current inventory assignments (unrecoverable)</li>
                                    <li>Their TOTP authenticator &amp; passkeys</li>
                                </ul>
                                <p className="font-medium mt-2">You must re-push inventory after they log in and set a new password.</p>
                            </div>
                        </AlertDialogDescription>
                        <div className="flex items-center space-x-2 mt-4">
                            <Checkbox
                                id="tempPassword"
                                checked={generateTempPassword}
                                onCheckedChange={(checked) => setGenerateTempPassword(checked as boolean)}
                            />
                            <Label htmlFor="tempPassword" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                                Generate and copy temporary password
                            </Label>
                        </div>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={confirmResetSecurity}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Reset Security
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Set Expiration Dialog */}
            <AlertDialog open={!!expirationTarget} onOpenChange={(open) => { if (!open) setExpirationTarget(null); }}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Set Password Expiration
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-4 pt-2 text-sm">
                                <p>
                                    Force <span className="font-semibold text-foreground">{expirationTarget?.name}</span> to change their master password after a specific number of days.
                                </p>
                                <div className="grid gap-2">
                                    <Label htmlFor="days">Require change every (days)</Label>
                                    <Input
                                        id="days"
                                        type="number"
                                        value={expirationDays}
                                        onChange={(e) => setExpirationDays(e.target.value)}
                                        min="0"
                                        className="w-full"
                                    />
                                    <p className="text-xs text-muted-foreground mt-1">Set to 0 to require a change immediately on their next login.</p>
                                </div>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={confirmSetExpiration}>
                            Save Policy
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Manage Payroll Dialog */}
            <Dialog open={!!payTarget} onOpenChange={(open) => { if (!open) setPayTarget(null); }}>
                <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Manage Payroll: {payTarget?.name}</DialogTitle>
                        <DialogDescription>
                            Record a payment made to this employee or revert previous payments. E2E encrypted.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                        {/* Record Payment Form */}
                        <form onSubmit={confirmMarkPaid} className="space-y-4 pt-2 border-b border-border pb-6">
                            <h4 className="text-sm font-semibold text-foreground/80 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Plus className="h-4 w-4" /> Add New Payment
                                </div>
                                <div className="text-xs font-normal">
                                    Due: <span className={`font-mono font-bold ${(payTarget?.balanceDue ?? 0) < 0 ? 'text-red-400' : 'text-blue-600 dark:text-blue-400'}`}>${(payTarget?.balanceDue || 0).toFixed(2)}</span>
                                </div>
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="amount">Amount ($)</Label>
                                    <Input
                                        id="amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={payAmount}
                                        onChange={(e) => setPayAmount(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="note">Note (Optional)</Label>
                                    <Input
                                        id="note"
                                        value={payNote}
                                        onChange={(e) => setPayNote(e.target.value)}
                                        placeholder="e.g., Venmo, Cash..."
                                    />
                                </div>
                            </div>
                            <Button type="submit" variant="secondary" className="w-full text-green-600 hover:text-green-700 bg-green-100/50 hover:bg-green-100 dark:bg-green-900/20 dark:hover:bg-green-900/40" disabled={isPaying || !payAmount || parseFloat(payAmount) <= 0}>
                                {isPaying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <DollarSign className="mr-2 h-4 w-4" />}
                                Record Payment
                            </Button>
                        </form>

                        {/* Payment List */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold flex items-center justify-between text-foreground/80">
                                <span>Recent Payments</span>
                                <Badge variant="outline" className="font-mono border-blue-200 text-blue-600 dark:border-blue-800 dark:text-blue-400">
                                    Total: ${(staffPaidMap[payTarget?.id || ''] || 0).toFixed(2)}
                                </Badge>
                            </h4>
                            {!staffPaymentsList[payTarget?.id || ''] || staffPaymentsList[payTarget?.id || ''].length === 0 ? (
                                <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-border/50">
                                    No payments recorded yet.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {staffPaymentsList[payTarget?.id || ''].map((payment) => (
                                        <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group">
                                            <div className="flex flex-col min-w-0 flex-1 mr-4">
                                                <div className="flex items-center gap-2">
                                                    <Badge
                                                        variant="outline"
                                                        className={`text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${payment.status === 'paid'
                                                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                                                            : 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800'
                                                            }`}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isRemovingPayment !== payment.id) handleTogglePaymentStatus(payment);
                                                        }}
                                                    >
                                                        {payment.status === 'paid' ? '✓ Paid' : '◯ Due'}
                                                    </Badge>
                                                    <span className={`font-mono font-semibold ${payment.amount < 0 ? 'text-amber-600 dark:text-amber-500' : 'text-blue-600 dark:text-blue-400'}`}>
                                                        {payment.amount < 0 ? '-' : ''}${Math.abs(payment.amount).toFixed(2)}
                                                    </span>
                                                    <span className="text-sm font-medium truncate">{payment.note}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                                    <CalendarClock className="h-3 w-3" />
                                                    {new Date(payment.date).toLocaleDateString()} {new Date(payment.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={isRemovingPayment === payment.id}
                                                onClick={() => handleRemovePayment(payment.id)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                                                title="Revert payment"
                                            >
                                                {isRemovingPayment === payment.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="mt-4 pt-2">
                        <Button type="button" variant="outline" className="w-full" onClick={() => setPayTarget(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage Debts Dialog */}
            <Dialog open={!!debtTarget} onOpenChange={(open) => { if (!open) setDebtTarget(null); }}>
                <DialogContent className="max-w-md max-h-[90vh] flex flex-col">
                    <DialogHeader>
                        <DialogTitle>Manage Debts: {debtTarget?.name}</DialogTitle>
                        <DialogDescription>
                            Add or remove debts/advances for this employee.
                            Debts are automatically subtracted from payroll due.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                        {/* Add Debt Form */}
                        <form onSubmit={confirmAddDebt} className="space-y-4 pt-2 border-b border-border pb-6">
                            <h4 className="text-sm font-semibold text-foreground/80 flex items-center gap-2">
                                <Plus className="h-4 w-4" /> Add New Debt
                            </h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="debt-amount">Amount ($)</Label>
                                    <Input
                                        id="debt-amount"
                                        type="number"
                                        step="0.01"
                                        min="0.01"
                                        required
                                        value={debtAmount}
                                        onChange={(e) => setDebtAmount(e.target.value)}
                                        placeholder="0.00"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="debt-note">Reason</Label>
                                    <Input
                                        id="debt-note"
                                        required
                                        value={debtNote}
                                        onChange={(e) => setDebtNote(e.target.value)}
                                        placeholder="e.g., Cash..."
                                    />
                                </div>
                            </div>
                            <Button type="submit" variant="secondary" className="w-full text-red-600 hover:text-red-700 bg-red-100/50 hover:bg-red-100 dark:bg-red-900/20 dark:hover:bg-red-900/40" disabled={isAddingDebt || !debtAmount || parseFloat(debtAmount) <= 0 || !debtNote}>
                                {isAddingDebt ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <HandCoins className="mr-2 h-4 w-4" />}
                                Record Debt
                            </Button>
                        </form>

                        {/* Debt List */}
                        <div className="space-y-4">
                            <h4 className="text-sm font-semibold flex items-center justify-between text-foreground/80">
                                <span>Current Debts</span>
                                <Badge variant="destructive" className="font-mono">
                                    Total: ${(staffDebtMap[debtTarget?.id || ''] || 0).toFixed(2)}
                                </Badge>
                            </h4>
                            {!staffDebtsList[debtTarget?.id || ''] || staffDebtsList[debtTarget?.id || ''].length === 0 ? (
                                <div className="text-center py-6 text-sm text-muted-foreground bg-muted/30 rounded-lg border border-border/50">
                                    No debts recorded.
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {staffDebtsList[debtTarget?.id || ''].map((debt) => (
                                        <div key={debt.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors group">
                                            <div className="flex flex-col min-w-0 flex-1 mr-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-red-500 font-semibold">${debt.amount.toFixed(2)}</span>
                                                    <span className="text-sm font-medium truncate">{debt.note}</span>
                                                </div>
                                                <span className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                                                    <CalendarClock className="h-3 w-3" />
                                                    {new Date(debt.date).toLocaleDateString()} {new Date(debt.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                disabled={isRemovingDebt === debt.id}
                                                onClick={() => handleRemoveDebt(debt.id)}
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity focus:opacity-100"
                                                title="Remove debt"
                                            >
                                                {isRemovingDebt === debt.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <Trash2 className="h-4 w-4" />
                                                )}
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                    <DialogFooter className="mt-4 pt-2">
                        <Button type="button" variant="outline" className="w-full" onClick={() => setDebtTarget(null)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Set Profit Split Dialog */}
            <Dialog open={!!profitTarget} onOpenChange={(open) => { if (!open) setProfitTarget(null); }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Set Profit Split</DialogTitle>
                        <DialogDescription>
                            Set the percentage of profit {profitTarget?.name} receives from their sales.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid grid-cols-4 items-center gap-4">
                            <Label htmlFor="profit-percent" className="text-right">
                                Percentage
                            </Label>
                            <div className="col-span-3 flex items-center gap-2">
                                <Input
                                    id="profit-percent"
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={profitPercent}
                                    onChange={(e) => setProfitPercent(e.target.value)}
                                    className="w-24"
                                />
                                <span className="text-muted-foreground">%</span>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setProfitTarget(null)}>Cancel</Button>
                        <Button onClick={confirmSetProfits}>Save Changes</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={!!usernameTarget} onOpenChange={(open) => { if (!open) { setUsernameTarget(null); setUsernameValue(''); } }}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Set Username</DialogTitle>
                        <DialogDescription>
                            Update the plain-text Candyman username for {usernameTarget?.name}.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="staff-username">Username</Label>
                            <Input
                                id="staff-username"
                                value={usernameValue}
                                onChange={(e) => setUsernameValue(e.target.value)}
                                placeholder="staff.username"
                            />
                            {user?.uid === usernameTarget?.id && (
                                <p className="text-xs text-muted-foreground">Admin users cannot assign a username to themselves.</p>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => { setUsernameTarget(null); setUsernameValue(''); }}>
                            Cancel
                        </Button>
                        <Button onClick={confirmSetUsername} disabled={isSavingUsername || !usernameValue.trim() || user?.uid === usernameTarget?.id}>
                            {isSavingUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Save Username
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Selling Rules Dialog */}
            {rulesTargetId && rulesTargetName && (
                <SellingRulesDialog
                    isOpen={!!rulesTargetId}
                    onOpenChange={(open) => {
                        if (!open) {
                            setRulesTargetId(null);
                            setRulesTargetName(null);
                        }
                    }}
                    employeeId={rulesTargetId}
                    employeeName={rulesTargetName}
                />
            )}
        </div>
    );
}
