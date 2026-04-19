import React from 'react';
import { ImageIcon } from 'lucide-react';

export const ImageSkeleton: React.FC = () => {
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
      <ImageIcon className="w-16 h-16 text-gray-700 animate-pulse" />
    </div>
  );
};