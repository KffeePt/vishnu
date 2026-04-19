"use client";

import React, { useState, useCallback } from 'react';
import { Upload } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileUploaderProps {
  id: string;
  onFileSelect: (file: File) => void;
  accept?: string;
  className?: string;
  children?: React.ReactNode;
}

export function FileUploader({ id, onFileSelect, accept, className, children }: FileUploaderProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onFileSelect(e.target.files[0]);
    }
    // Reset input value to allow re-selecting the same file
    if (e.target) {
        e.target.value = '';
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onFileSelect(e.dataTransfer.files[0]);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) {
        setIsDragging(true);
    }
  }, [isDragging]);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  return (
    <div
      className={cn(
        "mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-dashed rounded-md transition-colors",
        isDragging ? "border-primary bg-accent" : "border-input hover:border-primary/50",
        className
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      <label
        htmlFor={id}
        className="relative cursor-pointer w-full h-full flex flex-col items-center justify-center"
      >
        <div className="space-y-1 text-center">
          {children ? (
            children
          ) : (
            <>
              <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
              <div className="flex text-sm items-center justify-center text-muted-foreground">
                <span className="font-semibold text-primary">Upload a file</span>
                <p className="pl-1">or drag and drop</p>
              </div>
              <p className="text-xs text-muted-foreground">PNG, JPG, GIF up to 10MB</p>
            </>
          )}
        </div>
        <input id={id} name={id} type="file" className="sr-only" onChange={handleFileSelect} accept={accept} />
      </label>
    </div>
  );
}