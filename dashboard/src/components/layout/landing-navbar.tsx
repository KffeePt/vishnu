"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu, ChevronRight } from "lucide-react";
import { AuthDialog } from "@/components/layout/auth-dialog";

export function LandingNavbar() {
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <header className="fixed top-0 w-full z-50 border-b border-white/10 bg-[#0B132B]/80 backdrop-blur-md transition-all">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        
        {/* Brand */}
        <Link href="/" className="flex items-center gap-2 z-50">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-graviton-purple to-graviton-cyan flex items-center justify-center">
            <div className="h-3 w-3 rounded-full bg-[#0B132B]" />
          </div>
          <span className="font-orbitron font-bold text-xl text-white tracking-wide">
            Graviton Systems
          </span>
        </Link>
        
        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link href="#features" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Features</Link>
          <Link href="#modules" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Modules</Link>
          <Link href="#pricing" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Pricing</Link>
          <Link href="#testimonials" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">Clients</Link>
        </nav>
        
        {/* Desktop Actions */}
        <div className="hidden md:flex items-center gap-4">
          <Button variant="ghost" className="text-zinc-300 hover:text-white hover:bg-white/5" onClick={() => setAuthOpen(true)}>
            Sign In
          </Button>
          <Button className="bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] font-semibold font-inter shadow-[0_0_15px_rgba(46,196,182,0.3)] transition-all hover:scale-105" onClick={() => setAuthOpen(true)}>
            Start Project
          </Button>
        </div>

        {/* Mobile Nav (Sheet Drawer) */}
        <div className="md:hidden flex items-center gap-4 z-50">
          <Button size="sm" className="bg-graviton-cyan text-[#0B132B] font-semibold" onClick={() => setAuthOpen(true)}>
            Sign In
          </Button>
          <Sheet>
            <SheetTrigger className="inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors hover:bg-white/10 text-zinc-200 h-9 w-9">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle navigation menu</span>
            </SheetTrigger>
            <SheetContent side="right" className="bg-[#0B132B] border-l border-white/10 pt-16 px-6 sm:w-[300px] w-[85vw]">
              <nav className="flex flex-col gap-6">
                <Link href="#features" className="flex items-center justify-between text-lg font-orbitron text-zinc-200 border-b border-white/5 pb-2">
                  Features <ChevronRight className="h-4 w-4 text-graviton-cyan" />
                </Link>
                <Link href="#modules" className="flex items-center justify-between text-lg font-orbitron text-zinc-200 border-b border-white/5 pb-2">
                  Modules <ChevronRight className="h-4 w-4 text-graviton-cyan" />
                </Link>
                <Link href="#pricing" className="flex items-center justify-between text-lg font-orbitron text-zinc-200 border-b border-white/5 pb-2">
                  Pricing <ChevronRight className="h-4 w-4 text-graviton-cyan" />
                </Link>
                <Link href="#testimonials" className="flex items-center justify-between text-lg font-orbitron text-zinc-200 border-b border-white/5 pb-2">
                  Clients <ChevronRight className="h-4 w-4 text-graviton-cyan" />
                </Link>
              </nav>
              <div className="mt-8 flex flex-col gap-4">
                <Button className="w-full bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] font-semibold shadow-[0_0_15px_rgba(46,196,182,0.3)]" onClick={() => setAuthOpen(true)}>
                  Start Project
                </Button>
                <Button variant="outline" className="w-full bg-transparent border-white/20 text-white hover:bg-white/5" onClick={() => setAuthOpen(true)}>
                  Client Login
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
      
      {/* Auth Modal Overlay */}
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </header>
  );
}
