"use client";

import React from 'react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import UserDetailsAdmin from '../user-details';
import { User } from '../user-manager-tab';
import { getRoleIcon, getStatusBadge } from '../utils/user-helpers';

interface UserDialogsProps {
  selectedUserForDetails: User | null;
  isUserDetailsOpen: boolean;
  isDeleteDialogOpen: boolean;
  userToDelete: User | null;
  isDeleting: boolean;
  onUserDetailsOpenChange: (open: boolean) => void;
  onUserUpdate: (user: User) => Promise<void>;
  onDeleteRequest: (userId: string) => void;
  onDeleteConfirm: () => void;
  onDeleteCancel: () => void;
}

const UserDialogs: React.FC<UserDialogsProps> = ({
  selectedUserForDetails,
  isUserDetailsOpen,
  isDeleteDialogOpen,
  userToDelete,
  isDeleting,
  onUserDetailsOpenChange,
  onUserUpdate,
  onDeleteRequest,
  onDeleteConfirm,
  onDeleteCancel,
}) => {
  return (
    <>
      {selectedUserForDetails && (
        <UserDetailsAdmin
          user={selectedUserForDetails}
          isOpen={isUserDetailsOpen}
          onOpenChange={onUserDetailsOpenChange}
          onUserUpdate={onUserUpdate}
          getRoleIcon={getRoleIcon}
          getStatusBadge={getStatusBadge}
          onDeleteRequest={onDeleteRequest}
        />
      )}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={onDeleteCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Eliminación</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que quieres eliminar permanentemente al usuario {userToDelete?.name}? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={onDeleteCancel}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={onDeleteConfirm}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Eliminando...' : 'Eliminar Usuario'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};

export default UserDialogs;
