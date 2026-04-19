import React, { useState } from 'react';
import type { CarouselItem } from '../types';
import Image from 'next/image';
import { ImageSkeleton } from '@/components/ui/image-skeleton';

interface CardProps {
  item: CarouselItem;
  style: React.CSSProperties;
  onClick: () => void;
  isClickable: boolean;
  ariaLabel?: string;
}

export const Card: React.FC<CardProps> = ({ item, style, onClick, isClickable, ariaLabel }) => {
  const [isLoaded, setIsLoaded] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isClickable && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      style={style}
      onClick={isClickable ? onClick : undefined}
      onKeyDown={handleKeyDown}
      tabIndex={isClickable ? 0 : -1}
      role={isClickable ? 'button' : undefined}
      aria-label={ariaLabel}
      className={`absolute w-full h-full rounded-2xl shadow-2xl bg-brand-secondary backdrop-blur-md border border-white/10 flex flex-col overflow-hidden transition-colors duration-300 ${isClickable ? 'cursor-pointer hover:border-brand-highlight/60' : ''}`}
    >
      {item.type === 'video' ? (
        <video
          src={item.imageUrl}
          className="absolute top-0 left-0 w-full h-full object-cover"
          autoPlay
          muted
          loop
          onCanPlay={() => setIsLoaded(true)}
        />
      ) : (
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="100vw"
          quality={100}
          className={`absolute top-0 left-0 w-full h-full object-cover ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setIsLoaded(true)}
        />
      )}
      {!isLoaded && <ImageSkeleton />}
      <div className="absolute bottom-0 left-0 w-full h-1/3 bg-gradient-to-t from-black/80 to-transparent p-6 flex flex-col justify-end">
        <h3 className="text-white font-bold text-2xl drop-shadow-lg">{item.title}</h3>
        {item.subtitle && <p className="text-white/80 text-sm drop-shadow-lg">{item.subtitle}</p>}
      </div>
    </div>
  );
};