"use client";

import React, { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  BarChart3, DollarSign, Briefcase, Users, Database, Settings,
  Menu, Eye, EyeOff, Lock, LogOut, Home, User as UserIcon
} from "lucide-react";
import { useRouter } from 'next/navigation';
import { useAuthentication } from "@/hooks/use-authentication";
import { UserAuth } from "@/context/auth-context";
import Image from "next/image";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

interface AdminNavBarProps {
  activeTab: string;
  handleTabChange: (value: string) => void;
  isSimulatingAdmin: boolean;
  setIsSimulatingAdmin: (value: boolean) => void;
  showOwnerTabs: boolean;
  isOwner: boolean;
}

const AdminNavBar: React.FC<AdminNavBarProps> = ({
  activeTab,
  handleTabChange,
  isSimulatingAdmin,
  setIsSimulatingAdmin,
  showOwnerTabs,
  isOwner,
}) => {
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logoutSession } = useAuthentication();
  const { user, userClaims } = UserAuth();

  const handleLockSession = () => {
    sessionStorage.removeItem('vishnu_admin_session');
    sessionStorage.removeItem('vishnu_admin_master');
    window.location.reload();
  };

  const handleSignOut = async () => {
    await logoutSession();
    window.location.reload();
  };

  const ProfileIcon = () => {
    if (!user) return null;
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-pointer">
              {user.photoURL ? (
                <Image
                  src={user.photoURL}
                  alt={user.displayName || 'User profile picture'}
                  width={32}
                  height={32}
                  className="rounded-full h-8 w-8 object-cover ring-2 ring-primary/40"
                />
              ) : (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center ring-2 ring-primary/40">
                  <UserIcon className="h-5 w-5 text-primary" />
                </div>
              )}
            </div>
          </TooltipTrigger>
          <TooltipContent align="end">
            <p><strong>Nombre:</strong> {user.displayName || 'N/A'}</p>
            <p><strong>Email:</strong> {user.email || 'N/A'}</p>
            <p><strong>UID:</strong> {user.uid}</p>
            <p><strong>Rol:</strong> {userClaims?.admin || userClaims?.owner ? 'Admin' : 'Usuario'}</p>
            <p>
              <strong>Último inicio:</strong>{' '}
              {user?.metadata.lastSignInTime
                ? format(new Date(user.metadata.lastSignInTime), 'Pp', { locale: es })
                : 'N/A'}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  };

  return (
    <div className="flex flex-col md:flex-row justify-between items-center mb-3 gap-4">
      {/* Mobile Header: Hamburger + Title */}
      <div className="flex items-center gap-3 w-full md:w-auto">
        <div className="md:hidden flex">
          <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[280px] sm:w-[350px]">
              <SheetHeader className="mb-6 flex flex-row items-center justify-between">
                <SheetTitle>Admin Navigation</SheetTitle>
                <div className="mr-6">
                  <ProfileIcon />
                </div>
              </SheetHeader>
              <div className="flex flex-col gap-2">
                <Button variant={activeTab === 'overview' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('overview'); setMobileMenuOpen(false); }}>
                  <BarChart3 className="mr-2 h-4 w-4" /> Overview
                </Button>
                {showOwnerTabs && (
                  <>
                    <Button variant={activeTab === 'finances' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('finances'); setMobileMenuOpen(false); }}>
                      <DollarSign className="mr-2 h-4 w-4" /> Finances
                    </Button>
                    <Button variant={activeTab === 'staff' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('staff'); setMobileMenuOpen(false); }}>
                      <Briefcase className="mr-2 h-4 w-4" /> Staff
                    </Button>
                    <Button variant={activeTab === 'user-manager' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('user-manager'); setMobileMenuOpen(false); }}>
                      <Users className="mr-2 h-4 w-4" /> User Manager
                    </Button>
                    <Button variant={activeTab === 'data' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('data'); setMobileMenuOpen(false); }}>
                      <Database className="mr-2 h-4 w-4" /> Data
                    </Button>
                    <Button variant={activeTab === 'settings' ? 'secondary' : 'ghost'} className="justify-start w-full" onClick={() => { handleTabChange('settings'); setMobileMenuOpen(false); }}>
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </Button>
                  </>
                )}

                <div className="my-4 border-t border-border/50"></div>

                {isOwner && (
                  <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-lg border mb-2">
                    <Switch id="mobile-view-mode" checked={isSimulatingAdmin} onCheckedChange={setIsSimulatingAdmin} />
                    <Label htmlFor="mobile-view-mode" className="flex items-center gap-2 cursor-pointer flex-1">
                      {isSimulatingAdmin ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      <span className="text-sm font-medium">{isSimulatingAdmin ? "View as Admin" : "View as Owner"}</span>
                    </Label>
                  </div>
                )}

                <Button variant="outline" className="justify-start w-full" onClick={() => { handleLockSession(); setMobileMenuOpen(false); }}>
                  <Lock className="mr-2 h-4 w-4" /> Lock Session
                </Button>
                <Button variant="destructive" className="justify-start w-full" onClick={() => { handleSignOut(); setMobileMenuOpen(false); }}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign Out
                </Button>
                <Button variant="outline" className="justify-start w-full" onClick={() => { router.push('/'); setMobileMenuOpen(false); }}>
                  <Home className="mr-2 h-4 w-4" /> Go Home
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
        <div className="flex flex-col">
              <h1 className="text-2xl md:text-3xl font-bold">Vishnu Control Center</h1>
          <span className="text-sm text-muted-foreground md:hidden capitalize">{activeTab.replace('-', ' ')}</span>
        </div>
      </div>

      {/* Desktop Header Buttons */}
      <div className="hidden md:flex items-center gap-2 lg:gap-4 flex-wrap justify-end">
        {/* User Profile Icon */}
        <ProfileIcon />

        {/* View Switcher for Owners */}
        {isOwner && (
          <div className="flex items-center space-x-2 bg-muted/50 p-2 rounded-lg border">
            <Switch
              id="view-mode"
              checked={isSimulatingAdmin}
              onCheckedChange={setIsSimulatingAdmin}
            />
            <Label htmlFor="view-mode" className="flex items-center gap-2 cursor-pointer">
              {isSimulatingAdmin ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span className="text-sm font-medium">
                {isSimulatingAdmin ? "View as Admin" : "View as Owner"}
              </span>
            </Label>
          </div>
        )}

        {/* Lock Session Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLockSession}
          className="flex items-center gap-2"
        >
          <Lock className="w-4 h-4" />
          Lock Session
        </Button>

        {/* Sign Out Button */}
        <Button
          variant="destructive"
          size="sm"
          onClick={handleSignOut}
          className="flex items-center gap-2"
        >
          <LogOut className="w-4 h-4" />
          Sign Out
        </Button>

        {/* Go Home Button */}
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push('/')}
          className="flex items-center gap-2"
        >
          <Home className="w-4 h-4" />
          Go Home
        </Button>
      </div>
    </div>
  );
};

export default AdminNavBar;
