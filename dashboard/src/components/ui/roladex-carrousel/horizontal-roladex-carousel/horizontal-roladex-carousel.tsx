import React from 'react';
import type { CarouselItem } from '../types';
import { Card } from './horizontal-carousel-card';
import { useHorizontalRoladex } from '@/hooks/use-horizontal-roladex';
import { HorizontalScrollbar } from './horizontal-scrollbar';

interface HorizontalRoladexCarouselProps {
  items: CarouselItem[];
  aspectRatio?: number;
}

export const HorizontalRoladexCarousel: React.FC<HorizontalRoladexCarouselProps> = ({ items, aspectRatio = 16/9 }) => {
  const {
    currentIndex,
    next,
    prev,
    getCardStyle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    scrollTo,
  } = useHorizontalRoladex(items.length);

  const baseWidth = 700;
  const height = baseWidth / aspectRatio;

  return (
    <div className="w-full h-full flex flex-col items-center justify-center font-sans gap-4">
      <div
        className="relative w-full max-w-[700px]"
        style={{
          aspectRatio: `${aspectRatio}`,
          perspective: '1000px',
          transformStyle: 'preserve-3d'
        }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {items.map((item, index) => {
          const offset = (index - currentIndex + items.length) % items.length;

          let onClickHandler = () => {};
          let isClickable = false;
          let ariaLabel: string | undefined = undefined;

          if (offset === 1) {
            onClickHandler = next;
            isClickable = true;
            ariaLabel = `Go to next item: ${item.title}`;
          } else if (offset === items.length - 1) {
            onClickHandler = prev;
            isClickable = true;
            ariaLabel = `Go to previous item: ${item.title}`;
          }

          return (
            <Card
              key={item.id}
              item={item}
              style={getCardStyle(index)}
              onClick={onClickHandler}
              isClickable={isClickable}
              ariaLabel={ariaLabel}
            />
          );
        })}
      </div>
      <div className="w-full max-w-[700px] mt-4">
        <HorizontalScrollbar
          itemCount={items.length}
          currentIndex={currentIndex}
          scrollTo={scrollTo}
        />
      </div>
    </div>
  );
};
