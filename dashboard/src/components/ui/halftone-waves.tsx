"use client"

import { useEffect, useRef } from 'react'

interface HalftoneWavesProps {
  color?: { r: number; g: number; b: number } | string;
}

export default function HalftoneWaves({ color }: HalftoneWavesProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animationFrameId: number
    let time = 0

    // Process color prop
    let fillColorR = 255
    let fillColorG = 255
    let fillColorB = 255
    
    if (color) {
      if (typeof color === 'string') {
        // Handle string color (e.g. '#ff0000')
        const hexMatch = color.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (hexMatch) {
          fillColorR = parseInt(hexMatch[1], 16);
          fillColorG = parseInt(hexMatch[2], 16);
          fillColorB = parseInt(hexMatch[3], 16);
        }
      } else if (typeof color === 'object' && 'r' in color && 'g' in color && 'b' in color) {
        // Handle RGB object
        fillColorR = color.r;
        fillColorG = color.g;
        fillColorB = color.b;
      }
    }

    const resizeCanvas = () => {
      const container = canvas.parentElement
      if (container) {
        canvas.width = container.offsetWidth
        canvas.height = container.offsetHeight
      }
    }

    const drawHalftoneWave = () => {
      const gridSize = 20
      const rows = Math.ceil(canvas.height / gridSize)
      const cols = Math.ceil(canvas.width / gridSize)

      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
          const centerX = x * gridSize
          const centerY = y * gridSize
          const distanceFromCenter = Math.sqrt(
            Math.pow(centerX - canvas.width / 2, 2) +
            Math.pow(centerY - canvas.height / 2, 2)
          )
          const maxDistance = Math.sqrt(
            Math.pow(canvas.width / 2, 2) +
            Math.pow(canvas.height / 2, 2)
          )
          const normalizedDistance = distanceFromCenter / maxDistance
          
          const waveOffset = Math.sin(normalizedDistance * 10 - time) * 0.5 + 0.5
          const size = gridSize * waveOffset * 0.8

          ctx.beginPath()
          ctx.arc(centerX, centerY, size / 2, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${fillColorR}, ${fillColorG}, ${fillColorB}, ${waveOffset * 0.5})`
          ctx.fill()
        }
      }
    }

    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      drawHalftoneWave()

      time += 0.05
      animationFrameId = requestAnimationFrame(animate)
    }

    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)

    animate()

    return () => {
      cancelAnimationFrame(animationFrameId)
      window.removeEventListener('resize', resizeCanvas)
    }
  }, [color])

  return <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-0" />
}
