import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { HorizontalRoladexCarousel } from './horizontal-roladex-carousel';
import type { CarouselItem } from '../types';

export interface ProjectImage {
  id: string;
  url: string;
  title?: string;
  subtitle?: string;
  type?: 'image' | 'video';
}

export interface FullscreenViewProps {
  isOpen: boolean;
  onClose: () => void;
  project: {
    id: string;
    title: string;
    description: string;
    mainImage: { url: string; title?: string; subtitle?: string };
    additionalImages?: ProjectImage[];
    url?: string;
    author: string;
    aspectRatio?: string;
  };
}

export const FullscreenView: React.FC<FullscreenViewProps> = ({ isOpen, onClose, project }) => {
  const [isHorizontalCarouselVisible, setIsHorizontalCarouselVisible] = useState(false);
  
  const aspectRatio = project.aspectRatio
    ? (() => {
        const [w, h] = project.aspectRatio.split('/').map(Number);
        return w / h;
      })()
    : 16 / 9;

  const allImages = [
    { id: 'main', url: project.mainImage.url, title: project.mainImage.title || project.title, subtitle: project.mainImage.subtitle || '', type: 'image' as const },
    ...(project.additionalImages || [])
  ];

  const carouselItems: CarouselItem[] = allImages.map(image => ({
    id: image.id,
    title: image.title || project.title,
    subtitle: image.subtitle,
    description: project.description, // Adding required description property
    imageUrl: image.url,
    author: project.author,
    type: image.type,
  }));

  useEffect(() => {
    setIsHorizontalCarouselVisible(true);
  }, [project.additionalImages]);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (!isOpen) return;
    
    if (e.key === 'Escape') {
      onClose();
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md"
        >
          <div className="h-full flex flex-col">
            <div className="flex-1 flex items-center justify-center relative px-16 py-8">
              <Button
                onClick={onClose}
                size="icon"
                className="absolute right-4 top-4 z-10 rounded-full border border-white/20 bg-background/20 text-white backdrop-blur-sm transition-colors hover:bg-background/30"
              >
                <X className="h-6 w-6" />
              </Button>
              {isHorizontalCarouselVisible ? (
                <motion.div
                  initial={{ opacity: 0, y: 50 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="bg-black/50 backdrop-blur-sm border-t border-white/10 py-4 w-full"
                >
                  <HorizontalRoladexCarousel items={carouselItems} aspectRatio={aspectRatio} />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.3 }}
                  className="w-full h-full flex items-center justify-center"
                >
                  <img
                    src={project.mainImage.url}
                    alt={project.mainImage.title || project.title}
                    className="max-w-full max-h-full object-contain"
                  />
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};