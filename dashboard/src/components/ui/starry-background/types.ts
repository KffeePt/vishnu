import React from 'react';

export interface Particle {
  x: number;
  y: number;
  radius: number;
  vx: number;
  vy: number;
  opacity: number;
  lifespan: number;
  color: string;
}

export interface ExplosionFlash {
  x: number;
  y: number;
  radius: number;
  opacity: number;
  lifespan: number;
}

export interface Star {
  x: number;
  y: number;
  radius: number;
  speed: number;
  depth: number;
  vy?: number;
  isExplosion?: boolean;
  life?: number;
}

export interface AnimationPlugin {
  name: string;
  hotkey: string[];
  contextType: '2d' | 'webgl2';
  animate: (
    ctx: CanvasRenderingContext2D | WebGL2RenderingContext,
    canvas: HTMLCanvasElement,
    stars: React.MutableRefObject<Star[]>,
    particles: React.MutableRefObject<Particle[]>,
    flashes: React.MutableRefObject<ExplosionFlash[]>,
    mouse: React.MutableRefObject<{ x: number; y: number }>,
    theme: string
  ) => void;
  onActivate?: () => void;
  onDeactivate?: () => void;
  onClick?: (
    event: MouseEvent,
    canvas: HTMLCanvasElement,
    stars: React.MutableRefObject<Star[]>,
    particles: React.MutableRefObject<Particle[]>,
    flashes: React.MutableRefObject<ExplosionFlash[]>
  ) => void;
}