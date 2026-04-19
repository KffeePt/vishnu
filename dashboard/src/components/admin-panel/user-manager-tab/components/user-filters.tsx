"use client";

import React from 'react';
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
import { Search, Filter, RefreshCw } from 'lucide-react';
import { UserStatus, UserRole } from '../user-manager-tab';

interface UserFiltersProps {
  searchQuery: string;
  statusFilter: UserStatus | "all";
  roleFilter: UserRole | "all";
  onSearch: (query: string) => void;
  onStatusFilter: (status: string) => void;
  onRoleFilter: (role: string) => void;
  onRefresh: () => void;
}

const UserFilters: React.FC<UserFiltersProps> = ({
  searchQuery,
  statusFilter,
  roleFilter,
  onSearch,
  onStatusFilter,
  onRoleFilter,
  onRefresh,
}) => {
  return (
    <>
      <div className="relative w-full md:w-80">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Buscar por nombre o email..."
          value={searchQuery}
          onChange={(e) => onSearch(e.target.value)}
          className="pl-8 sm:w-full"
        />
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <Button variant="outline" size="sm" onClick={onRefresh} className="h-8 gap-1">
          <RefreshCw className="h-3.5 w-3.5" />
          <span className="sr-only sm:not-sr-only">Refrescar</span>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 border-dashed">
              <Filter className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Estado ({statusFilter === 'all' ? 'Todos' : statusFilter})
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Filtrar por Estado</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={statusFilter} onValueChange={onStatusFilter}>
              <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="active">Activo</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="inactive">Inactivo</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="pending">Pendiente</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="suspended">Suspendido</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 border-dashed">
              <Filter className="h-3.5 w-3.5" />
              <span className="sr-only sm:not-sr-only sm:whitespace-nowrap">
                Rol ({roleFilter === 'all' ? 'Todos' : roleFilter})
              </span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuLabel>Filtrar por Rol</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup value={roleFilter} onValueChange={onRoleFilter}>
              <DropdownMenuRadioItem value="all">Todos</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="admin">Admin</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="manager">Manager</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="user">Usuario</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="chef">Chef</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="repartidor">Repartidor</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
};

export default UserFilters;