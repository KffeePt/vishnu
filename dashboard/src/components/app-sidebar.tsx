"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { RiAdminLine } from "react-icons/ri";
import { LuLogOut, LuLogIn } from "react-icons/lu";
import { Home, Settings, User, X, UserCog, MessageSquare, Code, Eye, EyeOff, ShoppingCart, Info, Candy, Gift, Star } from "lucide-react"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";
import Image from "next/image";
import Link from "next/link"
import { UserAuth } from "@/context/auth-context";
import { db } from '@/config/firebase';
import { collection, onSnapshot } from "firebase/firestore";
import { useSiteConfigContext } from "@/context/site-config-context";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebarProps } from "@/zod_schemas";

export function AppSidebar({ activeSection, setActiveSection, className, isHidden }: AppSidebarProps) {
  const { state, toggleSidebar, openMobile, isMobile, setOpen } = useSidebar();
  const { user, userClaims, logOut, loading } = UserAuth();
  const { config, isLoading: isLoadingConfig, isPublic } = useSiteConfigContext();
  const [mounted, setMounted] = useState(false);

  const [isSigningOut, setIsSigningOut] = useState(false);
  const [collapsibleMode, setCollapsibleMode] = useState<'icon' | 'offcanvas'>('icon');
  const router = useRouter();
  const [userExpanded, setUserExpanded] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);



  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await logOut();
    } catch (error) {
      console.error("Sign out failed:", error);
    } finally {
      setIsSigningOut(false);
    }
  };

  if (!mounted) {
    return null;
  }

  const isAdminOrOwner = userClaims?.admin || userClaims?.owner;

  if (isHidden === true && !isMobile) {
    return null;
  }

  return (
    <div>
      <Sidebar
        collapsible={collapsibleMode}
        className={`${className || ''} py-4 bg-gradient-to-b from-pink-50/80 via-yellow-50/80 to-purple-50/80 dark:from-pink-900/20 dark:via-yellow-900/20 dark:to-purple-900/20 backdrop-blur-sm z-30 transition-all duration-300 ease-in-out border-r-4 border-gradient-to-b from-pink-300 via-yellow-300 to-purple-300`}
      >
        <SidebarHeader className="relative">
          {isMobile && openMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-4 left-4 z-"
              onClick={toggleSidebar}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </Button>
          )}
          <div className={`flex h-14 items-center justify-center`}>
            {state === 'expanded' || isMobile ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-4 left-4 z-"
                  onClick={toggleSidebar}
                  aria-label="Close sidebar"
                >
                  <X className="h-5 w-5" />
                </Button>
                <Link href="/" className="flex items-center font-semibold" onClick={() => setActiveSection("home")}>
                  {isLoadingConfig ? (
                    <Skeleton className="h-20 w-20 rounded-full" />
                  ) : config?.siteAppearance?.logoUrl ? (
                    <div className="h-12 w-12">
                      <Image
                        src={config.siteAppearance.logoUrl}
                        alt="Site Logo"
                        width={48}
                        height={48}
                        className="h-full w-full rounded-full object-cover"
                      />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-full bg-primary" />
                  )}
                </Link>
              </>
            ) : (
              <Link href="#" className="flex items-center justify-center cursor-pointer" onClick={(e) => { e.preventDefault(); toggleSidebar(); }}>
                {isLoadingConfig ? (
                  <Skeleton className="w-8 h-8 rounded-full" />
                ) : config?.siteAppearance?.logoUrl ? (
                  <div className="h-8 w-8">
                    <Image
                      src={config.siteAppearance.logoUrl}
                      alt="Site Logo"
                      width={40}
                      height={40}
                      className="h-full w-full rounded-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="h-10 w-10 rounded-full bg-primary" />
                )}
              </Link>
            )}
          </div>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigation</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "home"}
                    onClick={() => { setActiveSection("home"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="Home"
                  >
                    <Home className="h-5 w-5" />
                    <span>Home</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "shop"}
                    onClick={() => { setActiveSection("shop"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="Shop"
                  >
                    <ShoppingCart className="h-5 w-5" />
                    <span>Shop</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "flavors"}
                    onClick={() => { setActiveSection("flavors"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="Flavors"
                  >
                    <Candy className="h-5 w-5" />
                    <span>Flavors</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "deals"}
                    onClick={() => { setActiveSection("deals"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="Special Deals"
                  >
                    <Gift className="h-5 w-5" />
                    <span>Deals</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "favorites"}
                    onClick={() => { setActiveSection("favorites"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="Favorites"
                  >
                    <Star className="h-5 w-5" />
                    <span>Favorites</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={activeSection === "about"}
                    onClick={() => { setActiveSection("about"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                    tooltip="About"
                  >
                    <Info className="h-5 w-5" />
                    <span>About</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {(isPublic || isAdminOrOwner) ? (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      isActive={activeSection === "assistant"}
                      onClick={() => { setActiveSection("assistant"); if (state === 'expanded' || isMobile) toggleSidebar(); }}
                      tooltip="AI Assistant"
                    >
                      <MessageSquare className="h-5 w-5" />
                      <span>AI Assistant</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ) : null}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            {isAdminOrOwner ? (
              <SidebarMenuItem>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className={`flex items-center justify-center w-full py-2 ${isPublic ? 'text-[#00BFB3]' : 'text-red-500'}`}>
                        {isPublic ? <Eye className="h-5 w-5" /> : <EyeOff className="h-5 w-5" />}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isPublic ? "Assistant is public" : "Assistant is not public"}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </SidebarMenuItem>
            ) : null}
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton className="" tooltip="Settings">
                    <Settings className={`h-4 w-4 ${state === 'collapsed' ? '' : ''}`} />
                    <span>Settings</span>
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="start"
                  side="top"
                  className="w-48 space-y-0"
                >
                  <DropdownMenuItem
                    disabled={isSigningOut}
                    onClick={handleSignOut}
                    className="cursor-pointer py-0"
                  >
                    {user ? (
                      <div className="flex items-center w-full hover:pl-2 transition-all rounded-lg py-1">
                        <LuLogOut className="h-4 w-4 mr-2" />
                        <span>{isSigningOut ? "Signing out..." : "Sign Out"}</span>
                      </div>
                    ) : (
                      <Link href="/auth" className="flex items-center w-full hover:pl-2 transition-all rounded-lg py-1">
                        <LuLogIn className="h-4 w-4 mr-2" />
                        <span>Sign In</span>
                      </Link>
                    )}
                  </DropdownMenuItem>
                  {user && !loading && (userClaims?.admin === true || userClaims?.owner === true) && (
                    <DropdownMenuItem className="py-0">
                      <Link href="/udhhmbtc" prefetch={false} className="flex items-center w-full hover:pl-2 transition-all rounded-lg py-1">
                        <RiAdminLine className="h-4 w-4 mr-2 text-orange-600 " />
                        <span>Admin Panel</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {user && !loading && (userClaims?.staff === true || userClaims?.owner === true) && (
                    <DropdownMenuItem className="py-0">
                      <Link href="/candyman" prefetch={false} className="flex items-center w-full hover:pl-2 transition-all rounded-lg py-1">
                        <Candy className="h-4 w-4 mr-2 text-pink-600 " />
                        <span>Candyman Portal</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={(e) => e.preventDefault()} className="focus:bg-transparent hover:bg-transparent cursor-default w-full">
                    <div className="w-full " onClick={(e: React.MouseEvent) => e.stopPropagation()}>
                      <ThemeToggle
                        size="sm"
                        className="w-full h-8 "
                        iconSize={4}
                      />
                    </div>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
            {user && (
              <SidebarMenuItem>
                <TooltipProvider delayDuration={500}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        className={`flex items-center gap-2 w-full ${(isMobile && openMobile) || (!isMobile && state === 'expanded')
                          ? 'justify-start'
                          : 'justify-start'
                          }`}
                      >
                        {user.photoURL ? (
                          <div className="flex-shrink-0">
                            <Image
                              src={
                                user.photoURL.includes('icon.png')
                                  ? '/placeholder-user.jpg'
                                  : user.photoURL
                              }
                              alt="Profile"
                              width={24}
                              height={24}
                              className="h-6 w-6 rounded-full object-cover"
                            />
                          </div>
                        ) : (
                          <User className="h-6 w-6 flex-shrink-0" />
                        )}
                        {((isMobile && openMobile) || (!isMobile && state === 'expanded')) && (
                          <span className="flex-grow min-w-0 overflow-hidden whitespace-nowrap text-ellipsis">
                            {user.displayName || 'User'}
                          </span>
                        )}
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent
                      side="top"
                      align="center"
                      className="w-60"
                    >
                      <div className="flex items-center gap-3 py-1">
                        {user.photoURL ? (
                          <Image
                            src={user.photoURL.includes('icon.png') ? '/placeholder-user.jpg' : user.photoURL}
                            alt="Profile"
                            width={64}
                            height={64}
                            className="h-12 w-12 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-6 w-6 text-muted-foreground" />
                          </div>
                        )}
                        <div className="flex flex-col">
                          <span className="font-medium">{user.displayName || 'User'}</span>
                          <span className="text-xs text-muted-foreground">{user.email || 'No email'}</span>
                        </div>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </SidebarMenuItem>
            )}
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
    </div>
  )
}
