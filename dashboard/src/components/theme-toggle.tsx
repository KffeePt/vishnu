"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { SunIcon, MoonIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTheme } from "next-themes";

interface ThemeToggleProps {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
  className?: string;
  iconSize?: number;
  lightIconColor?: string;
  darkIconColor?: string;
}

export function ThemeToggle({
  variant = "ghost",
  size = "icon",
  className = "rounded-xl w-full bg-transparent",
  iconSize = 5,
  lightIconColor = "text-blue-850",
  darkIconColor = "text-yellow-300"
}: ThemeToggleProps) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isThemeInitialized, setIsThemeInitialized] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (theme) {
      setIsThemeInitialized(true);
    }
  }, [theme]);

  const handleThemeChange = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
  };

  if (!mounted || !isThemeInitialized) {
    return null;
  }

  return (
    <Button
      variant={variant}
      size={size}
      onClick={handleThemeChange}
      className={cn(className)}
      aria-label="Toggle theme"
    >
      <motion.div
        whileHover={{ rotate: [0, 15, -15, 15, 0], scale: 1.1 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        className="flex h-full w-full items-center justify-center"
      >
        {theme === "dark" ? (
          <SunIcon className={cn(`h-${iconSize} w-${iconSize} ${darkIconColor}`)} />
        ) : (
          <MoonIcon className={cn(`h-${iconSize} w-${iconSize} ${lightIconColor}`)} />
        )}
      </motion.div>
    </Button>
  );
}
