"use client";

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { SiteConfig } from '@/hooks/use-site-config';

interface SiteConfigContextType {
  config: SiteConfig | null;
  isPublic: boolean;
  isLoading: boolean;
  error: string | null;
}

const SiteConfigContext = createContext<SiteConfigContextType | undefined>(undefined);

const fetchConfigData = async () => {
  const appConfigResponse = await fetch('/api/app-config');

  let configData: SiteConfig;
  if (appConfigResponse.status === 404) {
    // If the config doesn't exist (e.g., brand new install), use a safe default footprint
    // so the landing page can still render without crashing. The admin must initialize the db.
    configData = {
      siteAppearance: null,
      shutdown: null,
    };
  } else if (!appConfigResponse.ok) {
    // For any other error, we should throw.
    throw new Error('Failed to fetch app configuration');
  } else {
    // If the config exists, we can use it.
    configData = await appConfigResponse.json();
  }

  // We still need the public assistant config
  const publicConfigResponse = await fetch('/api/assistant/public-config');
  if (!publicConfigResponse.ok) {
    throw new Error('Failed to fetch public assistant configuration');
  }
  const publicConfigData = await publicConfigResponse.json();

  return { configData, publicConfigData };
};

export function SiteConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setIsLoading(true);
        const { configData, publicConfigData } = await fetchConfigData();
        setConfig(configData);
        setIsPublic(publicConfigData.isPublic);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An unknown error occurred');
      } finally {
        setIsLoading(false);
      }
    };
    loadConfig();
  }, []);

  return (
    <SiteConfigContext.Provider value={{ config, isPublic, isLoading, error }}>
      {children}
    </SiteConfigContext.Provider>
  );
}

export function useSiteConfigContext() {
  const context = useContext(SiteConfigContext);
  if (context === undefined) {
    throw new Error('useSiteConfigContext must be used within a SiteConfigProvider');
  }
  return context;
}