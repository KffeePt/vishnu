"use client";

import { useAuth, RoleType } from "./auth-provider";
import { ReactNode } from "react";

interface RoleGuardProps {
  minRole: RoleType;
  children: ReactNode;
  fallback?: ReactNode;
}

export function RoleGuard({ minRole, children, fallback = null }: RoleGuardProps) {
  const { loading, hasMinRole } = useAuth();

  if (loading) {
    return null; // Or a generic spinner
  }

  if (!hasMinRole(minRole)) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
