import React, { useRef, useCallback } from 'react';
import { motion } from 'framer-motion';

interface HorizontalScrollbarProps {
  itemCount: number;
  currentIndex: number;
  scrollTo: (index: number) => void;
}

export const HorizontalScrollbar: React.FC<HorizontalScrollbarProps> = ({
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
      const percentage = (e.clientX - rect.left) / rect.width;
      const index = Math.round(percentage * (itemCount - 1));
      
      requestAnimationFrame(() => {
        scrollTo(Math.max(0, Math.min(itemCount - 1, index)));
      });
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
      className="relative w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full cursor-pointer"
      onMouseDown={handleMouseDown}
    >
      <motion.div
        className="absolute h-full bg-gray-800 dark:bg-gray-200 rounded-full"
        style={{
          width: `${100 / itemCount}%`,
        }}
        animate={{
          left: `${(currentIndex * 100) / itemCount}%`,
        }}
        transition={{
          type: 'spring',
          stiffness: 500,
          damping: 30,
        }}
      />
    </div>
  );
};