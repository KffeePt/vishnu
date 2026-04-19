"use client";

import React, { useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface VantaBirdsBackgroundProps {
  className?: string;
}

declare global {
  interface Window {
    THREE: any;
    VANTA: any;
  }
}

const VantaBirdsBackground: React.FC<VantaBirdsBackgroundProps> = ({
  className,
}) => {
  const vantaRef = useRef<HTMLDivElement>(null);
  const vantaEffect = useRef<any>(null);
  const [isLoaded, setIsLoaded] = React.useState(false);

  useEffect(() => {
    let scriptsLoaded = 0;
    const totalScripts = 2;

    const checkScriptsLoaded = () => {
      scriptsLoaded++;
      if (scriptsLoaded === totalScripts && vantaRef.current) {
        // Check if THREE.js is fully loaded with required properties
        if (window.THREE && window.THREE.PerspectiveCamera && window.VANTA?.BIRDS) {
          // Add a small delay to ensure THREE.js is fully initialized
          setTimeout(() => {
            try {
              // Initialize Vanta Birds effect with error handling
              vantaEffect.current = window.VANTA.BIRDS({
                el: vantaRef.current,
                mouseControls: true,
                touchControls: true,
                gyroControls: false,
                minHeight: 200.00,
                minWidth: 200.00,
                scale: 1.00,
                scaleMobile: 1.00,
                backgroundColor: 0x023436,
                color1: 0x03B5AA, // Lighter Teal
                color2: 0x049A8F, // Dark Teal
                birdSize: 1.00,
                wingSpan: 20.00,
                speedLimit: 5.00,
                separation: 20.00,
                alignment: 20.00,
                cohesion: 20.00,
                quantity: 3.00
              });
              setIsLoaded(true);
              console.log('Vanta Birds initialized successfully');
            } catch (error) {
              console.error('Error initializing Vanta Birds:', error);
            }
          }, 100);
        } else {
          console.log('Scripts not fully loaded yet. THREE.PerspectiveCamera:', !!window.THREE?.PerspectiveCamera, 'VANTA.BIRDS:', !!window.VANTA?.BIRDS);
        }
      }
    };

    // Load Three.js first
    if (!window.THREE) {
      const threeScript = document.createElement('script');
      threeScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r134/three.min.js';
      threeScript.async = true;
      threeScript.onload = () => {
        console.log('THREE.js loaded successfully');
        checkScriptsLoaded();
      };
      threeScript.onerror = () => {
        console.error('Failed to load THREE.js');
      };
      document.head.appendChild(threeScript);
    } else {
      console.log('THREE.js already loaded');
      checkScriptsLoaded();
    }

    // Load Vanta Birds after Three.js
    if (!window.VANTA?.BIRDS) {
      const vantaScript = document.createElement('script');
      vantaScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/vanta/0.5.24/vanta.birds.min.js';
      vantaScript.async = true;
      vantaScript.onload = () => {
        console.log('Vanta Birds loaded successfully');
        checkScriptsLoaded();
      };
      vantaScript.onerror = () => {
        console.error('Failed to load Vanta Birds');
      };
      document.head.appendChild(vantaScript);
    } else {
      console.log('Vanta Birds already loaded');
      checkScriptsLoaded();
    }

    // Cleanup function
    return () => {
      if (vantaEffect.current) {
        try {
          vantaEffect.current.destroy();
        } catch (error) {
          console.error('Error destroying Vanta effect:', error);
        }
      }
    };
  }, []);

  return (
    <div
      ref={vantaRef}
      className={cn("fixed inset-0 -z-10 overflow-hidden", className)}
      style={{
        width: '100vw',
        height: '100vh',
        background: isLoaded
          ? 'transparent'
          : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        transition: 'background 0.5s ease-in-out'
      }}
    />
  );
};

export default VantaBirdsBackground;
