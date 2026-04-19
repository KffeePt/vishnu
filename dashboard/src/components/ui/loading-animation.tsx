import React from 'react';

interface LoadingAnimationProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  text?: string;
}

const LoadingAnimation: React.FC<LoadingAnimationProps> = ({ className, size = 'md', text }) => {
  let dotSize = 'h-2 w-2';
  let textSizeClass = 'text-sm';

  if (size === 'sm') {
    dotSize = 'h-1.5 w-1.5';
    textSizeClass = 'text-xs';
  }
  if (size === 'lg') {
    dotSize = 'h-3 w-3';
    textSizeClass = 'text-base';
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <div className="flex space-x-1 items-center">
        <span className={`${dotSize} bg-current rounded-full animate-bounce [animation-delay:-0.3s]`} />
        <span className={`${dotSize} bg-current rounded-full animate-bounce [animation-delay:-0.15s]`} />
        <span className={`${dotSize} bg-current rounded-full animate-bounce`} />
      </div>
      {text && <span className={`${textSizeClass} text-muted-foreground`}>{text}</span>}
    </div>
  );
};

export default LoadingAnimation;