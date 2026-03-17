"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { User, onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter, usePathname } from "next/navigation";

export const ROLE_HIERARCHY = {
  admin: 30,
  maintainer: 20,
  staff: 10,
  user: 0,
};

export type RoleType = keyof typeof ROLE_HIERARCHY;

interface AuthContextType {
  user: User | null;
  role: RoleType | null;
  isClient: boolean;
  loading: boolean;
  hasMinRole: (minRole: RoleType) => boolean;
  logout: () => Promise<void>;
  linkGitHub: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  isClient: false,
  loading: true,
  hasMinRole: () => false,
  logout: async () => {},
  linkGitHub: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<RoleType | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const router = useRouter();
  const pathname = usePathname();

  const hasMinRole = (minRole: RoleType) => {
    if (!role) return false;
    return ROLE_HIERARCHY[role] >= ROLE_HIERARCHY[minRole];
  };

  const logout = async () => {
    setLoading(true);
    await fetch("/api/session", { method: "DELETE" });
    await auth.signOut();
    router.push("/login");
  };

  const linkGitHub = () => {
    if (!user) return; // Must be logged in first
    
    // GitHub App Client ID
    const clientId = process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID;
    if (!clientId) {
      console.error("NEXT_PUBLIC_GITHUB_CLIENT_ID is not set in the environment variables.");
      alert("GitHub Configuration Error: Client ID is missing.");
      return;
    }
    
    // The path matching our API callback
    // For local dev, Next.js handles relative URLs nicely, but GitHub requires absolute
    const redirectUri = typeof window !== 'undefined' 
        ? `${window.location.origin}/api/auth/github/callback`
        : "";
        
    // Pass the user's UID in the state parameter to securely link in the backend
    const state = user.uid;
    
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
    
    window.location.href = githubAuthUrl;
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      try {
        if (currentUser) {
          setUser(currentUser);
          const idTokenResult = await currentUser.getIdTokenResult();
          
          let userRole = (idTokenResult.claims.role as string) || "user";
          if (userRole === "owner") {
             userRole = "admin";
          }
          setRole(userRole as RoleType);
          setIsClient(!!idTokenResult.claims.client);

          // Sync session cookie
          const idToken = await currentUser.getIdToken();
          await fetch("/api/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ idToken }),
          });

          // If they were on the login page and logged in, redirect them to dashboard
          if (pathname === '/login') {
             if (idTokenResult.claims.client) {
               router.push('/portal');
             } else {
               router.push('/admin');
             }
          }
        } else {
          setUser(null);
          setRole(null);
          setIsClient(false);
          await fetch("/api/session", { method: "DELETE" });
          
          if (pathname.startsWith('/admin') || pathname.startsWith('/portal')) {
            router.push('/login');
          }
        }
      } catch (error) {
        console.error("Auth State Error:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [pathname, router]);

  return (
    <AuthContext.Provider value={{ user, role, isClient, loading, hasMinRole, logout, linkGitHub }}>
      {!loading && children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
