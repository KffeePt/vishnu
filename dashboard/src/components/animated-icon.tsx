"use client";

import React, { useRef, useCallback } from 'react';
import { createExplodingBalls, ParticleOptions } from '@/utils/particle-system';
import { AnimatedIconProps } from '@/zod_schemas';

const DEFAULT_JUMP_CLASS = 'animate-jump';
const DEFAULT_JUMP_DURATION = 500;
const MAX_JUMP_QUEUE = 5;

const AnimatedIcon: React.FC<AnimatedIconProps> = ({
  icon,
  className,
  jumpAnimationClass = DEFAULT_JUMP_CLASS,
  jumpAnimationDuration = DEFAULT_JUMP_DURATION,
  onIconClick,
  ...particleOptions
}) => {
  const iconRef = useRef<HTMLDivElement>(null);
  const jumpQueueCount = useRef(0);
  const isJumping = useRef(false);

  const processJumpQueue = useCallback(() => {
    if (isJumping.current || jumpQueueCount.current === 0 || !iconRef.current) {
      return;
    }

    isJumping.current = true;
    jumpQueueCount.current--;

    const target = iconRef.current.querySelector('.icon-wrapper');
    if (target) {
      target.classList.add(jumpAnimationClass);
      setTimeout(() => {
        target.classList.remove(jumpAnimationClass);
        isJumping.current = false;
        processJumpQueue();
      }, jumpAnimationDuration);
    } else {
      isJumping.current = false;
      processJumpQueue();
    }
  }, [jumpAnimationClass, jumpAnimationDuration]);

  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    createExplodingBalls(event.clientX, event.clientY, particleOptions);

    if (jumpQueueCount.current < MAX_JUMP_QUEUE) {
      jumpQueueCount.current++;
      processJumpQueue();
    }

    if (onIconClick) {
      onIconClick(event);
    }
  };

  return (
    <div ref={iconRef} onClick={handleClick} className={className} style={{ cursor: 'pointer' }}>
      <div className="icon-wrapper">
        {icon}
      </div>
    </div>
  );
};

export default AnimatedIcon;
