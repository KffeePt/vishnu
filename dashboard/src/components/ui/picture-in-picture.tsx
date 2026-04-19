"use client";

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { X, Minus, Maximize2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';

interface TabConfig {
  id: string;
  label: string;
  content: React.ReactNode;
}

interface PictureInPictureProps {
  isOpen: boolean;
  onClose: () => void;
  tabs: TabConfig[];
  title?: string;
  defaultPosition?: { x: number; y: number };
  defaultSize?: { width: number; height: number };
  minWidth?: number;
  minHeight?: number;
  maxWidth?: number;
  maxHeight?: number;
}

export function PictureInPicture({
  isOpen,
  onClose,
  tabs,
  title = "Test Mode",
  defaultPosition = { x: 20, y: 20 },
  defaultSize = { width: 400, height: 300 },
  minWidth = 300,
  minHeight = 200,
  maxWidth = 800,
  maxHeight = 600,
}: PictureInPictureProps) {
  const [position, setPosition] = useState(defaultPosition);
  const [size, setSize] = useState(defaultSize);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<HTMLDivElement>(null);

  // Handle dragging
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!dragRef.current || isMinimized) return;
    setIsDragging(true);
    setDragStart({
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    });
    e.preventDefault();
  }, [position, isMinimized]);

  // Handle resizing
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    if (isMinimized) return;
    setIsResizing(true);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: size.width,
      height: size.height,
    });
    e.preventDefault();
  }, [size, isMinimized]);

  // Global mouse move and mouse up handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = Math.max(0, Math.min(window.innerWidth - size.width, e.clientX - dragStart.x));
        const newY = Math.max(0, Math.min(window.innerHeight - (isMinimized ? 40 : size.height), e.clientY - dragStart.y));
        setPosition({ x: newX, y: newY });
      } else if (isResizing) {
        const deltaX = e.clientX - resizeStart.x;
        const deltaY = e.clientY - resizeStart.y;
        const newWidth = Math.max(minWidth, Math.min(maxWidth, resizeStart.width + deltaX));
        const newHeight = Math.max(minHeight, Math.min(maxHeight, resizeStart.height + deltaY));
        setSize({ width: newWidth, height: newHeight });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    if (isDragging || isResizing) {
      document.body.style.cursor = isResizing ? 'nw-resize' : 'move';
      document.body.style.userSelect = 'none';
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isDragging, isResizing, dragStart, resizeStart, size, minWidth, minHeight, maxWidth, maxHeight, isMinimized, setPosition, setSize]);

  // Reset to default position and size
  const handleReset = () => {
    setPosition(defaultPosition);
    setSize(defaultSize);
    setIsMinimized(false);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={containerRef}
      className="fixed z-50 shadow-2xl bg-background border rounded-lg overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
        width: isMinimized ? '300px' : `${size.width}px`,
        height: isMinimized ? '40px' : `${size.height}px`,
      }}
    >
      {/* Header */}
      <div
        ref={dragRef}
        onMouseDown={handleMouseDown}
        className="flex items-center justify-between p-2 bg-primary/10 border-b cursor-move select-none"
      >
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsMinimized(!isMinimized)}
            className="h-6 w-6 p-0 hover:bg-primary/20"
          >
            <Minus className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-6 w-6 p-0 hover:bg-primary/20"
          >
            <RotateCcw className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="h-6 w-6 p-0 hover:bg-destructive/20 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="h-full overflow-hidden">
          <Tabs defaultValue={tabs[0]?.id} className="h-full flex flex-col">
            <TabsList className="grid w-full grid-cols-2 bg-background border-b">
              {tabs.map((tab) => (
                <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <div className="flex-1 overflow-auto">
              {tabs.map((tab) => (
                <TabsContent key={tab.id} value={tab.id} className="h-full mt-0">
                  <Card className="h-full border-0 shadow-none bg-background">
                    <div className="p-3 h-full overflow-auto">
                      {tab.content}
                    </div>
                  </Card>
                </TabsContent>
              ))}
            </div>
          </Tabs>
        </div>
      )}

      {/* Resize Handle */}
      {!isMinimized && (
        <div
          onMouseDown={handleResizeMouseDown}
          className="absolute bottom-0 right-0 w-6 h-6 cursor-nw-resize bg-primary/10 hover:bg-primary/20 transition-colors"
          style={{
            backgroundImage: 'radial-gradient(circle, transparent 40%, rgba(0,0,0,0.2) 41%, rgba(0,0,0,0.2) 50%, transparent 51%)',
          }}
        />
      )}
    </div>
  );
}

export default PictureInPicture;