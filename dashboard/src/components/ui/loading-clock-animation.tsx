import React from 'react';

interface LoadingClockAnimationProps {
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

const LoadingClockAnimation: React.FC<LoadingClockAnimationProps> = ({ className, size: sizeProp = 'md' }) => {
  let clockSizePx = 24; // Default md
  if (sizeProp === 'sm') {
    clockSizePx = 16;
  } else if (sizeProp === 'lg') {
    clockSizePx = 32;
  }

  const handStyleBase: React.CSSProperties = {
    width: '2px',
    backgroundColor: 'currentColor',
    position: 'absolute',
    left: `calc(50% - 1px)`,
    transformOrigin: '50% 100%',
  };

  const minuteHandStyle: React.CSSProperties = {
    ...handStyleBase,
    height: `${clockSizePx / 2.5}px`,
    top: `${clockSizePx / 2 - clockSizePx / 2.5}px`,
    animation: 'spin 1.2s linear infinite',
  };

  const hourHandStyle: React.CSSProperties = {
    ...handStyleBase,
    height: `${clockSizePx / 3.5}px`,
    top: `${clockSizePx / 2 - clockSizePx / 3.5}px`,
    animation: 'spin 15s linear infinite',
  };

  return (
    <div
      className={`relative inline-block ${className}`}
      style={{ width: `${clockSizePx}px`, height: `${clockSizePx}px` }}
      aria-label="Loading"
      role="status"
    >
      <div
        className="absolute inset-0 border-2 border-current rounded-full"
      />
      <div style={minuteHandStyle} />
      <div style={hourHandStyle} />
      {/* JSS for @keyframes */}
      <style jsx>{`
        @keyframes spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoadingClockAnimation;