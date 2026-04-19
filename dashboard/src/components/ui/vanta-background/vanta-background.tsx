'use client';
import React, { useState, useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';

declare global {
  interface Window {
    VANTA: any;
  }
}

const VantaBackground: React.FC = () => {
  const { theme } = useTheme();
  const vantaRef = useRef<HTMLDivElement>(null);
  const [vantaEffect, setVantaEffect] = useState<any>(null);
  const animationFrameId = useRef<number | null>(null);

  // State for bouncing effect
  const xOffset = useRef(0);
  const yOffset = useRef(0);
  const xDirection = useRef(0);
  const yDirection = useRef(0);
  const speed = 0.002;

  // State for color cycling
  const baseHue = useRef(0);
  const bgHue = useRef(0);

  useEffect(() => {
    xOffset.current = Math.random() * 0.4 - 0.2;
    yOffset.current = Math.random() * 0.4 - 0.2;
    xDirection.current = Math.random() > 0.5 ? 1 : -1;
    yDirection.current = Math.random() > 0.5 ? 1 : -1;
    baseHue.current = Math.random() * 360;
    bgHue.current = Math.random() * 360;
  }, []);

  const hslToHex = (h: number, s: number, l: number): number => {
    l /= 100;
    const a = s * Math.min(l, 1 - l) / 100;
    const f = (n: number) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return parseInt(`0x${f(0)}${f(8)}${f(4)}`);
  };

  useEffect(() => {
    const loadScripts = async () => {
      try {
        if (document.getElementById('three-script') && document.getElementById('vanta-halo-script')) {
          initializeVanta();
          return;
        }

        const threeScript = document.createElement('script');
        threeScript.id = 'three-script';
        threeScript.src = '/scripts/three.r134.min.js';
        threeScript.async = true;
        document.body.appendChild(threeScript);

        threeScript.onload = () => {
          const vantaScript = document.createElement('script');
          vantaScript.id = 'vanta-halo-script';
          vantaScript.src = '/scripts/vanta.halo.min.js';
          vantaScript.async = true;
          document.body.appendChild(vantaScript);

          vantaScript.onload = () => {
            initializeVanta();
          };
        };
      } catch (error) {
        console.error("Error loading Vanta scripts:", error);
      }
    };

    const initializeVanta = () => {
      if (window.VANTA && vantaRef.current && !vantaEffect) {
        const effect = window.VANTA.HALO({
          el: vantaRef.current,
          mouseControls: true,
          touchControls: true,
          gyroControls: false,
          minHeight: 200.00,
          minWidth: 200.00,
          xOffset: xOffset.current,
          yOffset: yOffset.current,
          size: 1.5,
          baseColor: hslToHex(baseHue.current, 100, 50),
          backgroundColor: hslToHex(bgHue.current, 100, theme === 'dark' ? 20 : 80),
        });
        setVantaEffect(effect);
      }
    };

    loadScripts();

    return () => {
      if (vantaEffect) {
        vantaEffect.destroy();
      }
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, []); // Removed vantaEffect from dependencies to avoid re-initialization

  useEffect(() => {
    const animate = () => {
      // Bouncing logic
      xOffset.current += xDirection.current * speed;
      yOffset.current += yDirection.current * speed;

      if (xOffset.current > 0.5 || xOffset.current < -0.5) {
        xDirection.current *= -1;
      }
      if (yOffset.current > 0.5 || yOffset.current < -0.5) {
        yDirection.current *= -1;
      }

      // Color cycling logic
      baseHue.current = (baseHue.current + 0.5) % 360;
      bgHue.current = (bgHue.current + 0.3) % 360;

      if (vantaEffect) {
        vantaEffect.setOptions({
          xOffset: xOffset.current,
          yOffset: yOffset.current,
          baseColor: hslToHex(baseHue.current, 100, 50),
          backgroundColor: hslToHex(bgHue.current, 100, theme === 'dark' ? 20 : 80),
        });
      }

      animationFrameId.current = requestAnimationFrame(animate);
    };

    if (vantaEffect) {
      animate();
    }

    return () => {
      if (animationFrameId.current) {
        cancelAnimationFrame(animationFrameId.current);
      }
    };
  }, [vantaEffect, theme]);


  return <div ref={vantaRef} style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%' }} />;
};

export default VantaBackground;
