"use client";

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ArrowUpDown, User as UserIcon } from 'lucide-react';
import { User } from '../user-manager-tab';
import UserTableRow from './user-table-row';

interface UserTableProps {
  users: User[];
  isMobile: boolean;
  sortConfig: { key: keyof User | null; direction: 'ascending' | 'descending' };
  activeMenuUserId: string | null;
  menuPosition: { x: number; y: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isContextMenuOpen: boolean;
  onSort: (key: keyof User) => void;
  onRowContextMenu: (event: React.MouseEvent<HTMLTableRowElement>, userId: string) => void;
  onRowLongPress: (userId: string) => void;
  onStatusChange: (userId: string, newStatus: any) => void;
  onRoleChange: (userId: string, newRole: any) => void;
  setIsContextMenuOpen: (open: boolean) => void;
  setActiveMenuUserId: (id: string | null) => void;
  setMenuPosition: (pos: { x: number; y: number } | null) => void;
}

const UserTable: React.FC<UserTableProps> = ({
  users,
  isMobile,
  sortConfig,
  activeMenuUserId,
  menuPosition,
  menuRef,
  isContextMenuOpen,
  onSort,
  onRowContextMenu,
  onRowLongPress,
  onStatusChange,
  onRoleChange,
  setIsContextMenuOpen,
  setActiveMenuUserId,
  setMenuPosition,
}) => {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px] text-center pr-0 "><span className="md:hidden"><UserIcon className="h-5 w-5 mx-auto" /></span><span className="hidden md:inline">Usuario</span></TableHead>
            <TableHead className="md:w-4"></TableHead>
            <TableHead className="sm:w-full  md:w-auto text-center"><Button variant="ghost" onClick={() => onSort("name")} className="p-0 font-medium hover:bg-transparent group">Nombre <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 group-hover:opacity-100" /></Button></TableHead>
            <TableHead className="hidden md:table-cell text-center"><Button variant="ghost" onClick={() => onSort("email")} className="p-0 font-medium hover:bg-transparent group">Email <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 group-hover:opacity-100" /></Button></TableHead>
            <TableHead className="hidden lg:table-cell text-center"><Button variant="ghost" onClick={() => onSort("role")} className="p-0 font-medium hover:bg-transparent group">Rol <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 group-hover:opacity-100" /></Button></TableHead>
            <TableHead className='text-center'><Button variant="ghost" onClick={() => onSort("status")} className="p-0 font-medium hover:bg-transparent group">Estado <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 group-hover:opacity-100" /></Button></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className='items-start'>
          {users.length === 0 ? (
            <TableRow>
              <TableCell colSpan={6} className="h-24 text-center">
                No se encontraron usuarios con los filtros actuales.
              </TableCell>
            </TableRow>
          ) : (
            users.map(user => (
              <UserTableRow
                key={user.id}
                user={user}
                isMobile={isMobile}
                activeMenuUserId={activeMenuUserId}
                menuPosition={menuPosition}
                menuRef={menuRef}
                isContextMenuOpen={isContextMenuOpen}
                onRowContextMenu={onRowContextMenu}
                onRowLongPress={onRowLongPress}
                onStatusChange={onStatusChange}
                onRoleChange={onRoleChange}
                setIsContextMenuOpen={setIsContextMenuOpen}
                setActiveMenuUserId={setActiveMenuUserId}
                setMenuPosition={setMenuPosition}
              />
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
};

export default UserTable;
