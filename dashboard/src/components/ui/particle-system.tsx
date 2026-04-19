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

interface Flash {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  lifespan: number;
}

export interface ParticleSystemHandles {
  createExplosion: (x: number, y: number, colors: string[]) => void;
}

const ParticleSystem = forwardRef<ParticleSystemHandles, {}>((props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particlesRef = useRef<Particle[]>([]);
  const flashesRef = useRef<Flash[]>([]);
  const animationFrameIdRef = useRef<number | null>(null);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Animate flashes
    for (let i = flashesRef.current.length - 1; i >= 0; i--) {
      const flash = flashesRef.current[i];
      flash.lifespan--;
      flash.opacity = flash.lifespan / 25;
      flash.radius += 8;

      if (flash.lifespan <= 0) {
        flashesRef.current.splice(i, 1);
      } else {
        const gradient = ctx.createRadialGradient(flash.x, flash.y, 0, flash.x, flash.y, flash.radius);
        gradient.addColorStop(0, `rgba(255, 255, 255, ${flash.opacity * 0.8})`);
        gradient.addColorStop(0.7, `rgba(255, 255, 224, ${flash.opacity * 0.4})`);
        gradient.addColorStop(1, `rgba(255, 255, 224, 0)`);
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(flash.x, flash.y, flash.radius, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Animate particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
      const p = particlesRef.current[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1; // Gravity
      p.lifespan--;
      p.opacity = Math.max(0, p.lifespan / 150);

      if (p.lifespan <= 0) {
        particlesRef.current.splice(i, 1);
      } else {
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }
    
    if (particlesRef.current.length > 0 || flashesRef.current.length > 0) {
        animationFrameIdRef.current = requestAnimationFrame(animate);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationFrameIdRef.current as number);
        animationFrameIdRef.current = null;
    }
  }, []);

  const createExplosion = useCallback((x: number, y: number, colors: string[]) => {
    const particleCount = 50 + Math.random() * 20;
    for (let i = 0; i < particleCount; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 7 + 2;
        particlesRef.current.push({
            x: x,
            y: y,
            radius: Math.random() * 3 + 1,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2, // Add a slight upward bias
            opacity: 1,
            lifespan: 120 + Math.random() * 30,
            color: colors[Math.floor(Math.random() * colors.length)]
        });
    }
    flashesRef.current.push({
        x: x,
        y: y,
        radius: 50,
        opacity: 1,
        lifespan: 25,
    });
    
    if (!animationFrameIdRef.current) {
        animate();
    }
  }, [animate]);

  useImperativeHandle(ref, () => ({
    createExplosion
  }));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animationFrameIdRef.current) {
        cancelAnimationFrame(animationFrameIdRef.current);
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none fixed top-0 left-0 w-full h-full z-"
    />
  );
});

ParticleSystem.displayName = 'ParticleSystem';
export default ParticleSystem;
