import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CarouselItem } from "./types";
import { ImageSkeleton } from "@/components/ui/image-skeleton";

interface RoladexCardProps {
  item: CarouselItem;
  style: React.CSSProperties;
  onClick?: () => void;
}

export const RoladexCard: React.FC<RoladexCardProps> = ({ item, style, onClick }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const aspectRatio = item.aspectRatioVertical || "16/9";
  
  const getAspectRatioClass = () => {
    // Use a dynamic class based on the prop
    return `aspect-[${aspectRatio.replace('/', '_')}]`;
  };

  return (
    <div
      className="absolute w-full h-full rounded-lg overflow-hidden shadow-2xl bg-gray-800 border border-gray-700 cursor-pointer"
      style={style}
      onClick={onClick}
    >
      <div
        className="relative w-full pointer-events-none"
        style={{ aspectRatio: aspectRatio.replace(/[/]/g, ' / ') }}
      >
        {!isLoaded && <ImageSkeleton />}
        <Image
          src={item.imageUrl}
          alt={item.title}
          fill
          sizes="400px"
          quality={100}
          style={{ objectFit: 'cover' }}
          onLoad={() => setIsLoaded(true)}
          className={isLoaded ? 'opacity-100' : 'opacity-0'}
        />
      </div>
      <div className="p-2 sm:p-4">
        <h3 className="text-lg sm:text-xl font-bold text-white">{item.title}</h3>
        <p className="text-sm text-gray-400">{item.description}</p>
        {item.url && (
          <a href={item.url} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="mt-2">
              View Project
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};