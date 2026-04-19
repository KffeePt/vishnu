"use client";

import { useMediaQuery } from "@/hooks/use-media-query";

const MOBILE_BREAKPOINT = 768;

export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT}px)`);
}