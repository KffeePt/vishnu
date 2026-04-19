"use client";

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import Image from 'next/image';
import { useImageCropper, ImageCropperProvider } from '@/hooks/use-image-cropper';
import { FileUploader } from '@/components/ui/file-uploader';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { uploadFile } from '@/utils/file-upload';
import { getSiteAppearance, setSiteAppearance } from '@/app/lib/configService';
import { UserAuth } from '@/context/auth-context';

const SiteAppearanceTabContent: React.FC = () => {
  const { forceRefreshUser } = UserAuth();
  const { openCropper } = useImageCropper();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [newLogo, setNewLogo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [newLogoPreview, setNewLogoPreview] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const data = await getSiteAppearance();
        if (data?.logoUrl) {
          setLogoUrl(data.logoUrl);
        }
      } catch (error) {
        console.error('Failed to fetch logo:', error);
      }
    };
    fetchLogo();
  }, []);

  const handleFileChange = async (file: File) => {
    if (file) {
      try {
        const croppedFile = await openCropper(file, {
          aspect: 1,
          circularCrop: true,
        });
        setNewLogo(croppedFile);
        setNewLogoPreview(URL.createObjectURL(croppedFile));
      } catch (error) {
        console.error("Image cropping was cancelled or failed:", error);
      }
    }
  };

  const handleUpload = async () => {
    if (!newLogo) return;
    setUploading(true);

    try {
      if (forceRefreshUser) {
        await forceRefreshUser();
      }
      
      const downloadURL = await uploadFile(newLogo, 'site-assets');
      await setSiteAppearance({ logoUrl: downloadURL });
      
      setLogoUrl(downloadURL);
      setNewLogo(null);
      setNewLogoPreview(null);
      
      toast({
         title: 'Success!',
         description: 'Your new logo has been uploaded and saved.',
      });
    } catch (error) {
      console.error('Error uploading file:', error);
      toast({
        title: 'Upload Failed',
        description: 'An unknown error occurred while uploading the logo.',
        variant: 'destructive',
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Site Appearance</CardTitle>
          <CardDescription>
            Manage the logo to be displayed and appearance settings.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
            <div className="space-y-2">
              <Label className="font-medium">Logo Preview</Label>
              <div className="flex items-center gap-4">
                {logoUrl && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">Current</p>
                    <Image
                      src={logoUrl}
                      alt="Current Logo"
                      width={100}
                      height={100}
                      className="rounded-full border object-cover"
                    />
                  </div>
                )}
                {newLogoPreview && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">New</p>
                    <Image
                      src={newLogoPreview}
                      alt="New Logo Preview"
                      width={100}
                      height={100}
                      className="rounded-full border object-cover"
                    />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-upload">Upload New Logo</Label>
              <FileUploader
                id="logo-upload"
                onFileSelect={handleFileChange}
                accept="image/*"
              >
                <div className="text-sm text-muted-foreground">
                  <p>Drag & drop your logo here or</p>
                  <p className="text-primary font-semibold">browse to upload</p>
                </div>
              </FileUploader>
              <p className="text-xs text-muted-foreground">
                {newLogo ? `Selected: ${newLogo.name}` : 'Select an image to upload and crop.'}
              </p>
            </div>
          </div>
        </CardContent>
        <CardFooter>
          <Button onClick={handleUpload} disabled={!newLogo || uploading}>
            {uploading ? 'Uploading...' : 'Upload and Save'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

const SiteAppearanceTab: React.FC = () => (
  <ImageCropperProvider>
    <SiteAppearanceTabContent />
  </ImageCropperProvider>
);

export default SiteAppearanceTab;