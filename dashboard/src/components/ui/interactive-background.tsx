"use client";

import React, { useRef, useEffect, useCallback } from 'react'; // Removed useState as it's not directly used here for component state
import { cn } from '@/lib/utils';
import { useTheme } from 'next-themes';
import { useIsMobile } from '@/hooks/use-mobile';

interface InteractiveBackgroundProps {
  className?: string;
  particleColor?: string;
  lineColor?: string;
  particleHighlightColor?: string;
  lineHighlightColor?: string;
  particleCount?: number;
  maxDistance?: number;
  mouseEffectRadius?: number;
  baseSpeed?: number;
}

const DEFAULT_PARTICLE_COLOR = "rgba(200, 220, 255, 0.7)";
const DEFAULT_LINE_COLOR = "rgba(200, 220, 255, 0.3)";
const DEFAULT_PARTICLE_HIGHLIGHT_COLOR = "rgba(234, 88, 12, 1)";
const DEFAULT_LINE_HIGHLIGHT_COLOR = "rgba(234, 88, 12, 0.7)";

const InteractiveBackground: React.FC<InteractiveBackgroundProps> = ({
  className,
  particleColor: particleColorProp = `var(--theme-particle-color, ${DEFAULT_PARTICLE_COLOR})`,
  lineColor: lineColorProp = `var(--theme-line-color, ${DEFAULT_LINE_COLOR})`,
  particleHighlightColor: particleHighlightColorProp = `var(--theme-particle-highlight-color, ${DEFAULT_PARTICLE_HIGHLIGHT_COLOR})`,
  lineHighlightColor: lineHighlightColorProp = `var(--theme-line-highlight-color, ${DEFAULT_LINE_HIGHLIGHT_COLOR})`,
  particleCount: particleCountProp = 200,
  maxDistance: maxDistanceProp = 160,
  mouseEffectRadius: mouseEffectRadiusProp = 250,
  baseSpeed = 0.2,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMobile = useIsMobile();

  // Adjusted parameters for mobile
  const particleCount = isMobile ? 120 : particleCountProp;
  const maxDistance = isMobile ? 120 : maxDistanceProp;
  const mouseEffectRadius = isMobile ? 150 : mouseEffectRadiusProp; // Mouse effect disabled on mobile

  const particlesArray = useRef<InstanceType<typeof Particle>[]>([]);
  const { theme, systemTheme } = useTheme();
  const currentTheme = theme === 'system' ? systemTheme : theme;

  const resolvedParticleColorRef = useRef(DEFAULT_PARTICLE_COLOR);
  const resolvedLineColorRef = useRef(DEFAULT_LINE_COLOR);
  const resolvedParticleHighlightColorRef = useRef(DEFAULT_PARTICLE_HIGHLIGHT_COLOR);
  const resolvedLineHighlightColorRef = useRef(DEFAULT_LINE_HIGHLIGHT_COLOR);
  const mousePosition = useRef({ x: -1000, y: -1000 }); // Start off-screen

  const parseRgba = useCallback((rgbaStr: string | undefined): { r: number; g: number; b: number; a: number } => {
    if (!rgbaStr) return { r: 0, g: 0, b: 0, a: 0 }; // Fallback for undefined
    const match = rgbaStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3]),
        a: match[4] !== undefined ? parseFloat(match[4]) : 1,
      };
    }
    // Basic hex to rgba conversion if needed (simple version)
    if (rgbaStr.startsWith('#')) {
        let hex = rgbaStr.slice(1);
        if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
        if (hex.length === 6) {
            return {
                r: parseInt(hex.substring(0, 2), 16),
                g: parseInt(hex.substring(2, 4), 16),
                b: parseInt(hex.substring(4, 6), 16),
                a: 1
            };
        }
    }
    // Fallback if parsing fails completely
    console.warn(`Failed to parse color string: ${rgbaStr}, falling back to transparent black.`);
    return { r: 0, g: 0, b: 0, a: 0 };
  }, []);

  const Particle = React.useMemo(() => {
    class ParticleInner {
    x: number;
    y: number;
    size: number;
    speedX: number;
    speedY: number;
    canvasWidth: number;
    canvasHeight: number;

    constructor(canvasWidth: number, canvasHeight: number) {
      this.canvasWidth = canvasWidth;
      this.canvasHeight = canvasHeight;
      this.x = Math.random() * canvasWidth;
      this.y = Math.random() * canvasHeight;
      this.size = Math.random() * 2 + 1; // Particle size between 1 and 3
      this.speedX = (Math.random() * 2 - 1) * baseSpeed; // Random horizontal speed
      this.speedY = (Math.random() * 2 - 1) * baseSpeed; // Random vertical speed
    }

    update() {
      this.x += this.speedX;
      this.y += this.speedY;

      // Boundary check (wrap around)
      if (this.x > this.canvasWidth + this.size) this.x = -this.size;
      if (this.x < -this.size) this.x = this.canvasWidth + this.size;
      if (this.y > this.canvasHeight + this.size) this.y = -this.size;
      if (this.y < -this.size) this.y = this.canvasHeight + this.size;

      // Mouse interaction: slightly push particles away from cursor
      if (mouseEffectRadius > 0) { // Only calculate if effect is enabled
        const dxMouse = this.x - mousePosition.current.x;
        const dyMouse = this.y - mousePosition.current.y;
        const distanceSqMouse = dxMouse * dxMouse + dyMouse * dyMouse; // Squared distance

        if (distanceSqMouse < mouseEffectRadius * mouseEffectRadius) {
          const distanceMouse = Math.sqrt(distanceSqMouse); // Calculate sqrt only when needed
          const forceDirectionX = dxMouse / distanceMouse;
          const forceDirectionY = dyMouse / distanceMouse;
          const force = (mouseEffectRadius - distanceMouse) / mouseEffectRadius;
          this.x += forceDirectionX * force * 0.5; // Adjust multiplier for push strength
          this.y += forceDirectionY * force * 0.5;
        }
      }
    }

    draw(ctx: CanvasRenderingContext2D) {
      let distanceMouse = Infinity;
      if (mouseEffectRadius > 0) {
        const dxMouse = this.x - mousePosition.current.x;
        const dyMouse = this.y - mousePosition.current.y;
        distanceMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);
      }
      
      const basePColor = parseRgba(resolvedParticleColorRef.current);
      const highlightPColor = parseRgba(resolvedParticleHighlightColorRef.current);
      
      let finalR = basePColor.r;
      let finalG = basePColor.g;
      let finalB = basePColor.b;
      let finalA = basePColor.a;
      let currentSize = this.size;

      // Apply highlight only if mouse effect is enabled (mouseEffectRadius > 0) and particle is within radius
      if (mouseEffectRadius > 0 && distanceMouse < mouseEffectRadius) {
        const proximity = 1 - (distanceMouse / mouseEffectRadius);
        finalR = Math.floor(basePColor.r + (highlightPColor.r - basePColor.r) * proximity);
        finalG = Math.floor(basePColor.g + (highlightPColor.g - basePColor.g) * proximity);
        finalB = Math.floor(basePColor.b + (highlightPColor.b - basePColor.b) * proximity);
        finalA = basePColor.a + (highlightPColor.a - basePColor.a) * proximity;
        currentSize = this.size + proximity * 2;
      }

      ctx.fillStyle = `rgba(${finalR}, ${finalG}, ${finalB}, ${finalA})`;
      ctx.beginPath();
      ctx.arc(this.x, this.y, currentSize, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return ParticleInner;
}, [baseSpeed, mouseEffectRadius, parseRgba, resolvedParticleColorRef, resolvedParticleHighlightColorRef]);

  const initParticles = useCallback((canvas: HTMLCanvasElement) => {
    particlesArray.current = [];
    // Use logical width/height for density calculation and particle constructor
    const logicalWidth = canvas.width / (window.devicePixelRatio || 1);
    const logicalHeight = canvas.height / (window.devicePixelRatio || 1);
    const count = Math.floor((logicalWidth * logicalHeight / 10000) * (particleCount / 70));
    for (let i = 0; i < Math.min(count, 200); i++) {
      particlesArray.current.push(new Particle(logicalWidth, logicalHeight));
    }
  }, [Particle, particleCount]);

  const connectParticles = useCallback((ctx: CanvasRenderingContext2D) => {
    const baseLColor = parseRgba(resolvedLineColorRef.current);
    const highlightLColor = parseRgba(resolvedLineHighlightColorRef.current);
    const maxDistanceSq = maxDistance * maxDistance; // Squared maxDistance

    for (let a = 0; a < particlesArray.current.length; a++) {
      for (let b = a + 1; b < particlesArray.current.length; b++) {
        const dx = particlesArray.current[a].x - particlesArray.current[b].x;
        const dy = particlesArray.current[a].y - particlesArray.current[b].y;
        const distanceSq = dx * dx + dy * dy; // Squared distance

        if (distanceSq < maxDistanceSq) {
          const distance = Math.sqrt(distanceSq); // Calculate sqrt only when needed for opacity/highlight
          const opacityFactor = 1 - distance / maxDistance;
          let finalR = baseLColor.r;
          let finalG = baseLColor.g;
          let finalB = baseLColor.b;
          let finalA = baseLColor.a;
          let currentLineWidth = 1;

          // Apply highlight only if mouse effect is enabled (mouseEffectRadius > 0)
          if (mouseEffectRadius > 0) {
            const dxMouseA = particlesArray.current[a].x - mousePosition.current.x;
            const dyMouseA = particlesArray.current[a].y - mousePosition.current.y;
            const distanceSqMouseA = dxMouseA * dxMouseA + dyMouseA * dyMouseA;

            const dxMouseB = particlesArray.current[b].x - mousePosition.current.x;
            const dyMouseB = particlesArray.current[b].y - mousePosition.current.y;
            const distanceSqMouseB = dxMouseB * dxMouseB + dyMouseB * dyMouseB;
            
            let highlightProximity = 0;
            if (distanceSqMouseA < mouseEffectRadius * mouseEffectRadius) {
              highlightProximity = Math.max(highlightProximity, 1 - (Math.sqrt(distanceSqMouseA) / mouseEffectRadius));
            }
            if (distanceSqMouseB < mouseEffectRadius * mouseEffectRadius) {
              highlightProximity = Math.max(highlightProximity, 1 - (Math.sqrt(distanceSqMouseB) / mouseEffectRadius));
            }

            if (highlightProximity > 0) {
               finalR = Math.floor(baseLColor.r + (highlightLColor.r - baseLColor.r) * highlightProximity);
               finalG = Math.floor(baseLColor.g + (highlightLColor.g - baseLColor.g) * highlightProximity);
               finalB = Math.floor(baseLColor.b + (highlightLColor.b - baseLColor.b) * highlightProximity);
               finalA = baseLColor.a + (highlightLColor.a - baseLColor.a) * highlightProximity;
               currentLineWidth = 1 + highlightProximity * 1.5;
            }
          }
          
          ctx.strokeStyle = `rgba(${finalR}, ${finalG}, ${finalB}, ${finalA * opacityFactor})`;
          ctx.lineWidth = currentLineWidth;
          ctx.beginPath();
          ctx.moveTo(particlesArray.current[a].x, particlesArray.current[a].y);
          ctx.lineTo(particlesArray.current[b].x, particlesArray.current[b].y);
          ctx.stroke();
        }
      }
    }
  }, [maxDistance, mouseEffectRadius, parseRgba]);

  const animationStep = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particlesArray.current.forEach(particle => {
      particle.update();
      particle.draw(ctx); // Particle.draw uses refs internally
    });
    connectParticles(ctx); // connectParticles uses refs internally
  }, [connectParticles]); // Dependencies are stable or use refs

  useEffect(() => {
    const tempEl = document.createElement('div');
    // Append to body only if it's not already there, or manage more carefully
    // For simplicity, assuming it's okay to briefly append for style computation.
    // A more robust solution might use a hidden, persistent element.
    if (typeof window !== 'undefined') { // Ensure this runs client-side
        document.body.appendChild(tempEl);
    }

    const resolveColor = (cssVarString: string, fallback: string): string => {
      if (typeof window === 'undefined') return fallback; // SSR guard
      tempEl.style.color = cssVarString; // e.g., "var(--my-color, red)"
      let computed = getComputedStyle(tempEl).color;
      
      // Ensure computed is in rgba format for consistent parsing by parseRgba
      const match = computed.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (match) {
          if (match[4] === undefined && computed.startsWith('rgb(')) { // rgb(r,g,b)
              return `rgba(${match[1]}, ${match[2]}, ${match[3]}, 1)`;
          }
          return computed; // Already rgba(r,g,b,a)
      }
      // If getComputedStyle returns a named color, hex, etc., try to parse it.
      // For simplicity, if it's not rgb/rgba, use the fallback.
      // A more robust solution would convert hex/hsl/named to rgba here.
      console.warn(`Could not parse computed color "${computed}" from "${cssVarString}", using fallback "${fallback}"`);
      return fallback;
    };

    resolvedParticleColorRef.current = resolveColor(particleColorProp, DEFAULT_PARTICLE_COLOR);
    resolvedLineColorRef.current = resolveColor(lineColorProp, DEFAULT_LINE_COLOR);
    resolvedParticleHighlightColorRef.current = resolveColor(particleHighlightColorProp, DEFAULT_PARTICLE_HIGHLIGHT_COLOR);
    resolvedLineHighlightColorRef.current = resolveColor(lineHighlightColorProp, DEFAULT_LINE_HIGHLIGHT_COLOR);

    if (typeof window !== 'undefined') {
        document.body.removeChild(tempEl);
    }
  }, [particleColorProp, lineColorProp, particleHighlightColorProp, lineHighlightColorProp, currentTheme, parseRgba]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number; // Defined here

    const resizeCanvas = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect && rect.width > 0 && rect.height > 0) {
        const logicalWidth = rect.width;
        const logicalHeight = rect.height;

        canvas.width = logicalWidth * dpr;
        canvas.height = logicalHeight * dpr;

        // Set canvas style for CSS layout if not already handled (optional, but good practice)
        // canvas.style.width = `${logicalWidth}px`;
        // canvas.style.height = `${logicalHeight}px`;

        // Reset transform and apply scale for HiDPI. Ensures scale doesn't compound.
        // Using setTransform is more robust for repeated calls.
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // Pass the canvas itself, initParticles will derive logical dimensions
        initParticles(canvas); 
      }
    };
    
    // Animation loop runner
    const runAnimation = () => {
      animationStep(ctx, canvas);
      animationFrameId = requestAnimationFrame(runAnimation);
    };

    resizeCanvas(); // Initial size
    runAnimation(); // Start animation loop

    const handleMouseMove = (event: MouseEvent) => {
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        // Mouse position should be in logical pixels, matching particle coordinates
        mousePosition.current = { 
            x: event.clientX - rect.left, 
            y: event.clientY - rect.top 
        };
      }
    };

    // Debounce resize handler for better performance
    let resizeTimeout: NodeJS.Timeout;
    const debouncedResizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        resizeCanvas();
      }, 100); // Adjust debounce delay as needed (e.g., 100-250ms)
    };

    window.addEventListener('resize', debouncedResizeHandler);
    document.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('resize', debouncedResizeHandler);
      document.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId); 
      clearTimeout(resizeTimeout); // Clear debounce timeout on unmount
      particlesArray.current = []; 
    };
  }, [animationStep, initParticles, baseSpeed, particleCount, maxDistance, mouseEffectRadius]); // Added dependencies

  return (
    <div className={cn("fixed inset-0 -z-10 overflow-hidden bg-background", className)}>
      <canvas ref={canvasRef} className="w-full h-full" /> {/* Ensure canvas fills the div */}
    </div>
  );
};

export default InteractiveBackground;
