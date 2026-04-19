"use client";

import React, { useMemo, useEffect, useState } from 'react';
import { useIsMobile } from "@/hooks/use-mobile";
import { Settings, Database, Users, DollarSign, BarChart3, Briefcase, ShieldAlert, LogOut, Eye, EyeOff, Lock, Plus, UserPlus, Package, MessageSquare, Download, DatabaseBackup, Upload, RefreshCw, Home, Menu } from "lucide-react";
import StarField from "@/components/ui/star-field";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import DataTab from "@/components/admin-panel/data-tab/data-tab";
import UserManagerHub from "@/components/admin-panel/user-manager-tab/user-manager-hub";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import SettingsTab from "@/components/admin-panel/settings-tab/settings-tab";
import FinancesTab from "@/components/admin-panel/finances-tab/finances-tab";
import OverviewTab from "@/components/admin-panel/overview-tab/overview-tab";
import InventoryOverviewTab from "@/components/admin-panel/inventory-overview-tab/inventory-overview-tab";
import StaffTab from "@/components/admin-panel/staff-tab/staff-tab";
import AdminNavBar from "@/components/admin-panel/admin-navbar";
import { BackupRestoreDialog } from "@/components/admin-panel/backup-restore-dialog";
import { AddItemDialog } from "@/components/admin-panel/inventory-management-tab/add-item-dialog";
import { AdminCraftingDialog } from "@/components/admin-panel/inventory-management-tab/admin-crafting-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { UserAuth } from "@/context/auth-context";
import { AuthenticationRequired } from "@/components/admin-panel/authentication-tab/authentication-required";
import { useMasterPassword } from "@/hooks/use-master-password";
import { useAuthentication } from "@/hooks/use-authentication";
import { useSessionGuard } from "@/hooks/use-session-guard";
import { SessionStaleDialog } from "@/components/ui/session-stale-dialog";
import { SessionReauthDialog } from "@/components/ui/session-reauth-dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { haptics } from '@/lib/haptics';

interface AdminPanelProps {
  className?: string;
}

const AdminPanel: React.FC<AdminPanelProps> = ({ className }) => {
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, userClaims, getIDToken } = UserAuth();

  // Auth state
  const { authSession, handleAuthenticated, isMasterPasswordSet } = useMasterPassword();
  const { logoutSession } = useAuthentication();

  // View switch state
  const [isSimulatingAdmin, setIsSimulatingAdmin] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sub-tab tracking
  const [staffActiveSubTab, setStaffActiveSubTab] = useState('employees');
  const { toast } = useToast();

  const [financesMasterPassword, setFinancesMasterPassword] = useState('');

  const handleLockSession = () => {
    sessionStorage.removeItem('vishnu_admin_session');
    sessionStorage.removeItem('vishnu_admin_master');
    window.location.reload();
  };

  useSessionGuard({
    onLockSession: handleLockSession,
    panelName: 'Panel de Administración'
  });

  // Check for explicit 5-minute session cookie expiration
  useEffect(() => {
    if (!user) {
      const hasMasterPw = sessionStorage.getItem('vishnu_admin_master');
      if (hasMasterPw) {
        sessionStorage.removeItem('vishnu_admin_session');
        sessionStorage.removeItem('vishnu_admin_master');
        toast({
          title: "Sesión expirada por seguridad",
          description: "Han pasado más de 5 minutos desde tu último inicio de sesión. Por motivos de seguridad de la bóveda, debes volver a autenticarte.",
          variant: "destructive",
          duration: 10000
        });
        setTimeout(() => window.location.reload(), 2000);
      }
    }
  }, [user, toast]);

  /* 
   * Valid tabs configuration:
   * Owner: all tabs
   * Admin: overview, finances (ONLY)
   * 
   * Note: We are consolidating "users", "claims", and "staff-inventory" into "user-manager" for Owners.
   */
  const validTabs = ["overview", "finances", "staff", "user-manager", "data", "settings"];
  const currentTab = searchParams.get('tab');

  // Check claims
  const isOwner = userClaims?.owner === true;
  const isAdmin = userClaims?.admin === true;

  // If not authenticated via master password, show gate
  if (!authSession) {
    return (
      <div className='fixed inset-0 z-50 flex flex-col items-center justify-center bg-background p-4'>
        <div className="w-full max-w-2xl space-y-8">
          <h1 className="text-3xl font-bold text-center">Vishnu Control Center</h1>
          <AuthenticationRequired
            onAuthenticated={handleAuthenticated}
            isMasterPasswordSet={isMasterPasswordSet}
            effectiveRole={isOwner ? { role: 'owner' } : isAdmin ? { role: 'admin' } : { role: 'staff' }}
          />
        </div>
      </div>
    );
  }

  // Determine effective role based on simulation
  const showOwnerTabs = isOwner && !isSimulatingAdmin;

  // Default tab logic
  let defaultTab = "overview"; // Both roles have overview

  // If current tab is not allowed for the user, fallback to default
  let activeTab = currentTab && validTabs.includes(currentTab) ? currentTab : defaultTab;

  // Restrict Admin access (or simulated admin) to only the Overview tab
  if ((!isOwner && isAdmin) || isSimulatingAdmin) {
    if (activeTab !== 'overview') {
      activeTab = 'overview';
    }
  }

  const handleTabChange = (value: string) => {
    if (isMobile) haptics.tap();
    router.push(`${pathname}?tab=${value}`);
  };

  const handleSignOut = async () => {
    await logoutSession();
    window.location.reload();
  };

  return (
    <div className='max-w-7xl w-full px-4 md:px-8 pt-6 pb-8 relative z-10 mx-auto'>
      <StarField />
      <BackupRestoreDialog />
      <AddItemDialog sessionToken={authSession?.token} />
      <AdminCraftingDialog />

      <AdminNavBar
        activeTab={activeTab}
        handleTabChange={handleTabChange}
        isSimulatingAdmin={isSimulatingAdmin}
        setIsSimulatingAdmin={setIsSimulatingAdmin}
        showOwnerTabs={showOwnerTabs}
        isOwner={isOwner}
      />

      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="hidden md:flex flex-wrap justify-center h-auto gap-2 bg-transparent">

          {/* COMMON TABS (Admin & Owner) */}
          <TabsTrigger value="overview" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            <BarChart3 className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">Overview</span>
          </TabsTrigger>

          {/* Hidden from Admins per request, Owner only */}
          {showOwnerTabs && (
            <TabsTrigger value="finances" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              <DollarSign className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Finances</span>
            </TabsTrigger>
          )}

          {/* OWNER ONLY TABS (Hidden when simulating admin) */}
          {showOwnerTabs && (
            <>
              <TabsTrigger value="staff" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Briefcase className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Staff</span>
              </TabsTrigger>

              <TabsTrigger value="user-manager" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Users className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">User Manager</span>
              </TabsTrigger>

              <TabsTrigger value="data" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Database className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Data</span>
              </TabsTrigger>

              <TabsTrigger value="settings" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                <Settings className="h-4 w-4 md:mr-2" />
                <span className="hidden md:inline">Settings</span>
              </TabsTrigger>
            </>
          )}
        </TabsList>

        <div className="mt-3">
          <TabsContent value="overview" className="w-full space-y-6">
            <OverviewTab masterPassword={authSession?.masterPassword} />
            <InventoryOverviewTab />
          </TabsContent>

          {showOwnerTabs && (
            <>
              <TabsContent value="finances" className="w-full">
                <FinancesTab masterPassword={financesMasterPassword || authSession?.masterPassword || ''} />
              </TabsContent>

              <TabsContent value="staff" className="w-full">
                <StaffTab onSubTabChange={setStaffActiveSubTab} />
              </TabsContent>

              <TabsContent value="user-manager" className="w-full">
                <UserManagerHub />
              </TabsContent>

              <div
                key="data-tab"
                role="tabpanel"
                data-state={activeTab === 'data' ? 'active' : 'inactive'}
                className={activeTab === 'data' ? 'w-full mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2' : 'hidden'}
              >
                <DataTab parentMasterPassword={authSession?.masterPassword} />
              </div>

              <TabsContent value="settings" className="w-full">
                <SettingsTab />
              </TabsContent>
            </>
          )}
        </div>
      </Tabs>

      {/* Floating Action Button rendering logic */}
      {(() => {
        const hasActions = ["overview", "finances", "staff", "user-manager", "data", "settings"].includes(activeTab);
        if (!hasActions) return null;

        let isLocked = false;
        if (activeTab === "finances" && !authSession?.masterPassword) isLocked = true;
        if (activeTab === "staff" && !authSession?.masterPassword) isLocked = true;
        if (activeTab === "data" && !authSession?.masterPassword) isLocked = true;
        if (activeTab === "user-manager" && !authSession?.masterPassword) isLocked = true;

        if (isLocked) {
          return (
            <div className="fixed bottom-6 right-6 z-50">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    className="h-14 w-14 rounded-full shadow-lg bg-muted text-muted-foreground hover:bg-primary hover:text-primary-foreground transition-all duration-300"
                  >
                    <Lock className="h-5 w-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={8}>
                  <DropdownMenuItem disabled className="opacity-100 cursor-default flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span className="font-medium text-sm">Authenticate to see options</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        }

        return (
          <div className="fixed bottom-6 right-6 z-50">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  className="h-14 w-14 rounded-full shadow-lg bg-primary hover:bg-primary/90 text-primary-foreground transition-all duration-300 hover:scale-105"
                >
                  <Plus className="h-6 w-6" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8}>
                {activeTab === 'staff' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('open-add-staff-dialog'))}
                      className="cursor-pointer py-2"
                    >
                      <UserPlus className="mr-2 h-4 w-4" />
                      <span>Add Staff Member</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('open-add-item-dialog'))}
                      className="cursor-pointer py-2"
                    >
                      <Package className="mr-2 h-4 w-4" />
                      <span>Items and Recipes</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('open-admin-crafting-dialog'))}
                      className="cursor-pointer py-2"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      <span>Crafting Bench</span>
                    </DropdownMenuItem>
                    {staffActiveSubTab === 'stock' && (
                      <DropdownMenuItem
                        onClick={() => window.dispatchEvent(new CustomEvent('trigger-force-push-all'))}
                        className="cursor-pointer py-2 text-primary font-medium"
                      >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        <span>Force Push All Inventory</span>
                      </DropdownMenuItem>
                    )}
                    {staffActiveSubTab === 'chat' && (
                      <DropdownMenuItem
                        onClick={() => window.dispatchEvent(new CustomEvent('trigger-clear-chat', { detail: { clearAll: true } }))}
                        className="cursor-pointer py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                      >
                        <MessageSquare className="mr-2 h-4 w-4" />
                        <span>Clear All Messages</span>
                      </DropdownMenuItem>
                    )}
                  </>
                )}
                {activeTab === 'overview' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => {
                        window.dispatchEvent(new CustomEvent('open-add-item-dialog'));
                      }}
                      className="cursor-pointer py-2"
                    >
                      <Package className="mr-2 h-4 w-4" />
                      <span>Items and Recipes</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('open-admin-crafting-dialog'))}
                      className="cursor-pointer py-2"
                    >
                      <RefreshCw className="mr-2 h-4 w-4" />
                      <span>Crafting Bench</span>
                    </DropdownMenuItem>
                  </>
                )}
                {activeTab === 'finances' && (
                  <DropdownMenuItem
                    onClick={() => toast({ title: "Coming Soon", description: "Exporting financial reports is not yet available." })}
                    className="cursor-pointer py-2"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    <span>Export Report</span>
                  </DropdownMenuItem>
                )}
                {activeTab === 'data' && (
                  <>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('trigger-backup-database'))}
                      className="cursor-pointer py-2"
                    >
                      <DatabaseBackup className="mr-2 h-4 w-4" />
                      <span>Backup Database</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => window.dispatchEvent(new CustomEvent('trigger-restore-database'))}
                      className="cursor-pointer py-2 text-destructive focus:bg-destructive/10 focus:text-destructive"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      <span>Restore Database</span>
                    </DropdownMenuItem>
                  </>
                )}
                {activeTab === 'user-manager' && (
                  <DropdownMenuItem
                    onClick={() => toast({ title: "Coming Soon", description: "User management actions will be added." })}
                    className="cursor-pointer py-2"
                  >
                    <UserPlus className="mr-2 h-4 w-4" />
                    <span>Add User</span>
                  </DropdownMenuItem>
                )}
                {activeTab === 'settings' && (
                  <DropdownMenuItem
                    onClick={() => window.location.reload()}
                    className="cursor-pointer py-2"
                  >
                    <RefreshCw className="mr-2 h-4 w-4" />
                    <span>Refresh Settings</span>
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      })()}
      <SessionReauthDialog mode="admin" />
      <SessionStaleDialog />
    </div>
  );
};
export default AdminPanel;
