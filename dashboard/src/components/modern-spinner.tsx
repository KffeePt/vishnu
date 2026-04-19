"use client"

import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

const spinnerVariants = cva(
  "animate-spin text-muted-foreground",
  {
    variants: {
      size: {
        default: "h-8 w-8",
        sm: "h-4 w-4",
        lg: "h-12 w-12",
        xl: "h-16 w-16",
      },
    },
    defaultVariants: {
      size: "default",
    },
  }
)

interface SpinnerProps extends VariantProps<typeof spinnerVariants> {
  className?: string
}

export function ModernSpinner({ size, className }: SpinnerProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4">
      <Loader2 className={cn(spinnerVariants({ size, className }))} />
      <div className="relative">
        <div className="h-1 w-24 bg-muted rounded-full overflow-hidden">
          <div className="h-full bg-primary animate-pulse-linear" style={{ width: '100%' }} />
        </div>
      </div>
    </div>
  )
}

export function LoadingScreen({ message = "Cargando..." }: { message?: string }) {
  return (
    <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-6">
      <div className="bg-card border rounded-lg shadow-lg p-8 flex flex-col items-center gap-6">
        <ModernSpinner size="xl" />
        <p className="text-lg font-medium text-foreground">{message}</p>
      </div>
    </div>
  )
}