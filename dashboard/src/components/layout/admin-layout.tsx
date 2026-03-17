"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, RoleType } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Users, GitBranch, Settings, LogOut, Briefcase, Inbox } from "lucide-react";
import { SidebarProvider, SidebarTrigger, Sidebar, SidebarHeader, SidebarContent, SidebarMenu, SidebarMenuItem, SidebarMenuButton, SidebarFooter } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const getNavItems = (hasMinRole: (role: RoleType) => boolean) => {
  const items = [
    { name: "Overview", href: "/admin", icon: Home }
  ];

  if (hasMinRole("staff")) {
    items.push({ name: "Clients", href: "/admin/clients", icon: Briefcase });
    items.push({ name: "Support", href: "/admin/support", icon: Inbox });
    items.push({ name: "Portal (Client View)", href: "/portal", icon: Home });
  }

  if (hasMinRole("maintainer")) {
    items.push({ name: "Employees", href: "/admin/employees", icon: Users });
    items.push({ name: "Repository", href: "/admin/repo", icon: GitBranch });
  }

  if (hasMinRole("admin")) {
    items.push({ name: "System", href: "/admin/system", icon: Settings });
  }

  return items;
};

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, role, hasMinRole, logout } = useAuth();

  const navItems = getNavItems(hasMinRole);

  const handleSignOut = async () => {
    await logout();
  };

  const getInitials = (email: string | null) => {
    return email ? email.substring(0, 2).toUpperCase() : "U";
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-50 relative overflow-hidden font-roboto">
        {/* Sidebar */}
        <Sidebar className="border-r border-white/10 bg-zinc-900/50">
          <SidebarHeader className="h-14 lg:h-[60px] border-b border-white/10 flex items-center px-6">
            <Link href="/admin" className="flex items-center gap-2 font-semibold font-orbitron">
              <span className="text-zinc-50">Graviton OS</span>
              <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-indigo-900/50 text-indigo-200 capitalize font-inter border border-indigo-500/20">
                {role || "loading"}
              </span>
            </Link>
          </SidebarHeader>
          <SidebarContent className="p-4">
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
                return (
                  <SidebarMenuItem key={item.name}>
                    <SidebarMenuButton 
                      className={`hover:bg-white/5 transition-colors ${isActive ? "bg-white/10 text-white" : "text-zinc-400 hover:text-white"}`}
                      render={
                        <Link href={item.href}>
                          <item.icon className="h-4 w-4 mr-2" />
                          <span>{item.name}</span>
                        </Link>
                      }
                    />
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>
          <SidebarFooter className="border-t border-white/10 p-4">
            {user && (
               <div className="flex flex-col gap-2 relative">
                 <div className="flex items-center justify-between p-2 rounded-md hover:bg-white/5 transition-colors group">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <div className="flex items-center gap-3 cursor-default overflow-hidden">
                            <Avatar className="h-9 w-9 border border-white/10 bg-zinc-800">
                              <AvatarImage src={user.photoURL || undefined} />
                              <AvatarFallback className="bg-zinc-800 text-zinc-100 text-xs shadow-inner">
                                {getInitials(user.email)}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex flex-col overflow-hidden text-left">
                              <span className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                                {user.displayName || "Admin User"}
                              </span>
                              <span className="text-xs text-zinc-500 capitalize">
                                {role || "staff"}
                              </span>
                            </div>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="bg-zinc-800 border-zinc-700 text-zinc-200 shadow-xl ml-2">
                          <p>{user.email}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                    <button
                      onClick={handleSignOut}
                      className="text-red-400 hover:text-red-300 transition-colors p-2 rounded-md hover:bg-red-400/10 shrink-0"
                      title="Sign Out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                 </div>
               </div>
            )}
          </SidebarFooter>
        </Sidebar>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {/* Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center gap-4 border-b border-white/10 bg-zinc-950/80 px-4 backdrop-blur lg:h-[60px] lg:px-6 justify-between">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="-ml-1 text-zinc-50 hover:bg-white/10" />
              <h2 className="text-lg font-medium text-zinc-200">
                {navItems.find(i => i.href === pathname)?.name || "Dashboard"}
              </h2>
            </div>
            
            <div className="flex items-center space-x-4">
              <DropdownMenu>
                <DropdownMenuTrigger className="relative h-8 w-8 rounded-full outline-none focus:ring-2 focus:ring-zinc-400">
                  <Avatar className="h-8 w-8 cursor-pointer">
                    <AvatarFallback className="bg-zinc-800 text-zinc-100">
                      {user?.email && getInitials(user.email)}
                    </AvatarFallback>
                  </Avatar>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56" align="end">
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none">{user?.displayName || "Admin"}</p>
                      <p className="text-xs leading-none text-muted-foreground">
                        {user?.email}
                      </p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleSignOut} className="text-red-500 cursor-pointer">
                    <LogOut className="mr-2 h-4 w-4" />
                    <span>Log out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Page Content */}
          <div className="p-4 md:p-8 bg-zinc-950 min-h-[calc(100vh-60px)]">
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
