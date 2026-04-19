"use client";

import { AuthContextProvider } from './auth-context';
import { SiteConfigProvider } from './site-config-context';
import { ThemeProvider } from '@/components/theme-provider';
import React from 'react';

export const Providers = React.memo(({ children }: { children: React.ReactNode }) => {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
    >
      <AuthContextProvider>
        <SiteConfigProvider>
          {children}
        </SiteConfigProvider>
      </AuthContextProvider>
    </ThemeProvider>
  );
});

Providers.displayName = 'Providers';