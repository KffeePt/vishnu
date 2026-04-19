"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Phone, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { db } from "@/config/firebase";
import { collection, getDocs } from "firebase/firestore";
import { RoladexCarousel } from "@/components/ui/roladex-carrousel/roladex-carousel";
import StarryBackground from "@/components/ui/starry-background/starry-background";
import fluidSimulationPlugin from "@/components/ui/starry-background/fluid-simulation-plugin";
import gravityModePlugin from "@/components/ui/starry-background/gravity-mode-plugin";
import LoadingSpinner from "@/components/loading-spinner";
import { CarouselItem } from "@/components/ui/roladex-carrousel/types";
import { ProjectImage } from "@/components/ui/roladex-carrousel/horizontal-roladex-carousel/fullscreen-view";

interface Project {
  id: string;
  name: string;
  description: string;
  subtitle?: string;
  url: string;
  author: string;
  photoURL: string;
  photoTitle?: string;
  photoSubtitle?: string;
  additionalImages?: (ProjectImage & { subtitle?: string })[];
  aspectRatioHorizontal?: string;
  aspectRatioVertical?: string;
}

interface ProjectsSectionProps {
  setActiveSection: (section: string) => void;
}

export default function ProjectsSection({ setActiveSection }: ProjectsSectionProps) {
  const [items, setItems] = useState<CarouselItem[]>([]);
  const [additionalImages, setAdditionalImages] = useState<Record<string, ProjectImage[]>>({});
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      const projectsCollection = collection(db, "projects");
      const projectsSnapshot = await getDocs(projectsCollection);
      const projectsList: CarouselItem[] = [];
      const additionalImagesMap: Record<string, ProjectImage[]> = {};
      
      projectsSnapshot.docs.forEach(doc => {
        const data = doc.data() as Project;
        projectsList.push({
          id: doc.id,
          title: data.name,
          subtitle: data.subtitle,
          description: data.description,
          imageUrl: data.photoURL,
          photoTitle: data.photoTitle,
          photoSubtitle: data.photoSubtitle,
          url: data.url,
          author: data.author,
          aspectRatioHorizontal: data.aspectRatioHorizontal,
          aspectRatioVertical: data.aspectRatioVertical,
        });
        
        // Store additional images if they exist
        if (data.additionalImages && data.additionalImages.length > 0) {
          additionalImagesMap[doc.id] = data.additionalImages;
        }
      });
      
      setItems(projectsList);
      setAdditionalImages(additionalImagesMap);
      setIsLoading(false);
    };
    fetchProjects();
  }, []);

  return (
    <div className="relative w-full">
      <StarryBackground plugins={[fluidSimulationPlugin, gravityModePlugin]} />
      <div className="flex flex-col items-center justify-center w-full min-h-screen pt-10" >
        {isLoading ? (
          <LoadingSpinner />
        ) : items.length > 0 ? (
          <RoladexCarousel items={items} additionalImages={additionalImages} />
        ) : (
          <div className="text-center text-gray-500">
            More projects coming soon! Stay tuned.
          </div>
        )}
        <Button
          onClick={() => setActiveSection("contact")}
          className={cn(
            "inline-flex my-8 mb-12 items-center justify-center rounded-md border border-black dark:border-white bg-transparent text-black dark:text-white shadow-sm transition-colors hover:bg-black/10 dark:hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 text-sm font-medium px-8 group h-12"
          )}
        >
          <Phone className="mr-2 h-4 w-4" />
          Contactar
          <motion.div
            className="ml-2"
            initial={{ x: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <ChevronRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
          </motion.div>
        </Button>
      </div>
    </div>
  );
}
