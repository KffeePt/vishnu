"use client";

import { useState } from "react";
import { VolumeManagement } from "./volume-management";
import { AuthenticationRequired } from "../authentication-tab/authentication-required";
import { UserAuth } from "@/context/auth-context";
import { useTabAuth } from "@/hooks/use-tab-auth";

export default function DataTab({ parentMasterPassword: legacyParentPW }: { parentMasterPassword?: string }) {
  const { getIDToken } = UserAuth();
  const { isTabAuthenticated, setIsTabAuthenticated, parentMasterPassword } = useTabAuth();

  if (!isTabAuthenticated) {
    return (
      <AuthenticationRequired
        parentMasterPassword={legacyParentPW || parentMasterPassword}
        onAuthenticated={() => setIsTabAuthenticated(true)}
        persistent={false}
      />
    );
  }

  const sessionToken = typeof window !== 'undefined' && sessionStorage.getItem('vishnu_admin_session')
    ? JSON.parse(sessionStorage.getItem('vishnu_admin_session') || '{}').token
    : "";

  return (
    <div className="w-full mt-3 space-y-8 pb-10">
      <VolumeManagement
        masterPassword={parentMasterPassword || ""}
        sessionToken={sessionToken}
      />
    </div>
  );
}
