"use client";

import React, { useEffect, useRef } from 'react';

interface SansanModeProps {
  setSansanMode: React.Dispatch<React.SetStateAction<boolean>>;
}

const SansanMode: React.FC<SansanModeProps> = ({ setSansanMode }) => {
  const keysPressed = useRef<{ [key: string]: boolean }>({});

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;

      if (keysPressed.current['shift'] && keysPressed.current['e'] && keysPressed.current['x']) {
        setSansanMode(prev => !prev);
        // Prevent rapid toggling
        keysPressed.current = {};
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [setSansanMode]);

  return null; // This component does not render anything
};

export default SansanMode;