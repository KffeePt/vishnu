import React from 'react';
import { AnimationPlugin, Star } from './types';

// Utility function to create an explosion
const createExplosion = (x: number, y: number, particles: React.MutableRefObject<any[]>, flashes: React.MutableRefObject<any[]>) => {
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 4 + 1;
    particles.current.push({
      x: x,
      y: y,
      radius: Math.random() * 2 + 1,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      opacity: 1,
      lifespan: 100,
      color: '#ffffff'
    });
  }
  flashes.current.push({
    x: x,
    y: y,
    radius: 30,
    opacity: 1,
    lifespan: 15,
  });
};

const gravityModePlugin: AnimationPlugin = {
  name: 'GravityMode',
  hotkey: ['shift', 'g'],
  contextType: '2d',
  
  onClick: (event, canvas, stars, particles, flashes) => {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    for (let i = 0; i < stars.current.length; i++) {
      const star = stars.current[i];
      const dx = x - star.x;
      const dy = y - star.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < star.radius * 3) {
        createExplosion(star.x, star.y, particles, flashes);
        stars.current.splice(i, 1);
        break;
      }
    }
  },

  animate: (ctx, canvas, stars) => {
    if (!(ctx instanceof CanvasRenderingContext2D)) return;

    stars.current.forEach((star, index) => {
      star.speed += 0.2; // Increased gravity for faster dropping
      star.y += star.speed;

      // Bounce off the bottom of the screen and settle
      if (star.y > canvas.height - star.radius * 3) {
        star.y = canvas.height - star.radius * 3;
        star.speed *= -0.6;
        if (Math.abs(star.speed) < 1) {
          star.speed = 0;
        }
      }
      
      // Collision with other stars
      for (let i = index + 1; i < stars.current.length; i++) {
        const otherStar = stars.current[i];
        const dx = otherStar.x - star.x;
        const dy = otherStar.y - star.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const minDistance = (star.radius + otherStar.radius) * 3;

        if (distance < minDistance) {
          const angle = Math.atan2(dy, dx);
          const overlap = minDistance - distance;
          star.x -= Math.cos(angle) * overlap / 2;
          star.y -= Math.sin(angle) * overlap / 2;
          otherStar.x += Math.cos(angle) * overlap / 2;
          otherStar.y += Math.sin(angle) * overlap / 2;

          const tempSpeed = star.speed;
          star.speed = otherStar.speed;
          otherStar.speed = tempSpeed;
        }
      }

      // Draw the star
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.radius * 3, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw the boundary wall
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.fillRect(0, canvas.height - 5, canvas.width, 5);
  },
};

export default gravityModePlugin;