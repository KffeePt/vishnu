// components/ui/starry-background.tsx
"use client";

import React, { useEffect, useRef, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { AnimationPlugin } from './types';
import SansanMode from './sansan-mode';

interface StarryBackgroundProps {
  className?: string;
  plugins?: AnimationPlugin[];
}

interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  opacity: number;
  lifespan: number;
  color: string;
}

interface ExplosionFlash {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  lifespan: number;
}

interface Star {
  x: number;
  y: number;
  radius: number;
  speed: number;
  depth: number;
}

const StarryBackground: React.FC<StarryBackgroundProps> = ({ className, plugins = [] }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { theme, resolvedTheme } = useTheme();
  const [sansanMode, setSansanMode] = React.useState(false);
  const [isActivatingSansanMode, setIsActivatingSansanMode] = React.useState(false);
  const isActivatingSansanModeRef = useRef(isActivatingSansanMode);
  const [activePlugin, setActivePlugin] = React.useState<AnimationPlugin | null>(null);
  const webglStateRef = useRef<any>({});

  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<ExplosionFlash[]>([]);
  const starsRef = useRef<Star[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);
  const starColorRef = useRef('rgba(255, 255, 255, 0.8)');
  const mouseRef = useRef({ x: 0, y: 0 });
  const isShakingRef = useRef(false);
  const hueRef = useRef(0);
  const sansanModeRef = useRef(sansanMode);
  const sansanModeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    isActivatingSansanModeRef.current = isActivatingSansanMode;
  }, [isActivatingSansanMode]);
  
  // Keep the ref in sync with the state
  useEffect(() => {
    sansanModeRef.current = sansanMode;
  }, [sansanMode]);

  const getOriginalColors = useCallback(() => {
    const tempEl = document.createElement('div');
    tempEl.style.display = 'none';
    document.body.appendChild(tempEl);
    tempEl.style.color = 'hsl(var(--background))';
    const bgColor = getComputedStyle(tempEl).color;
    tempEl.style.color = 'hsl(var(--foreground))';
    const fgColorRgb = getComputedStyle(tempEl).color;
    document.body.removeChild(tempEl);
    const starColor = fgColorRgb.replace('rgb', 'rgba').replace(')', ', 0.8)');
    return { bgColor, starColor };
  }, []);

  const handleSetSansanMode = useCallback((value: React.SetStateAction<boolean>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const newSansanModeValue = typeof value === 'function' ? value(sansanMode) : value;

    if (newSansanModeValue) {
        setIsActivatingSansanMode(true);
        
        hueRef.current = 0;
        const isDark = resolvedTheme === 'dark';
        const bgLightness = isDark ? 20 : 80;
        canvas.style.backgroundColor = `hsl(0, 100%, ${bgLightness}%)`;

        if (sansanModeTimerRef.current) {
            clearTimeout(sansanModeTimerRef.current);
        }
        sansanModeTimerRef.current = setTimeout(() => {
            setIsActivatingSansanMode(false);
        }, 2000); // Corresponds to the transition duration
    }
    setSansanMode(value);
  }, [sansanMode, resolvedTheme]);

  const hslToHex = (hsl: string) => {
    const [h, s, l] = hsl.match(/\d+/g)!.map(Number);
    const hDecimal = h / 360;
    const sDecimal = s / 100;
    const lDecimal = l / 100;
    let r, g, b;
    if (s === 0) {
      r = g = b = lDecimal;
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = lDecimal < 0.5 ? lDecimal * (1 + sDecimal) : lDecimal + sDecimal - lDecimal * sDecimal;
      const p = 2 * lDecimal - q;
      r = hue2rgb(p, q, hDecimal + 1 / 3);
      g = hue2rgb(p, q, hDecimal);
      b = hue2rgb(p, q, hDecimal - 1 / 3);
    }
    const toHex = (x: number) => {
      const hex = Math.round(x * 255).toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  };

  const triggerExplosion = (x: number, y: number, particleColors: string[]) => {
    const particleCount = 30;
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 4 + 1;
        particlesRef.current.push({
            x: x,
            y: y,
            radius: Math.random() * 2 + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            opacity: 1,
            lifespan: 100,
            color: particleColors[Math.floor(Math.random() * particleColors.length)]
        });
    }
    flashesRef.current.push({
        x: x,
        y: y,
        radius: 30,
        opacity: 1,
        lifespan: 15,
    });
    const canvas = canvasRef.current;
    if (!canvas || isShakingRef.current) return;
    isShakingRef.current = true;
    canvas.style.transform = `translate(${Math.random() * 10 - 5}px, ${Math.random() * 10 - 5}px)`;
    canvas.style.filter = 'blur(2px)';
    setTimeout(() => {
        canvas.style.transform = 'translate(0, 0)';
        canvas.style.filter = 'none';
        setTimeout(() => {
            isShakingRef.current = false;
        }, 200);
    }, 100);
  };

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      return;
    }

    const contextType = activePlugin?.contextType || '2d';
    const ctx = canvas.getContext(contextType);

    if (!ctx) {
      animationFrameIdRef.current = requestAnimationFrame(animate);
      return;
    }

    if (ctx instanceof CanvasRenderingContext2D) {
      const { bgColor, starColor } = getOriginalColors();
      if (!sansanModeRef.current) {
        canvas.style.backgroundColor = bgColor;
        starColorRef.current = starColor;
      }

      if (sansanModeRef.current) {
          const hue = hueRef.current;
          const isDark = resolvedTheme === 'dark';
          const particleLightness = 75;
          const starLightness = isDark ? 95 : 5;

          if (!isActivatingSansanModeRef.current) {
              hueRef.current = (hueRef.current + 0.5) % 360;
              const bgLightness = isDark ? 20 : 80;
              canvas.style.backgroundColor = `hsl(${hueRef.current}, 100%, ${bgLightness}%)`;
          }
          
          starColorRef.current = `hsla(${hue}, 100%, ${starLightness}%, 0.8)`;

          if (Math.random() < 0.05) {
              const newParticleColors = [
                  `hsl(${(hue + 180) % 360}, 100%, ${particleLightness}%)`, // Complementary
                  `hsl(${(hue + 120) % 360}, 100%, ${particleLightness}%)`, // Triadic
                  `hsl(${(hue + 240) % 360}, 100%, ${particleLightness}%)`, // Triadic
              ].map(hslToHex);
              const randomStar = starsRef.current[Math.floor(Math.random() * starsRef.current.length)];
              if(randomStar) {
                  triggerExplosion(randomStar.x, randomStar.y, newParticleColors);
              }
          }
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      starsRef.current.forEach((star: Star) => {
        star.y -= star.speed;
        if (star.y < 0) {
          star.y = canvas.height;
          star.x = Math.random() * canvas.width;
        }
        ctx.fillStyle = starColorRef.current;
        ctx.beginPath();
        const parallaxX = (mouseRef.current.x - canvas.width / 2) * (star.depth * 0.1);
        const parallaxY = (mouseRef.current.y - canvas.height / 2) * (star.depth * 0.1);
        ctx.arc(star.x + parallaxX, star.y + parallaxY, star.radius, 0, Math.PI * 2);
        ctx.fill();
      });

      for (let i = flashesRef.current.length - 1; i >= 0; i--) {
        const flash = flashesRef.current[i];
        flash.lifespan--;
        flash.opacity = flash.lifespan / 15;
        flash.radius += 5;

        if (flash.lifespan <= 0) {
          flashesRef.current.splice(i, 1);
        } else {
          const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
          gradient.addColorStop(0, `rgba(255, 255, 255, ${flash.opacity * 0.8})`);
          gradient.addColorStop(0.5, `rgba(255, 255, 224, ${flash.opacity * 0.5})`);
          gradient.addColorStop(1, `rgba(255, 255, 224, 0)`);
          
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.05;
        p.lifespan--;
        p.opacity = p.lifespan / 100;
        if (p.lifespan <= 0) {
          particlesRef.current.splice(i, 1);
        } else {
          ctx.fillStyle = `rgba(${parseInt(p.color.slice(1, 3), 16)}, ${parseInt(p.color.slice(3, 5), 16)}, ${parseInt(p.color.slice(5, 7), 16)}, ${p.opacity})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    
    if (activePlugin) {
      if (ctx instanceof CanvasRenderingContext2D || ctx instanceof WebGL2RenderingContext) {
        activePlugin.animate(ctx, canvas, starsRef, particlesRef, flashesRef, mouseRef, resolvedTheme || 'dark');
      }
    }

    animationFrameIdRef.current = requestAnimationFrame(animate);
  }, [resolvedTheme, getOriginalColors, activePlugin]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const parent = canvas.parentElement;
      if (!parent) return;

      const rect = parent.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.scale(dpr, dpr);
      }

      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    };
    const initStars = () => {
      starsRef.current = [];
      const numStars = 100;
      for (let i = 0; i < numStars; i++) {
        starsRef.current.push({
          x: Math.random() * canvas.width,
          y: Math.random() * canvas.height, // These should be based on logical size
          radius: Math.random() * 1.5 + 0.5,
          speed: Math.random() * 0.3 + 0.1,
          depth: Math.random()
        });
      }
    };
    resizeCanvas();
    initStars();
    
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeCanvas();
        initStars();
      }, 100); // Debounce resize event
    };

    const handleMouseMove = (e: MouseEvent) => {
      mouseRef.current.x = e.clientX;
      mouseRef.current.y = e.clientY;
    };
    mouseRef.current = {
        x: window.innerWidth / 2,
        y: window.innerHeight / 2,
    };
    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    animationFrameIdRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
    };
  }, [animate]);

  useEffect(() => {
    const keysPressed: { [key: string]: boolean } = {};

    const handleKeyDown = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      keysPressed[key] = true;

      for (const plugin of plugins) {
        const allKeysPressed = plugin.hotkey.every((k: string) => keysPressed[k.toLowerCase()]);
        if (allKeysPressed) {
          setActivePlugin((currentPlugin: AnimationPlugin | null) => {
            const newPlugin = currentPlugin?.name === plugin.name ? null : plugin;
            if (newPlugin?.onActivate) newPlugin.onActivate();
            else if (currentPlugin?.onDeactivate) currentPlugin.onDeactivate();
            return newPlugin;
          });
          // Clear keys to prevent rapid toggling
          for (const k of plugin.hotkey) {
            keysPressed[k.toLowerCase()] = false;
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [plugins]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleClick = (event: MouseEvent) => {
      if (activePlugin?.onClick) {
        activePlugin.onClick(event, canvas, starsRef, particlesRef, flashesRef);
      }
    };

    canvas.addEventListener('click', handleClick);
    return () => {
      canvas.removeEventListener('click', handleClick);
    };
  }, [activePlugin]);

  return (
    <>
      <SansanMode setSansanMode={handleSetSansanMode} />
      <canvas
        ref={canvasRef}
        className={`absolute top-0 left-0 -z-10 ${className || ''}`}
        style={{
          transition: (sansanMode && !isActivatingSansanMode) ? 'none' : 'background-color 2s ease-in-out, transform 0.2s ease-in-out, filter 0.2s ease-in-out',
        }}
      />
    </>
  );
};

export default StarryBackground;
