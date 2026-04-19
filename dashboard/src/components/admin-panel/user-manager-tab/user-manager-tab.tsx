"use client";

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useLongPress } from '@/hooks/use-long-press';
import { UserAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import UserHeader from './components/user-header';
import UserFilters from './components/user-filters';
import UserTable from './components/user-table';
import UserDialogs from './components/user-dialogs';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

// Define User Type
export type UserRole = 'user' | 'manager' | 'admin' | 'chef' | 'repartidor' | 'doctor' | 'patient';
export type UserStatus = 'active' | 'inactive' | 'pending' | 'suspended';

export interface UserActivity {
  action: string;
  date: string;
  description: string;
}

export interface LocationCoords {
  latitude: number | null;
  longitude: number | null;
}

export interface User {
  id: string;
  name: string;
  email: string | null;
  avatar?: string | null;
  role: UserRole;
  status: UserStatus;
  phone?: string | null;
  location?: string | null;
  deliveryAddress?: string | null;
  coordinates?: LocationCoords | null;
  joinDate: string;
  bio?: string | null;
  activity?: UserActivity[];
  creationTime?: string;
  lastSignInTime?: string;
  disabled?: boolean;
  customClaims?: { [key: string]: any };
}

interface AccessAttempt {
  id: string;
  userId: string;
  email: string | null;
  page: string;
  action: string;
  timestamp: { seconds: number; nanoseconds: number };
  attemptedBy: string;
  ip: string;
  userAgent: string;
}

export default function UserManagerTab() {
  const [users, setUsers] = useState<User[]>([]);
  const [accessAttempts, setAccessAttempts] = useState<AccessAttempt[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [sortConfig, setSortConfig] = useState<{ key: keyof User | null; direction: 'ascending' | 'descending' }>({ key: 'name', direction: 'ascending' });
  const [selectedUserForDetails, setSelectedUserForDetails] = useState<User | null>(null);
  const [isUserDetailsOpen, setIsUserDetailsOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessAttemptsLoading, setAccessAttemptsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { user, getIDToken } = UserAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ x: number; y: number } | null>(null);
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const fetchUsers = useCallback(async () => {
    if (!user) {
      setError("Por favor, inicia sesión para ver los usuarios.");
      setUsers([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const token = await getIDToken();
      const response = await fetch('/api/admin/users', {
        headers: { 'Authorization': `Bearer ${token}` },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Error de API: ${response.statusText} (${response.status})`);
      }

      const data = await response.json();
      const formattedUsers: User[] = data.users.map((apiUser: any) => {
        const firestoreData = apiUser.firestoreData;
        return {
          id: apiUser.uid,
          name: apiUser.displayName || 'Sin Nombre',
          email: apiUser.email || null,
          avatar: firestoreData ? (firestoreData.photoURL || apiUser.photoURL || null) : (apiUser.photoURL || null),
          role: apiUser.customClaims?.role || 'user',
          status: apiUser.customClaims?.status || (firestoreData ? firestoreData.status : null) || (apiUser.disabled ? 'inactive' : 'active'),
          phone: firestoreData ? (firestoreData.mobileNumber || firestoreData.phone || '') : '',
          location: firestoreData ? (firestoreData.deliveryAddress || firestoreData.location || '') : '',
          deliveryAddress: firestoreData ? (firestoreData.deliveryAddress || null) : null,
          coordinates: firestoreData ? (
            (firestoreData.location && typeof firestoreData.location.latitude === 'number' && typeof firestoreData.location.longitude === 'number')
              ? { latitude: firestoreData.location.latitude, longitude: firestoreData.location.longitude }
              : (firestoreData.ubicacion && typeof firestoreData.ubicacion.latitude === 'number' && typeof firestoreData.ubicacion.longitude === 'number')
                ? { latitude: firestoreData.ubicacion.latitude, longitude: firestoreData.ubicacion.longitude }
                : null
          ) : null,
          bio: firestoreData ? (firestoreData.bio || '') : '',
          joinDate: apiUser.metadata?.creationTime
            ? format(new Date(apiUser.metadata.creationTime), 'PPP', { locale: es })
            : 'N/D',
          creationTime: apiUser.metadata?.creationTime,
          lastSignInTime: apiUser.metadata?.lastSignInTime,
          disabled: apiUser.disabled || false,
          customClaims: apiUser.customClaims,
        };
      });
      setUsers(formattedUsers);
    } catch (err: any) {
      console.error("Error al obtener usuarios:", err);
      setError(`Fallo al cargar usuarios: ${err.message || 'Error desconocido'}`);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [user, getIDToken]);

  const fetchAccessAttempts = useCallback(async () => {
    if (!user) return;
    setAccessAttemptsLoading(true);

    try {
      const token = await getIDToken();
      const response = await fetch('/api/admin/logging/access-attempts', {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setAccessAttempts(data.attempts || []);
      }
    } catch (err) {
      console.error("Error fetching access attempts:", err);
    } finally {
      setAccessAttemptsLoading(false);
    }
  }, [user, getIDToken]);

  useEffect(() => {
    if (user) {
      fetchUsers();
      fetchAccessAttempts();
    }
  }, [user, fetchUsers, fetchAccessAttempts]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsContextMenuOpen(false);
        setActiveMenuUserId(null);
        setMenuPosition(null);
      }
    };

    if (isContextMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isContextMenuOpen]);

  const filteredUsers = useMemo(() => {
    let filtered = users.filter(user => {
      const searchMatch = !searchQuery ||
        user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (user.email && user.email.toLowerCase().includes(searchQuery.toLowerCase()));
      const statusMatch = statusFilter === "all" || user.status === statusFilter;
      const roleMatch = roleFilter === "all" || user.role === roleFilter;
      return searchMatch && statusMatch && roleMatch;
    });

    if (sortConfig.key) {
      filtered.sort((a, b) => {
        const aValue = a[sortConfig.key!];
        const bValue = b[sortConfig.key!];
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        if (bValue == null) return -1;
        let comparison = 0;
        if (typeof aValue === 'string' && typeof bValue === 'string') {
          comparison = aValue.localeCompare(bValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
          comparison = aValue - bValue;
        }
        return sortConfig.direction === 'ascending' ? comparison : -comparison;
      });
    }
    return filtered;
  }, [users, searchQuery, statusFilter, roleFilter, sortConfig]);

  const handleSort = (key: keyof User) => {
    let direction: 'ascending' | 'descending' = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleLongPress = useCallback((userId: string) => {
    const userFound = users.find(u => u.id === userId);
    if (userFound) {
      setSelectedUserForDetails(userFound);
      setIsUserDetailsOpen(true);
      setIsContextMenuOpen(false);
      setActiveMenuUserId(null);
      setMenuPosition(null);
    }
  }, [users]);

  const handleRowContextMenu = useCallback((event: React.MouseEvent<HTMLTableRowElement>, userId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const { clientX: x, clientY: y } = event;
    setMenuPosition({ x, y });
    setActiveMenuUserId(userId);
    setIsContextMenuOpen(true);
  }, []);

  const handleStatusChange = useCallback(async (userId: string, newStatus: UserStatus) => {
    setUsers(currentUsers =>
      currentUsers.map(u => (u.id === userId ? { ...u, status: newStatus } : u))
    );
    setIsContextMenuOpen(false);

    try {
      const token = await getIDToken();
      const response = await fetch(`/api/admin/users/manage/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      toast({ title: "Estado Actualizado" });
    } catch (err) {
      toast({ title: "Error al Cambiar Estado", variant: "destructive" });
      fetchUsers();
    }
  }, [getIDToken, toast, fetchUsers]);

  const handleRoleChange = useCallback(async (userId: string, newRole: UserRole) => {
    setUsers(currentUsers =>
      currentUsers.map(u => (u.id === userId ? { ...u, role: newRole } : u))
    );
    setIsContextMenuOpen(false);

    try {
      const token = await getIDToken();
      const response = await fetch(`/api/admin/users/manage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId, updates: { role: newRole } }),
      });
      if (!response.ok) throw new Error('Failed to update role');
      toast({ title: "Rol Actualizado" });
    } catch (err) {
      toast({ title: "Error al Cambiar Rol", variant: "destructive" });
      fetchUsers();
    }
  }, [getIDToken, toast, fetchUsers]);

  const handleUserDetailsUpdate = useCallback(async (updatedUser: User) => {
    setUsers(currentUsers =>
      currentUsers.map(u => (u.id === updatedUser.id ? { ...u, ...updatedUser } : u))
    );

    try {
      const token = await getIDToken();
      const updatesToSend = {
        displayName: updatedUser.name,
        role: updatedUser.role,
        status: updatedUser.status,
        firestoreData: {
          mobileNumber: updatedUser.phone,
          deliveryAddress: updatedUser.deliveryAddress,
          bio: updatedUser.bio,
          location: {
            latitude: (updatedUser.location as unknown as LocationCoords)?.latitude ?? null,
            longitude: (updatedUser.location as unknown as LocationCoords)?.longitude ?? null,
          },
        }
      };
      const response = await fetch(`/api/admin/users/manage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: updatedUser.id, updates: updatesToSend }),
      });
      if (!response.ok) throw new Error('Failed to update user details');
      toast({ title: "Detalles Actualizados" });
      setIsUserDetailsOpen(false);
    } catch (err) {
      toast({ title: "Error al Actualizar", variant: "destructive" });
      fetchUsers();
    }
  }, [getIDToken, toast, fetchUsers]);

  const handleDeleteUser = useCallback(async () => {
    if (!userToDelete) return;
    setIsDeleting(true);

    try {
      const token = await getIDToken();
      const response = await fetch(`/api/admin/users/manage`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ userId: userToDelete.id }),
      });
      if (!response.ok) throw new Error('Failed to delete user');
      toast({ title: "Usuario Eliminado" });
      setUsers(currentUsers => currentUsers.filter(u => u.id !== userToDelete.id));
      setIsDeleteDialogOpen(false);
    } catch (err) {
      toast({ title: "Error al Eliminar", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  }, [userToDelete, getIDToken, toast]);

  const handleDeleteRequest = useCallback((userId: string) => {
    const userFound = users.find(u => u.id === userId);
    if (userFound) {
      setUserToDelete(userFound);
      setIsDeleteDialogOpen(true);
      setIsContextMenuOpen(false);
    }
  }, [users]);

  if (loading) {
    return (
      <div className="space-y-6 p-4 border rounded-lg">
        <div className="flex justify-between items-center">
          <Skeleton className="h-8 w-1/3" />
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="rounded-md border">
          {/* Skeleton Table */}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>No se pudieron cargar los usuarios.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-destructive">{error}</p>
          <Button onClick={() => fetchUsers()} className="mt-4">Reintentar</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4 border rounded-lg">
      <UserHeader userCount={filteredUsers.length} />
      <Tabs defaultValue="users" className="w-full">
        <TabsList>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="activity">Activity Messages</TabsTrigger>
        </TabsList>
        <TabsContent value="users">
          <div className="space-y-6">
            <UserFilters
              searchQuery={searchQuery}
              statusFilter={statusFilter}
              roleFilter={roleFilter}
              onSearch={setSearchQuery}
              onStatusFilter={(status) => setStatusFilter(status as UserStatus | "all")}
              onRoleFilter={(role) => setRoleFilter(role as UserRole | "all")}
              onRefresh={() => { fetchUsers(); fetchAccessAttempts(); }}
            />
            <UserTable
              users={filteredUsers}
              isMobile={isMobile}
              sortConfig={sortConfig}
              activeMenuUserId={activeMenuUserId}
              menuPosition={menuPosition}
              menuRef={menuRef}
              isContextMenuOpen={isContextMenuOpen}
              onSort={handleSort}
              onRowContextMenu={handleRowContextMenu}
              onRowLongPress={handleLongPress}
              onStatusChange={handleStatusChange}
              onRoleChange={handleRoleChange}
              setIsContextMenuOpen={setIsContextMenuOpen}
              setActiveMenuUserId={setActiveMenuUserId}
              setMenuPosition={setMenuPosition}
            />
          </div>
        </TabsContent>
        <TabsContent value="activity">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-semibold">Access Attempts</h3>
              <Button onClick={fetchAccessAttempts} disabled={accessAttemptsLoading}>
                {accessAttemptsLoading ? 'Loading...' : 'Refresh'}
              </Button>
            </div>
            {accessAttemptsLoading ? (
              <div className="flex justify-center py-8">
                <Skeleton className="h-6 w-48" />
              </div>
            ) : accessAttempts.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No access attempts recorded yet.
              </div>
            ) : (
              <div className="space-y-3">
                {accessAttempts.map((attempt: AccessAttempt) => (
                  <Card key={attempt.id}>
                    <CardContent className="pt-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold">{attempt.action}</h4>
                          <p className="text-sm text-muted-foreground">
                            User: {attempt.email || attempt.userId}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Page: {attempt.page} | IP: {attempt.ip}
                          </p>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {new Date(attempt.timestamp.seconds * 1000).toLocaleString()}
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        </TabsContent>
        <UserDialogs
          selectedUserForDetails={selectedUserForDetails}
          isUserDetailsOpen={isUserDetailsOpen}
          isDeleteDialogOpen={isDeleteDialogOpen}
          userToDelete={userToDelete}
          isDeleting={isDeleting}
          onUserDetailsOpenChange={setIsUserDetailsOpen}
          onUserUpdate={handleUserDetailsUpdate}
          onDeleteRequest={handleDeleteRequest}
          onDeleteConfirm={handleDeleteUser}
          onDeleteCancel={() => setIsDeleteDialogOpen(false)}
        />
      </Tabs>
    </div>
  );
}
