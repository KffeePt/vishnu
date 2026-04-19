"use client";

import { useState, useEffect } from "react";
import { db } from "@/config/firebase";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { uploadFile } from "@/utils/file-upload";
import { useToast } from "@/hooks/use-toast";
import { FileUploader } from "@/components/ui/file-uploader";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Mail, Phone, MapPin, User } from "lucide-react";
import { useImageCropper, ImageCropperProvider } from "@/hooks/use-image-cropper";
import LoadingSpinner from "@/components/loading-spinner";

interface ContactContent {
  displayName: string;
  address: string;
  phone: string;
  email: string;
  photoURL: string;
}

const ContactEditorTabContent: React.FC = () => {
  const { openCropper } = useImageCropper();
  const [content, setContent] = useState<ContactContent>({
    displayName: "",
    address: "",
    phone: "",
    email: "",
    photoURL: "",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchContent = async () => {
      const docRef = doc(db, "contactInfo", "info");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setContent(docSnap.data() as ContactContent);
      }
      setIsLoading(false);
    };
    fetchContent();
  }, []);

  const handleImageChange = async (file: File) => {
    if (file) {
      try {
        const croppedFile = await openCropper(file, {
          aspect: 1,
          circularCrop: true,
        });
        setImageFile(croppedFile);
      } catch (error) {
        console.log("Cropping cancelled or failed:", error);
      }
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      let photoURL = content.photoURL;
      if (imageFile) {
        photoURL = await uploadFile(imageFile, "contact");
      }

      const docRef = doc(db, "contactInfo", "info");
      await setDoc(docRef, { ...content, photoURL });
      toast({
        title: "Content Saved",
        description: "Your contact information has been updated.",
      });
    } catch (error) {
      console.error("Error saving content:", error);
      toast({
        title: "Error",
        description: "Failed to save content. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <Card className="max-w-2xl mx-auto my-8">
      <CardHeader>
        <CardTitle>Contact Information Editor</CardTitle>
        <CardDescription>Update your public contact details and profile picture.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="relative">
            <Avatar className="h-24 w-24">
              <AvatarImage src={imageFile ? URL.createObjectURL(imageFile) : content.photoURL} alt="Contact photo" />
              <AvatarFallback>Contact</AvatarFallback>
            </Avatar>
          </div>
          <div className="grid w-full max-w-sm items-center gap-1.5">
            <Label htmlFor="picture-upload">Profile Picture</Label>
            <FileUploader
              id="picture-upload"
              onFileSelect={handleImageChange}
              accept="image/*"
            >
              <div className="text-sm text-muted-foreground">
                <p>Drag & drop your logo here or</p>
                <p className="text-primary font-semibold">browse to upload</p>
              </div>
            </FileUploader>
            {imageFile && <p className="text-sm text-muted-foreground">{imageFile.name}</p>}
          </div>
        </div>

        <div className="space-y-2">
        <Label htmlFor="displayName">Display Name</Label>
        <div className="relative">
          <User className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="displayName"
            value={content.displayName}
            onChange={(e) => setContent({ ...content, displayName: e.target.value })}
            placeholder="Your name"
            className="pl-10"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Address</Label>
        <div className="relative">
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="address"
            value={content.address}
            onChange={(e) => setContent({ ...content, address: e.target.value })}
            placeholder="Your address"
            className="pl-10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="phone">Phone</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="phone"
            value={content.phone}
            onChange={(e) => setContent({ ...content, phone: e.target.value })}
            placeholder="Your phone number"
            className="pl-10"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <Input
            id="email"
            type="email"
            value={content.email}
            onChange={(e) => setContent({ ...content, email: e.target.value })}
            placeholder="Your email address"
            className="pl-10"
          />
        </div>
      </div>
    </CardContent>
      <CardFooter>
        <Button onClick={handleSave} className="ml-auto" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Content"}
        </Button>
      </CardFooter>
    </Card>
  );
};

const ContactEditorTab: React.FC = () => (
  <ImageCropperProvider>
    <ContactEditorTabContent />
  </ImageCropperProvider>
);

export default ContactEditorTab;