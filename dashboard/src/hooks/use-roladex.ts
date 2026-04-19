
import { useState, useCallback, useRef } from 'react';

export const useRoladex = (itemCount: number) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const dragInfo = useRef({
    startX: 0,
    isDragging: false,
  });

  const handleMouseDown = (e: React.MouseEvent) => {
    dragInfo.current.isDragging = true;
    dragInfo.current.startX = e.clientX;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragInfo.current.isDragging) return;
    const dragDistance = e.clientX - dragInfo.current.startX;
    setDragOffset(dragDistance);

    if (Math.abs(dragDistance) > 150) {
      if (dragDistance < 0) {
        next();
      } else {
        prev();
      }
      dragInfo.current.isDragging = false;
      setDragOffset(0);
    }
  };

  const handleMouseUp = () => {
    setDragOffset(0);
    dragInfo.current.isDragging = false;
  };

  const next = useCallback(() => {
    setCurrentIndex((prevIndex) => (prevIndex + 1) % itemCount);
  }, [itemCount]);

  const prev = useCallback(() => {
    setCurrentIndex((prevIndex) => (prevIndex - 1 + itemCount) % itemCount);
  }, [itemCount]);

  const scrollTo = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);


  const getCardStyle = (index: number) => {
    const offset = (index - currentIndex + itemCount) % itemCount;
    const isVisible = offset < 3 || offset > itemCount - 3;
    
    let transform = '';
    let zIndex = 0;
    let opacity = 0;
    let filter = 'blur(4px)';

    if (isVisible) {
      if (offset === 0) { // Current item
        transform = `rotateX(0deg) translateZ(0px) scale(1) translateX(${dragOffset}px)`;
        zIndex = itemCount;
        opacity = 1;
        filter = 'blur(0px)';
      } else if (offset === 1 || offset === itemCount - 1) { // Next and Previous items
        const sign = offset === 1 ? -1 : 1;
        transform = `rotateX(${40 * sign}deg) translateZ(-180px) scale(0.85)`;
        zIndex = itemCount - 1;
        opacity = 0.6;
      } else if (offset === 2 || offset === itemCount - 2) { // Items further away
        const sign = offset === 2 ? -1 : 1;
        transform = `rotateX(${50 * sign}deg) translateZ(-360px) scale(0.7)`;
        zIndex = itemCount - 2;
        opacity = 0.3;
      }
    }

    return {
      transform,
      zIndex,
      opacity,
      filter,
      transition: dragInfo.current.isDragging ? 'none' : 'all 0.5s cubic-bezier(0.23, 1, 0.32, 1)',
    };
  };

  return {
    currentIndex,
    next,
    prev,
    getCardStyle,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    scrollTo,
  };
};
