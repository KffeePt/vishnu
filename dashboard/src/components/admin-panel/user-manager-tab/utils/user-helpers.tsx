import React from 'react';
import { Shield, UserCog, Stethoscope, User as UserIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { UserRole, UserStatus } from '../user-manager-tab';

export const getRoleIcon = (role: UserRole) => {
  switch (role) {
    case 'admin':
      return <Shield className="h-5 w-5 text-purple-500" />;
    case 'manager':
      return <UserCog className="h-5 w-5 text-blue-500" />;
    case 'doctor':
      return <Stethoscope className="h-5 w-5 text-green-500" />;
    case 'patient':
      return <UserIcon className="h-5 w-5 text-gray-500" />;
    default:
      return <UserIcon className="h-5 w-5 text-gray-500" />;
  }
};

export const getStatusBadge = (status: UserStatus) => {
  switch (status) {
    case 'active':
      return <Badge variant="default" className="bg-green-500 hover:bg-green-600">Active</Badge>;
    case 'inactive':
      return <Badge variant="secondary">Inactive</Badge>;
    case 'pending':
      return <Badge variant="outline">Pending</Badge>;
    case 'suspended':
      return <Badge variant="destructive">Suspended</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
};