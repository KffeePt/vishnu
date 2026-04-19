'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { UserAuth } from '@/context/auth-context';
import { Menu, Info, ShoppingCart } from 'lucide-react';
import { User } from 'firebase/auth';
import { ThemeToggle } from './theme-toggle';
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useIsMobile } from "@/hooks/use-mobile";
import { useTheme } from "next-themes";
import Image from 'next/image';
import { cn } from "@/lib/utils";
import { getSiteAppearance } from '@/app/lib/configService';
import { NavBarProps } from '@/zod_schemas';

const NavBar: React.FC<NavBarProps> = ({ desktopSidebarState, setActiveSection, showNav }) => {
  const { user } = UserAuth();
  const { theme } = useTheme();
  const isMobile = useIsMobile();
  const router = useRouter();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [isLoadingLogo, setIsLoadingLogo] = useState(true);

  useEffect(() => {
    const fetchLogo = async () => {
      setIsLoadingLogo(true);
      try {
        const data = await getSiteAppearance();
        if (data && data.logoUrl) {
          setLogoUrl(data.logoUrl);
        }
      } catch (error) {
        console.error('Failed to fetch logo:', error);
      } finally {
        setIsLoadingLogo(false);
      }
    };
    fetchLogo();
  }, []);

  return (
    <>
      <div className={cn(
          "h-16 w-full transition-all duration-300 ease-in-out",
          !isMobile && desktopSidebarState === 'expanded' ? 'md:pl-[16rem]' : 'md:pl-[3rem]'
      )}></div>

      <div
        className={cn(
          "fixed top-0 left-0 right-0 z-50 bg-[#FFC0CB] dark:bg-[#FF69B4] border-b shadow-sm transition-all duration-300 ease-in-out",
          !isMobile && desktopSidebarState === 'expanded' ? 'md:pl-[16rem]' : 'md:pl-[3rem]',
          isMobile ? (showNav ? 'translate-y-0' : '-translate-y-full') : ''
        )}
      >
        <div className="container mx-auto px-4">
          <div className="h-16 flex items-center justify-between">
            <div className="flex flex-row items-center gap-4">
              {isMobile && (
                <SidebarTrigger className="md:hidden">
                  <Menu className="h-5 w-5" />
                  <span className="sr-only">Toggle menu</span>
                </SidebarTrigger>
              )}
              <ThemeToggle className='aspect-square rounded-full'/>
            </div>
            <div className='flex items-center w-auto'>
              <Link href="/" onClick={() => setActiveSection("home")} className="flex items-center font-semibold" >
                {isLoadingLogo ? (
                  <div className="w-8 h-8 bg-muted rounded-full animate-pulse" />
                ) : logoUrl ? (
                  <Image src={logoUrl} alt="Logo" width={32} height={32} className=" w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-primary rounded-full" />
                )}
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setActiveSection('shop')}
              >
                <ShoppingCart className="h-5 w-5" />
                <span className="sr-only">Shop</span>
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full"
                onClick={() => setActiveSection('about')}
              >
                <Info className="h-5 w-5" />
                <span className="sr-only">About</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default NavBar;
