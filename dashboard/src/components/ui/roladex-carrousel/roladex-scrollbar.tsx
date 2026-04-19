import React, { useRef, useCallback } from 'react';

interface RoladexScrollbarProps {
  itemCount: number;
  currentIndex: number;
  scrollTo: (index: number) => void;
}

export const RoladexScrollbar: React.FC<RoladexScrollbarProps> = ({
  itemCount,
  currentIndex,
  scrollTo,
}) => {
  const scrollbarRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging.current || !scrollbarRef.current) return;
      const rect = scrollbarRef.current.getBoundingClientRect();
      const percentage = (e.clientY - rect.top) / rect.height;
      const index = Math.round(percentage * (itemCount - 1));
      scrollTo(Math.max(0, Math.min(itemCount - 1, index)));
    },
    [itemCount, scrollTo]
  );

  const handleMouseUp = useCallback(() => {
    isDragging.current = false;
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
  }, [handleMouseMove]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDragging.current = true;
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      handleMouseMove(e.nativeEvent);
    },
    [handleMouseMove, handleMouseUp]
  );

  return (
    <div
      ref={scrollbarRef}
      className="relative h-[300px] w-2  sm:mr-4 dark:bg-gray-700 bg-primary rounded-full cursor-pointer"
      onMouseDown={handleMouseDown}
    >
      <div
        className="absolute w-full dark:bg-primary bg-gray-600 rounded-full"
        style={{
          height: `${100 / itemCount}%`,
          top: `${(currentIndex * 100) / itemCount}%`,
          transition: 'top 0.3s ease-out',
        }}
      ></div>
    </div>
  );
};