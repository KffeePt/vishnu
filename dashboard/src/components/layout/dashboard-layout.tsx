"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth, RoleType } from "@/components/providers/auth-provider";
import { auth } from "@/lib/firebase/client";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Home, Users, GitBranch, Settings, LogOut, Briefcase, Inbox } from "lucide-react";

const getNavItems = (hasMinRole: (role: RoleType) => boolean) => {
  const items = [
    { name: "Overview", href: "/", icon: Home }
  ];

  if (hasMinRole("staff")) {
    items.push({ name: "Clients", href: "/admin/clients", icon: Briefcase });
    items.push({ name: "Support", href: "/support", icon: Inbox });
    items.push({ name: "Portal (Client View)", href: "/portal", icon: Home });
  }

  if (hasMinRole("maintainer")) {
    items.push({ name: "Employees", href: "/employees", icon: Users });
    items.push({ name: "Repository", href: "/repo", icon: GitBranch });
  }

  if (hasMinRole("admin")) {
    items.push({ name: "Admin", href: "/admin", icon: Settings });
  }

  return items;
};

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, role, hasMinRole, logout } = useAuth();

  const navItems = getNavItems(hasMinRole);

  // If on login page, don't show layout
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const handleSignOut = async () => {
    await logout();
  };

  const getInitials = (email: string) => {
    return email ? email.substring(0, 2).toUpperCase() : "U";
  };

  return (
    <div className="flex min-h-screen w-full bg-zinc-950 text-zinc-50">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-950 flex flex-col">
        <div className="h-16 flex items-center px-6 border-b border-zinc-800">
          <span className="text-xl font-bold tracking-tight text-white">Vishnu</span>
          <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-blue-900 text-blue-100 capitalize">
            {role || "loading"}
          </span>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link key={item.name} href={item.href}>
                <span
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                    isActive
                      ? "bg-zinc-800 text-white"
                      : "text-zinc-400 hover:bg-zinc-800/50 hover:text-white"
                  }`}
                >
                  <item.icon className="mr-3 h-5 w-5" />
                  {item.name}
                </span>
              </Link>
            );
          })}
        </nav>
        {/* Sidebar Footer */}
        <div className="p-4 border-t border-zinc-800">
          <button 
            onClick={handleSignOut}
            className="flex w-full items-center px-3 py-2 text-sm font-medium rounded-md text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
          >
            <LogOut className="mr-3 h-5 w-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-16 flex items-center justify-between px-8 border-b border-zinc-800 bg-zinc-950">
          <div className="flex items-center">
              <h2 className="text-lg font-medium">
                {navItems.find(i => i.href === pathname)?.name || "Dashboard"}
              </h2>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-zinc-400 capitalize bg-zinc-800 px-2 py-1 rounded">
              Role: {role || "loading..."}
            </span>
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
                    <p className="text-sm font-medium leading-none">{user?.displayName || "User"}</p>
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
        <main className="flex-1 overflow-auto p-8 bg-zinc-950">
          {children}
        </main>
      </div>
    </div>
  );
}
