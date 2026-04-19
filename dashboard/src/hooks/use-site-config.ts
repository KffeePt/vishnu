import { useSiteConfigContext } from '@/context/site-config-context';

export interface ShutdownConfig {
  isShutdown: boolean;
  message: string;
  title: string;
  subtitle: string;
  waveColor: string;
}

export interface SiteAppearanceConfig {
  theme: string;
  logoUrl?: string;
}

export interface SiteConfig {
  shutdown: ShutdownConfig | null;
  siteAppearance: SiteAppearanceConfig | null;
}

export function useSiteConfig() {
  return useSiteConfigContext();
}