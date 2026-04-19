"use client";

import React, { useState, useCallback } from 'react';
import { TableRow, TableCell } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Mail, Phone, MapPin, CalendarDays } from 'lucide-react';
import { RiContactsBook2Line } from "react-icons/ri";
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useLongPress } from '@/hooks/use-long-press';
import { User, UserRole, UserStatus, LocationCoords } from '../user-manager-tab';
import { getRoleIcon, getStatusBadge } from '../utils/user-helpers';

interface UserTableRowProps {
  user: User;
  isMobile: boolean;
  activeMenuUserId: string | null;
  menuPosition: { x: number; y: number } | null;
  menuRef: React.RefObject<HTMLDivElement | null>;
  isContextMenuOpen: boolean;
  onRowContextMenu: (event: React.MouseEvent<HTMLTableRowElement>, userId: string) => void;
  onRowLongPress: (userId: string) => void;
  onStatusChange: (userId: string, newStatus: UserStatus) => void;
  onRoleChange: (userId: string, newRole: UserRole) => void;
  setIsContextMenuOpen: (open: boolean) => void;
  setActiveMenuUserId: (id: string | null) => void;
  setMenuPosition: (pos: { x: number; y: number } | null) => void;
}

const UserTableRow = React.memo(({
  user,
  isMobile,
  onRowContextMenu,
  onRowLongPress,
}: UserTableRowProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const handleActualLongPress = useCallback((event: React.MouseEvent<Element> | React.TouchEvent<Element>) => {
    if ('pointerType' in event && event.pointerType === 'touch') {
      event.preventDefault();
      event.stopPropagation();
    }
    onRowLongPress(user.id);
  }, [onRowLongPress, user.id]);

  const longPressEventHandlers = useLongPress(
    handleActualLongPress,
    () => setIsExpanded(prev => !prev)
  );

  return (
    <>
      <TableRow
        onContextMenu={(e) => {
          if (!isMobile) {
            onRowContextMenu(e, user.id);
          }
        }}
        {...longPressEventHandlers}
        className="cursor-pointer hover:bg-muted/50 relative select-none group"
        aria-expanded={isExpanded}
      >
        <TableCell className="table-cell pr-0">
          <Avatar className="h-8 w-8 mx-auto">
            <AvatarImage src={user.avatar || "/placeholder.svg"} alt={user.name || 'Avatar'} />
            <AvatarFallback className="text-xs group-hover:bg-primary group-hover:text-secondary transition-colors">
              {user.name ? user.name.substring(0, 2).toUpperCase() : '??'}
            </AvatarFallback>
          </Avatar>
        </TableCell>
        <TableCell className="table-cell pl-1 ">{getRoleIcon(user.role)}</TableCell>
        <TableCell className="table-cell font-medium ">
          <span className="sm:hidden inline-flex items-center border rounded-md px-4 py-0.5 text-md group-hover:bg-primary group-hover:text-secondary group-hover:scale-110 transition-all ">
            {user.name ? user.name.split(' ').slice(0, 2).map((n) => n).join('.').toUpperCase() : '??'}.
          </span>
          <span className="hidden sm:inline truncate ">{user.name || 'N/D'}</span>
        </TableCell>
        <TableCell className="hidden md:table-cell">{user.email || 'N/D'}</TableCell>
        <TableCell className="hidden lg:table-cell">
          <div className="flex items-center">
            <span className="capitalize">{user.role === 'repartidor' ? 'Repartidor' : user.role}</span>
          </div>
        </TableCell>
        <TableCell className="w-[120px]">{getStatusBadge(user.status)}</TableCell>
      </TableRow>
      <TableRow className="bg-muted/20 hover:bg-muted/30">
        <TableCell colSpan={6} className={`transition-all duration-500 ease-in-out ${isExpanded ? 'p-4' : 'p-0'}`}>
          <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm transition-all duration-500 ease-in-out overflow-hidden ${isExpanded ? 'max-h-96' : 'max-h-0'}`}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <span>{user.email || 'Email no disponible'}</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span>{user.phone || 'Teléfono no disponible'}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-muted-foreground" />
                <span>
                  {(() => {
                    let displayAddress: string | React.ReactNode = 'Ubicación no disponible';
                    if (user.deliveryAddress) {
                      displayAddress = user.deliveryAddress;
                    } else if (user.location) {
                      if (typeof user.location === 'string') {
                        displayAddress = user.location;
                      } else if (
                        typeof user.location === 'object' &&
                        user.location !== null &&
                        typeof (user.location as any).latitude === 'number' &&
                        typeof (user.location as any).longitude === 'number'
                      ) {
                        displayAddress = `Lat: ${(user.location as any).latitude.toFixed(4)}, Lng: ${(user.location as any).longitude.toFixed(4)}`;
                      }
                    }
                    return displayAddress;
                  })()}
                </span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <span>Unido: {user.joinDate || 'N/D'}</span>
              </div>
              {user.lastSignInTime && (
                <div className="flex items-center gap-2">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  <span>Último acceso: {format(new Date(user.lastSignInTime), 'Pp', { locale: es })}</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <RiContactsBook2Line className="h-4 w-4 text-muted-foreground mt-0.5" />
                <p className="text-muted-foreground">{user.bio || 'Sin biografía.'}</p>
              </div>
            </div>
          </div>
        </TableCell>
      </TableRow>
    </>
  );
});
UserTableRow.displayName = 'UserTableRow';

export default UserTableRow;
