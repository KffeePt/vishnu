"use client";

import React, { forwardRef, useImperativeHandle, useRef, useCallback, useEffect } from 'react';

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

export interface ParticleExplosionHandles {
  trigger: (x: number, y: number) => void;
}

interface ParticleExplosionProps {
  colors: string[];
}

const ParticleExplosion = forwardRef<ParticleExplosionHandles, ParticleExplosionProps>(({ colors }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<ExplosionFlash[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  const triggerExplosion = useCallback((x: number, y: number) => {
    const particleCount = 50;
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 6 + 2;
        particlesRef.current.push({
            x: x,
            y: y,
            radius: Math.random() * 2.5 + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            opacity: 1,
            lifespan: 120,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    flashesRef.current.push({
        x: x,
        y: y,
        radius: 40,
        opacity: 1,
        lifespan: 20,
    });
  }, [colors]);

  useImperativeHandle(ref, () => ({
    trigger: triggerExplosion
  }));

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (let i = flashesRef.current.length - 1; i >= 0; i--) {
      const flash = flashesRef.current[i];
      flash.lifespan--;
      flash.opacity = flash.lifespan / 20;
      flash.radius += 7;

      if (flash.lifespan <= 0) {
        flashesRef.current.splice(i, 1);
      } else {
        const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flash.opacity * 0.7})`);
        gradient.addColorStop(0.8, `rgba(255, 255, 224, ${flash.opacity * 0.3})`);
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
      p.vy += 0.08;
      p.lifespan--;
      p.opacity = p.lifespan / 120;
      if (p.lifespan <= 0) {
        particlesRef.current.splice(i, 1);
      } else {
        ctx.fillStyle = p.color.startsWith('#') 
            ? `${p.color}${Math.round(p.opacity * 255).toString(16).padStart(2, '0')}`
            : `rgba(${parseInt(p.color.slice(1, 3), 16)}, ${parseInt(p.color.slice(3, 5), 16)}, ${parseInt(p.color.slice(5, 7), 16)}, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    
    if (particlesRef.current.length > 0 || flashesRef.current.length > 0) {
        animationFrameIdRef.current = requestAnimationFrame(animate);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    const startAnimation = () => {
        if (particlesRef.current.length > 0 || flashesRef.current.length > 0) {
            animationFrameIdRef.current = requestAnimationFrame(animate);
        }
    };
    
    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList' && (particlesRef.current.length > 0 || flashesRef.current.length > 0)) {
                startAnimation();
                break;
            }
        }
    });

    // This is a bit of a hack to restart animation when new particles are added
    const interval = setInterval(() => {
        if (particlesRef.current.length > 0 || flashesRef.current.length > 0) {
            if (!animationFrameIdRef.current) {
                startAnimation();
            }
        } else if (animationFrameIdRef.current) {
            cancelAnimationFrame(animationFrameIdRef.current);
            animationFrameIdRef.current = null;
        }
    }, 100);


    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
      observer.disconnect();
      clearInterval(interval);
    };
  }, [animate]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute top-0 left-0 w-full h-full z-50"
    />
  );
});

ParticleExplosion.displayName = 'ParticleExplosion';
export default ParticleExplosion;
