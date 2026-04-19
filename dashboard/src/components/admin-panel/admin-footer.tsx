"use client";

import React from 'react';
import { UserAuth } from '@/context/auth-context';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useToast } from '@/hooks/use-toast';

const AdminFooter: React.FC = () => {
  const { user, userProfile, userClaims } = UserAuth();
  const firebaseUser = user;
  const { toast } = useToast();

  const handleCopy = () => {
    if (user) {
      const textToCopy = `Email: ${user.email}\nUID: ${user.uid}`;
      navigator.clipboard.writeText(textToCopy);
      toast({
        title: "Copied to clipboard",
        description: textToCopy,
      });
    }
  };

  const creationTime = firebaseUser?.metadata.creationTime ? new Date(firebaseUser.metadata.creationTime).toLocaleString() : 'N/A';
  const lastSignInTime = firebaseUser?.metadata.lastSignInTime ? new Date(firebaseUser.metadata.lastSignInTime).toLocaleString() : 'N/A';

  const claims = userClaims ? Object.entries(userClaims).map(([key, value]) => {
    if (key === 'admin' || key === 'owner') {
      return `${key}: ${value}`;
    }
    return null;
  }).filter(Boolean).join(', ') : 'N/A';

  return (
    <footer className="bg-background border-t mt-auto py-4">
      <div className="container mx-auto text-center text-muted-foreground text-sm">
        {user ? (
          <div className="flex justify-center items-center gap-4">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Avatar onClick={handleCopy} className="cursor-pointer">
                    <AvatarImage src={user.photoURL || ''} />
                    <AvatarFallback>{user.email?.slice(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Email: {user.email}</p>
                  <p>UID: {user.uid}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <span><strong>Claims:</strong> {claims}</span>
            <span><strong>Created:</strong> {creationTime}</span>
            <span><strong>Last Login:</strong> {lastSignInTime}</span>
          </div>
        ) : (
          <p>Not logged in</p>
        )}
      </div>
    </footer>
  );
};

export default AdminFooter;