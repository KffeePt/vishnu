import React from 'react';
import { cn } from '@/lib/utils'; // Assuming you have a cn utility for classnames

interface LoadingSpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  // You can add specific props here if needed, e.g., size, color
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ className, ...props }) => {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-background z-50">
      <div className={cn("relative w-12 h-12", className)} {...props}>
        <div className="animate-spin rounded-full h-full w-full border-4 border-primary border-t-transparent" />
        <div className="absolute top-0 left-0 animate-ping rounded-full h-full w-full border-4 border-primary opacity-20" />
      </div>
    </div>
  );
};

export default LoadingSpinner;
