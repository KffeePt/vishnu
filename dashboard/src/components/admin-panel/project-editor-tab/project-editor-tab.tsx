"use client";

import { useState, useEffect } from "react";
import { db, storage } from "@/config/firebase";
import { doc, getDoc, setDoc, collection, getDocs, deleteDoc } from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useImageCropper, ImageCropperProvider } from "@/hooks/use-image-cropper";
import { FileUploader } from "@/components/ui/file-uploader";
import { Label } from "@/components/ui/label";
import { Plus, X, Eye } from "lucide-react";
import { FullscreenView } from "@/components/ui/roladex-carrousel/horizontal-roladex-carousel/fullscreen-view";
import AspectRatioSelector from "./aspect-ratio-selector/aspect-ratio-selector";

interface Project {
  id: string;
  name: string;
}

interface ProjectContent {
  name: string;
  description: string;
  url: string;
  photoURL: string;
  photoTitle?: string;
  photoSubtitle?: string;
  author: string;
  aspectRatio?: string;
  additionalImages?: {
    id: string;
    url: string;
    title?: string;
    subtitle?: string;
    type?: 'image' | 'video';
  }[];
}

const ProjectEditorTabContent: React.FC = () => {
  const { openCropper } = useImageCropper();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>("");
  const [content, setContent] = useState<ProjectContent>({
    name: "",
    description: "",
    url: "",
    photoURL: "",
    photoTitle: "",
    photoSubtitle: "",
    author: "",
    aspectRatio: "16/9",
  });
  const [isLoading, setIsLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [newImagePreview, setNewImagePreview] = useState<string | null>(null);
  const [additionalImages, setAdditionalImages] = useState<ProjectContent['additionalImages']>([]);
  const [uploadingAdditional, setUploadingAdditional] = useState(false);
  const [showFullscreenPreview, setShowFullscreenPreview] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchProjects = async () => {
      const projectsCollection = collection(db, "projects");
      const projectsSnapshot = await getDocs(projectsCollection);
      const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name }));
      setProjects(projectsList);
      if (projectsList.length > 0) {
        setSelectedProject(projectsList[0].id);
      }
      setIsLoading(false);
    };

    fetchProjects();
  }, []);

  useEffect(() => {
    const fetchContent = async () => {
      if (!selectedProject) return;
      const docRef = doc(db, "projects", selectedProject);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as ProjectContent;
        setContent(data);
        setAdditionalImages(data.additionalImages || []);
        if (data.aspectRatio) {
          const [w, h] = data.aspectRatio.split("/").map(Number);
          setAspectRatio(w / h);
        } else {
          setAspectRatio(16/9);
        }
      } else {
        setContent({ name: "", description: "", url: "", photoURL: "", photoTitle: "", photoSubtitle: "", author: "", aspectRatio: "16/9", additionalImages: [] });
        setAdditionalImages([]);
        setAspectRatio(16/9);
      }
    };
    fetchContent();
  }, [selectedProject]);

  const handleFileChange = async (file: File) => {
    if (file) {
      if (file.type.startsWith('video')) {
        setSelectedFile(file);
        setNewImagePreview(URL.createObjectURL(file));
      } else {
        try {
          const croppedFile = await openCropper(file, { aspect: aspectRatio, maxSize: 2048 });
          setSelectedFile(croppedFile);
          setNewImagePreview(URL.createObjectURL(croppedFile));
        } catch (error) {
          console.log("Cropping cancelled or failed:", error);
        }
      }
    }
  };

  const handleSave = async () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project to save.",
        variant: "destructive",
      });
      return;
    }

    let updatedContent = { ...content };

    if (selectedFile) {
      setUploading(true);
      const storageRef = ref(storage, `projects/${selectedProject}/${selectedFile.name}`);
      try {
        await uploadBytes(storageRef, selectedFile);
        const downloadURL = await getDownloadURL(storageRef);
        updatedContent.photoURL = downloadURL;
        toast({
          title: "Upload Successful",
          description: "The project photo has been uploaded.",
        });
      } catch (error) {
        console.error("Upload Failed:", error);
        toast({
          title: "Upload Failed",
          description: "An error occurred while uploading the photo.",
          variant: "destructive",
        });
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }

    // Include additional images in the save
    updatedContent.additionalImages = additionalImages;

    try {
      const docRef = doc(db, "projects", selectedProject);
      await setDoc(docRef, updatedContent);
      setContent(updatedContent);
      toast({
        title: "Project Saved",
        description: "Your project has been updated.",
      });
    } catch (error) {
      console.error("Save Failed:", error);
      toast({
        title: "Save Failed",
        description: "An error occurred while saving the project.",
        variant: "destructive",
      });
    }
  };

  const handleCreateNew = () => {
    const newProjectId = `project-${Date.now()}`;
    setSelectedProject(newProjectId);
    setContent({ name: "New Project", description: "", url: "", photoURL: "", photoTitle: "", photoSubtitle: "", author: "", aspectRatio: "16/9", additionalImages: [] });
    setAdditionalImages([]);
  };

  const handleDelete = async () => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project to delete.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (content.photoURL) {
        const photoRef = ref(storage, content.photoURL);
        await deleteObject(photoRef);
      }

      const docRef = doc(db, "projects", selectedProject);
      await deleteDoc(docRef);

      toast({
        title: "Project Deleted",
        description: "The project has been successfully deleted.",
      });

      const newProjects = projects.filter(p => p.id !== selectedProject);
      setProjects(newProjects);
      setSelectedProject(newProjects.length > 0 ? newProjects[0].id : "");

    } catch (error) {
      toast({
        title: "Deletion Failed",
        description: "An error occurred while deleting the project.",
        variant: "destructive",
      });
    }
  };

  const handleAdditionalImageUpload = async (file: File) => {
    if (!selectedProject) {
      toast({
        title: "Error",
        description: "Please select a project first.",
        variant: "destructive",
      });
      return;
    }

    setUploadingAdditional(true);
    const imageId = `additional-${Date.now()}`;
    const storageRef = ref(storage, `projects/${selectedProject}/additional/${imageId}-${file.name}`);
    
    try {
      await uploadBytes(storageRef, file);
      const downloadURL = await getDownloadURL(storageRef);
      
      const newImage = {
        id: imageId,
        url: downloadURL,
        title: file.name.split('.').slice(0, -1).join('.'),
        type: file.type.startsWith('video') ? 'video' : 'image' as 'video' | 'image'
      };
      
      setAdditionalImages(prev => [...(prev || []), newImage]);
      
      toast({
        title: "Image Added",
        description: "Additional image has been uploaded successfully.",
      });
    } catch (error) {
      console.error("Upload Failed:", error);
      toast({
        title: "Upload Failed",
        description: "Failed to upload additional image.",
        variant: "destructive",
      });
    } finally {
      setUploadingAdditional(false);
    }
  };


  const handleRemoveAdditionalImage = async (imageId: string) => {
    const imageToRemove = additionalImages?.find(img => img.id === imageId);
    if (!imageToRemove) return;

    try {
      // Delete from storage
      const imageRef = ref(storage, imageToRemove.url);
      await deleteObject(imageRef);
      
      // Remove from state
      setAdditionalImages(prev => prev?.filter(img => img.id !== imageId) || []);
      
      toast({
        title: "Image Removed",
        description: "Additional image has been removed.",
      });
    } catch (error) {
      console.error("Failed to remove image:", error);
      toast({
        title: "Error",
        description: "Failed to remove image.",
        variant: "destructive",
      });
    }
  };

  const handleUpdateAdditionalImageData = (imageId: string, field: 'title' | 'subtitle', value: string) => {
    setAdditionalImages(prev =>
      prev?.map(img => img.id === imageId ? { ...img, [field]: value } : img) || []
    );
  };

  const handleAspectRatioChange = (newRatio: string) => {
    setContent(prev => ({ ...prev, aspectRatio: newRatio }));
    const [w, h] = newRatio.split("/").map(Number);
    setAspectRatio(w / h);
  };
 
  const handleAdditionalImageSelect = async (file: File) => {
    if (file) {
      if (file.type.startsWith('video')) {
        await handleAdditionalImageUpload(file);
      } else {
        try {
          const croppedFile = await openCropper(file, { aspect: aspectRatio, maxSize: 2048 });
          await handleAdditionalImageUpload(croppedFile);
        } catch (error) {
          console.log('Cropping cancelled or failed:', error);
          toast({
            title: "Cropping cancelled",
            description: "You cancelled the image cropping operation.",
          });
        }
      }
    }
  };
 
  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Project Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        
        <div className="flex flex-col sm:flex-row items-center space-y-2 sm:space-y-0 sm:space-x-4">
          <Select onValueChange={setSelectedProject} value={selectedProject}>
            <SelectTrigger className="w-full sm:w-[280px]">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex w-full sm:w-auto space-x-2">
            <Button onClick={handleCreateNew} className="flex-1 sm:flex-initial">Create New</Button>
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" disabled={!selectedProject} className="flex-1 sm:flex-initial">Delete Project</Button>
              </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the project
                  and all of its associated data from our servers.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Project Name</Label>
              <Input
                id="name"
                value={content.name}
                onChange={(e) => setContent({ ...content, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="author">Author</Label>
              <Input
                id="author"
                value={content.author || ""}
                onChange={(e) => setContent({ ...content, author: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={content.description}
                onChange={(e) =>
                  setContent({ ...content, description: e.target.value })
                }
                rows={5}
              />
            </div>
            <div>
              <Label htmlFor="url">Project URL</Label>
              <Input
                id="url"
                value={content.url}
                onChange={(e) => setContent({ ...content, url: e.target.value })}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="photo-title">Project Photo Title</Label>
              <Input
                id="photo-title"
                value={content.photoTitle || ""}
                onChange={(e) => setContent({ ...content, photoTitle: e.target.value })}
                placeholder="Enter a title for the main photo"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="photo-subtitle">Project Photo Subtitle</Label>
              <Input
                id="photo-subtitle"
                value={content.photoSubtitle || ""}
                onChange={(e) => setContent({ ...content, photoSubtitle: e.target.value })}
                placeholder="Enter a subtitle for the main photo"
              />
            </div>
            <div>
              <Label htmlFor="photo-upload">Project Photo</Label>
              <FileUploader
                id="main-photo-uploader"
                key="main-photo-uploader"
                onFileSelect={handleFileChange}
                accept="image/*,video/*"
              >
                <div className="text-sm text-muted-foreground">
                  <p>Drag & drop your image here or</p>
                  <p className="text-primary font-semibold">browse to upload</p>
                </div>
              </FileUploader>
              <p className="text-xs text-muted-foreground">
                {selectedFile ? `Selected: ${selectedFile.name}` : 'Select an image to upload and crop.'}
              </p>
            </div>
            
            <div className="space-y-2">
              <Label className="font-medium">Image Preview</Label>
              <div className="flex items-center gap-4">
                {content.photoURL && !newImagePreview && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">Current</p>
                    <Image
                      src={content.photoURL}
                      alt="Current Project Image"
                      width={100}
                      height={100}
                      className="rounded-md border object-cover"
                      style={{ aspectRatio: aspectRatio }}
                    />
                  </div>
                )}
                {newImagePreview && (
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-2">New</p>
                    {selectedFile?.type.startsWith('video') ? (
                      <video
                        src={newImagePreview}
                        width={100}
                        height={100}
                        className="rounded-md border object-cover"
                        style={{ aspectRatio: aspectRatio }}
                        autoPlay
                        muted
                        loop
                      />
                    ) : (
                      <Image
                        src={newImagePreview}
                        alt="New Image Preview"
                        width={100}
                        height={100}
                        className="rounded-md border object-cover"
                        style={{ aspectRatio: aspectRatio }}
                      />
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        {/* Aspect Ratio Section */}

        <div>
          <Label>Image Aspect Ratio</Label>
          <AspectRatioSelector
            value={content.aspectRatio || "16/9"}
            onValueChange={handleAspectRatioChange}
          />
        </div>
        {/* Additional Images Section */}
        <div className="space-y-4">
          <div>
            <Label className="text-lg font-semibold">Additional Images for Fullscreen Gallery</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Add more images that will appear in the horizontal carousel when viewing the project in fullscreen mode.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {additionalImages?.map((image) => (
              <div key={image.id} className="relative group">
                <div className="aspect-video relative rounded-lg overflow-hidden border">
                  {image.type === 'video' ? (
                    <video src={image.url} className="object-cover w-full h-full" autoPlay muted loop />
                  ) : (
                    <Image
                      src={image.url}
                      alt={image.title || "Additional image"}
                      fill
                      className="object-cover"
                    />
                  )}
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => handleRemoveAdditionalImage(image.id)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <Input
                  value={image.title || ""}
                  onChange={(e) => handleUpdateAdditionalImageData(image.id, 'title', e.target.value)}
                  placeholder="Image title"
                  className="mt-2"
                />
                <Input
                  value={image.subtitle || ""}
                  onChange={(e) => handleUpdateAdditionalImageData(image.id, 'subtitle', e.target.value)}
                  placeholder="Image subtitle"
                  className="mt-2"
                />
              </div>
            ))}
            
            {/* Add new image card */}
            <div className="aspect-video relative rounded-lg border-2 border-dashed border-muted-foreground/25 hover:border-muted-foreground/50 transition-colors">
              <FileUploader
                id="additional-photo-uploader"
                key="additional-photo-uploader"
                onFileSelect={handleAdditionalImageSelect}
                accept="image/*,video/*"
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center text-muted-foreground">
                  <Plus className="h-8 w-8 mb-2" />
                  <p className="text-sm">Add Image</p>
                </div>
              </FileUploader>
            </div>
          </div>
        </div>

        {/* Fullscreen Preview Button */}
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={() => setShowFullscreenPreview(true)}
            disabled={!content.photoURL}
          >
            <Eye className="h-4 w-4 mr-2" />
            Preview Fullscreen Mode
          </Button>
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={uploading}>
            {uploading ? "Saving..." : "Save Project"}
          </Button>
        </div>

        {/* Fullscreen Preview Modal */}
        {showFullscreenPreview && (
          <FullscreenView
            isOpen={showFullscreenPreview}
            onClose={() => setShowFullscreenPreview(false)}
            project={{
              id: selectedProject,
              title: content.name,
              description: content.description,
              mainImage: { url: content.photoURL, title: content.photoTitle || '', subtitle: content.photoSubtitle || '' },
              additionalImages: additionalImages,
              url: content.url,
              author: content.author || "",
              aspectRatio: content.aspectRatio,
            }}
          />
        )}
      </CardContent>
    </Card>
  );
};

const ProjectEditorTab: React.FC = () => (
  <ImageCropperProvider>
    <ProjectEditorTabContent />
  </ImageCropperProvider>
);

export default ProjectEditorTab;