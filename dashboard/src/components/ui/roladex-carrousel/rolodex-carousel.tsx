import React, { useRef, useEffect, useCallback, useState } from 'react';
import { RoladexCard } from './roladex-card';
import { useRoladex } from '@/hooks/use-roladex';
import { CarouselItem } from './types';
import { RoladexScrollbar } from './roladex-scrollbar';
import { FullscreenView, type ProjectImage } from './horizontal-roladex-carousel/fullscreen-view';

interface RoladexCarouselProps {
  items: CarouselItem[];
  additionalImages?: Record<string, (ProjectImage & { subtitle?: string })[]>; // Map of item id to additional images
}

const ArrowIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M16.1716 10.9999L10.8076 5.63589L12.2218 4.22168L20 11.9999L12.2218 19.778L10.8076 18.3638L16.1716 12.9999H4V10.9999H16.1716Z"></path>
  </svg>
);


export const RoladexCarousel: React.FC<RoladexCarouselProps> = ({ items, additionalImages = {} }) => {
  const {
    currentIndex,
    getCardStyle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    next,
    prev,
    scrollTo,
  } = useRoladex(items.length);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastScrollTime = useRef(0);
  const [fullscreenProject, setFullscreenProject] = useState<any | null>(null);
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false);

  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const now = Date.now();

      if (now - lastScrollTime.current < 500) {
        return;
      }

      if (e.deltaY < 0) {
        prev();
      } else {
        next();
      }

      lastScrollTime.current = now;
    };

    const container = scrollContainerRef.current;
    container?.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container?.removeEventListener('wheel', handleWheel);
    };
  }, [next, prev]);

  const handleCardClick = (index: number) => {
    const offset = (index - currentIndex + items.length) % items.length;
    
    // If clicking the center card, open fullscreen
    if (offset === 0) {
      const item = items[index];
      setFullscreenProject({
        id: item.id,
        title: item.title,
        description: item.description,
        mainImage: { url: item.imageUrl, title: item.title },
        additionalImages: additionalImages[item.id] || [],
        url: item.url,
        author: item.author,
        aspectRatio: item.aspectRatioHorizontal,
      });
      setIsFullscreenOpen(true);
    } else if (offset === 1) {
      next();
    } else if (offset === items.length - 1) {
      prev();
    }
  };

  const handleCloseFullscreen = () => {
    setIsFullscreenOpen(false);
    setTimeout(() => setFullscreenProject(null), 300); // Clear after animation
  };

  return (
    <>
      <div className="w-full h-full flex items-center justify-center gap-8 font-sans">
        <div
          ref={scrollContainerRef}
          className="relative w-[500px] h-[350px] cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          style={{
            perspective: '1000px',
            transformStyle: 'preserve-3d',
            userSelect: 'none',
          }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            {items.map((item, index) => {
              const offset = (index - currentIndex + items.length) % items.length;
              const isCenterCard = offset === 0;
              
              return (
                <RoladexCard
                  key={item.id}
                  item={item}
                  style={{
                    ...getCardStyle(index),
                    cursor: isCenterCard ? 'pointer' : 'grab'
                  }}
                  onClick={() => handleCardClick(index)}
                />
              );
            })}
          </div>
        </div>
        <RoladexScrollbar
          itemCount={items.length}
          currentIndex={currentIndex}
          scrollTo={scrollTo}
        />
      </div>
      
      {/* Fullscreen View */}
      {fullscreenProject && (
        <FullscreenView
          isOpen={isFullscreenOpen}
          onClose={handleCloseFullscreen}
          project={fullscreenProject}
        />
      )}
    </>
  );
};
