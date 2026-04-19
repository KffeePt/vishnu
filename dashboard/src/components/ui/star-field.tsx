"use client";

import React, { useEffect, useRef } from "react";
import { useTheme } from "next-themes";

interface Star {
    x: number;
    y: number;
    radius: number;
    speed: number;
    alpha: number;
}

export default function StarField() {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const { theme, systemTheme } = useTheme();

    // Determine actual theme taking system into account
    const currentTheme = theme === "system" ? systemTheme : theme;
    const isDark = currentTheme === "dark";

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        let animationFrameId: number;
        let stars: Star[] = [];

        // Resize canvas to fill window natively
        const resizeCanvas = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars();
        };

        // Initialize random stars
        const initStars = () => {
            stars = [];
            const numStars = Math.floor((canvas.width * canvas.height) / 5000); // responsive star count

            for (let i = 0; i < numStars; i++) {
                // Varying speeds create parallax effect
                // Slower = further away, Faster = closer
                const layer = Math.random();
                let speed, radius, alpha;

                if (layer < 0.6) {
                    // Far layer
                    speed = Math.random() * 0.2 + 0.05;
                    radius = Math.random() * 0.8 + 0.4;
                    alpha = Math.random() * 0.3 + 0.1;
                } else if (layer < 0.9) {
                    // Mid layer
                    speed = Math.random() * 0.4 + 0.2;
                    radius = Math.random() * 1.2 + 0.8;
                    alpha = Math.random() * 0.5 + 0.3;
                } else {
                    // Near layer
                    speed = Math.random() * 0.8 + 0.5;
                    radius = Math.random() * 1.8 + 1.2;
                    alpha = Math.random() * 0.8 + 0.5;
                }

                stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    radius,
                    speed,
                    alpha,
                });
            }
        };

        const animate = () => {
            // Clear canvas with transparent background
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Star Color - White for Dark mode, very dim gray for Light mode
            const rgb = isDark ? "255, 255, 255" : "150, 150, 150";

            // Draw and update stars
            for (const star of stars) {
                ctx.beginPath();
                ctx.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${rgb}, ${star.alpha})`;
                ctx.fill();

                // Move star down
                star.y -= star.speed;

                // Reset to bottom if it goes off top
                if (star.y < 0) {
                    star.y = canvas.height;
                    star.x = Math.random() * canvas.width;
                }
            }

            animationFrameId = requestAnimationFrame(animate);
        };

        // Initial setup
        resizeCanvas();
        animate();

        window.addEventListener("resize", resizeCanvas);

        return () => {
            window.removeEventListener("resize", resizeCanvas);
            cancelAnimationFrame(animationFrameId);
        };
    }, [isDark]);

    return (
        <canvas
            ref={canvasRef}
            className="fixed inset-0 w-full h-full pointer-events-none -z-10 bg-transparent transition-opacity duration-1000"
        />
    );
}
