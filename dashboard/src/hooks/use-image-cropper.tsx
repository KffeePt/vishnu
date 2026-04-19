"use client";

import React, { useState, createContext, useContext, useRef } from 'react';
import { ImageCropper } from '@/components/ui/image-cropper';

interface CropOptions {
  aspect?: number;
  circularCrop?: boolean;
  maxSize?: number;
}

interface ImageCropperContextType {
  openCropper: (file: File, options: CropOptions) => Promise<File>;
}

const ImageCropperContext = createContext<ImageCropperContextType | undefined>(undefined);

export const useImageCropper = () => {
  const context = useContext(ImageCropperContext);
  if (!context) {
    throw new Error('useImageCropper must be used within an ImageCropperProvider');
  }
  return context;
};

export const ImageCropperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropOptions, setCropOptions] = useState<CropOptions | null>(null);
  const [originalFileName, setOriginalFileName] = useState<string>('cropped-image.png');
  const cropPromiseRef = useRef<{
    resolve: (file: File) => void;
    reject: (error: Error) => void;
  } | null>(null);

  const openCropper = (file: File, options: CropOptions): Promise<File> => {
    return new Promise((resolve, reject) => {
      cropPromiseRef.current = { resolve, reject };
      setOriginalFileName(file.name);
      const reader = new FileReader();
      reader.onload = () => {
        setImageSrc(reader.result as string);
        setCropOptions(options);
        setIsOpen(true);
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleClose = () => {
    if (cropPromiseRef.current) {
      cropPromiseRef.current.reject(new Error('Cropping cancelled by user.'));
      cropPromiseRef.current = null;
    }
    setIsOpen(false);
    setImageSrc(null);
    setCropOptions(null);
  };

  const handleCropComplete = (file: File) => {
    if (cropPromiseRef.current) {
      cropPromiseRef.current.resolve(file);
      cropPromiseRef.current = null;
    }
    setIsOpen(false);
    setImageSrc(null);
    setCropOptions(null);
  };

  return (
    <ImageCropperContext.Provider value={{ openCropper }}>
      {children}
      <ImageCropper
        isOpen={isOpen}
        onClose={handleClose}
        imageSrc={imageSrc}
        onCropComplete={handleCropComplete}
        aspect={cropOptions?.aspect}
        circularCrop={cropOptions?.circularCrop}
        maxSize={cropOptions?.maxSize}
        originalFileName={originalFileName}
      />
    </ImageCropperContext.Provider>
  );
};