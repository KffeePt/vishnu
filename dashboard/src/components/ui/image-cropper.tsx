"use client";

import 'react-image-crop/dist/ReactCrop.css';
import React, { useState, useRef } from 'react';
import Image from 'next/image';
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  Crop,
  PixelCrop,
} from 'react-image-crop';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// --- Helper Functions ---

function centerAspectCrop(
  mediaWidth: number,
  mediaHeight: number,
  aspect: number
): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: 'px',
        width: mediaWidth,
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

async function getCroppedImg(
  image: HTMLImageElement,
  crop: PixelCrop,
  fileName: string,
  maxSize?: number
): Promise<{ file: File; url: string } | null> {
  const canvas = document.createElement('canvas');
  let width = crop.width;
  let height = crop.height;

  if (maxSize) {
    if (width > maxSize) {
      height = (height * maxSize) / width;
      width = maxSize;
    }
    if (height > maxSize) {
      width = (width * maxSize) / height;
      height = maxSize;
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    console.error('Failed to get canvas context');
    return null;
  }

  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    width,
    height
  );

  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          console.error('Canvas toBlob failed to produce a blob.');
          resolve(null);
          return;
        }
        const file = new File([blob], fileName, { type: blob.type || 'image/png' });
        const url = URL.createObjectURL(blob);
        resolve({ file, url });
      },
      'image/png',
      0.92
    );
  });
}

// --- Component ---

interface ImageCropperProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  onCropComplete: (croppedFile: File) => void;
  aspect?: number;
  circularCrop?: boolean;
  maxSize?: number;
  originalFileName: string;
}

export const ImageCropper: React.FC<ImageCropperProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
  aspect = 1,
  circularCrop = false,
  maxSize,
  originalFileName,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    if (aspect) {
      const { width, height } = e.currentTarget;
      setCrop(centerAspectCrop(width, height, aspect));
    }
  }

  React.useEffect(() => {
    if (isOpen && imageSrc) {
      setImageDimensions(null);
      const img = new window.Image();
      img.src = imageSrc;
      img.onload = () => {
        setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        console.error("Failed to load image for cropping");
        onClose();
      };
    }
  }, [isOpen, imageSrc, onClose]);
 
  const handleSaveCroppedImage = async () => {
    if (completedCrop && completedCrop.width && completedCrop.height && imgRef.current) {
      try {
        const croppedImageData = await getCroppedImg(
          imgRef.current,
          completedCrop,
          originalFileName,
          maxSize
        );
        if (croppedImageData) {
          onCropComplete(croppedImageData.file);
        }
      } catch (e) {
        console.error('Error cropping image:', e);
      }
    }
    onClose();
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="w-[95vw] rounded-lg sm:max-w-[600px] bg-card dark:bg-gray-900">
        <DialogHeader>
          <DialogTitle>Crop Image</DialogTitle>
        </DialogHeader>
        <div className="py-4 flex justify-center items-center min-h-[300px]">
          {!imageSrc ? (
            <p>No image selected.</p>
          ) : !imageDimensions ? (
            <p>Loading image...</p>
          ) : (
            <ReactCrop
              crop={crop}
              onChange={(c) => setCrop(c)}
              onComplete={(c) => setCompletedCrop(c)}
              aspect={aspect}
              circularCrop={circularCrop}
              keepSelection={true}
            >
              <Image
                ref={imgRef}
                alt="Crop preview"
                src={imageSrc}
                width={imageDimensions.width}
                height={imageDimensions.height}
                onLoad={onImageLoad}
                style={{ maxHeight: '70vh', width: 'auto', height: 'auto' }}
              />
            </ReactCrop>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSaveCroppedImage} disabled={!completedCrop?.width || !completedCrop?.height}>
            Save Crop
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};