import Link from "next/link";
import {
  Package,
  CreditCard,
  MessageSquare,
  Settings,
  LayoutDashboard,
  LogOut,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { useAuth } from "@/components/providers/auth-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ShieldAlert } from "lucide-react";

const portalNavItems = [
  { href: "/portal", label: "Overview", icon: LayoutDashboard },
  { href: "/portal/packages", label: "Packages & Add-ons", icon: Package },
  { href: "/portal/billing", label: "Billing & Subscriptions", icon: CreditCard },
  { href: "/portal/support", label: "Support & Messages", icon: MessageSquare },
  { href: "/portal/settings", label: "Settings", icon: Settings },
];

export function PortalSidebar() {
  const { user, role, hasMinRole, logout } = useAuth();

  const getInitials = (email: string | null) => {
     if (!email) return "U";
     return email.substring(0, 2).toUpperCase();
  };

  return (
    <Sidebar className="border-r border-white/10 bg-zinc-900/50">
      <SidebarHeader className="h-14 lg:h-[60px] border-b border-white/10 flex items-center px-6">
        <Link href="/portal" className="flex items-center gap-2 font-semibold">
          <Package className="h-6 w-6 text-zinc-50" />
          <span className="text-zinc-50">Vishnu Portal</span>
        </Link>
      </SidebarHeader>
      <SidebarContent className="p-4">
        <SidebarMenu>
          {portalNavItems.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton 
                className="hover:bg-white/5 text-zinc-300 hover:text-white transition-colors"
                render={
                  <Link href={item.href}>
                    <item.icon className="h-4 w-4 mr-2" />
                    <span>{item.label}</span>
                  </Link>
                }
              />
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>
      <SidebarFooter className="border-t border-white/10 p-4">
        {user ? (
          <div className="flex flex-col gap-2 relative">
            
            {/* Conditional Admin Return Link */}
            {hasMinRole("admin") && (
              <Link 
                href="/admin" 
                className="flex items-center gap-2 text-sm text-amber-400 hover:text-amber-300 transition-colors w-full justify-start p-2 rounded-md hover:bg-amber-400/10 mb-2 border border-amber-500/20"
              >
                <ShieldAlert className="h-4 w-4" />
                Admin Dashboard
              </Link>
            )}

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
                      <div className="flex flex-col overflow-hidden">
                        <span className="text-sm font-medium text-zinc-200 truncate group-hover:text-white transition-colors">
                          {user.displayName || "User"}
                        </span>
                        <span className="text-xs text-zinc-500 capitalize">
                          {role || "client"}
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
                onClick={logout}
                className="text-red-400 hover:text-red-300 transition-colors p-2 rounded-md hover:bg-red-400/10 shrink-0"
                title="Sign Out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}
