"use client";

import { useState, useEffect } from "react";
import { db } from "@/config/firebase";
import { collection, getDocs } from "firebase/firestore";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";
import LoadingSpinner from "@/components/loading-spinner";

interface Project {
  id: string;
  name: string;
  description: string;
  url: string;
  photoURL: string;
}

export default function ProjectCarousel() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [direction, setDirection] = useState(1);

  interface VisibleProject {
    project: Project;
    displayIndex: number;
  }

  useEffect(() => {
    const fetchProjects = async () => {
      const projectsCollection = collection(db, "projects");
      const projectsSnapshot = await getDocs(projectsCollection);
      const projectsList = projectsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Project));
      setProjects(projectsList);
      setIsLoading(false);
    };
    fetchProjects();
  }, []);

  useEffect(() => {
    if (projects.length > 1) {
      const interval = setInterval(() => {
        setDirection(1);
        setCurrentIndex((prevIndex) => (prevIndex + 1) % projects.length);
      }, 3000);
      return () => clearInterval(interval);
    }
  }, [projects.length]);

  const nextProject = () => {
    setDirection(1);
    setCurrentIndex((prevIndex) => (prevIndex + 1) % projects.length);
  };

  const prevProject = () => {
    setDirection(-1);
    setCurrentIndex((prevIndex) => (prevIndex - 1 + projects.length) % projects.length);
  };

  if (isLoading) {
    return <div className="w-full h-[400px] flex items-center justify-center"><LoadingSpinner /></div>;
  }

  if (projects.length === 0) {
    return <div className="text-center text-gray-500">More projects coming soon! Stay tuned.</div>;
  }

  const getVisibleProjects = (): VisibleProject[] => {
    const visible: VisibleProject[] = [];
    if (projects.length === 0) {
      return visible;
    }
    for (let i = -2; i <= 2; i++) {
      const index = (currentIndex + i + projects.length) % projects.length;
      visible.push({ project: projects[index], displayIndex: i });
    }
    return visible;
  };

  return (
    <div className="relative w-full h-[400px] flex items-center justify-center">
      <button onClick={prevProject} className="absolute left-0 z-10 p-2 bg-gray-800/50 rounded-full">
        <ChevronLeft className="w-6 h-6 text-white" />
      </button>
      <AnimatePresence initial={false} custom={{ currentIndex, direction }}>
        <div className="relative w-[80%] h-full flex items-center justify-center" style={{ perspective: "1000px" }}>
          {getVisibleProjects().map(({ project, displayIndex }) => (
            <motion.div
              key={`${project.id}-${displayIndex}`}
              className="absolute"
              custom={{ currentIndex, direction }}
              initial="initial"
              animate="animate"
              exit="exit"
              variants={{
                initial: (custom) => ({
                  x: `${(displayIndex - custom.direction) * 40}%`,
                  scale: displayIndex === 0 ? 1 : 0.8,
                  rotateY: displayIndex !== 0 ? (displayIndex > 0 ? -60 : 60) : 0,
                  zIndex: 5 - Math.abs(displayIndex),
                  opacity: 0
                }),
                animate: {
                  x: `${displayIndex * 40}%`,
                  scale: displayIndex === 0 ? 1 : 0.8,
                  rotateY: displayIndex !== 0 ? (displayIndex > 0 ? -60 : 60) : 0,
                  zIndex: 5 - Math.abs(displayIndex),
                  opacity: Math.max(0, 1 - Math.abs(displayIndex) * 0.3)
                },
                exit: (custom) => ({
                  x: `${(displayIndex + custom.direction) * 40}%`,
                  scale: 0.8,
                  rotateY: displayIndex !== 0 ? (displayIndex > 0 ? -60 : 60) : 0,
                  zIndex: 0,
                  opacity: 0
                })
              }}
              transition={{ type: "spring", stiffness: 200, damping: 25 }}
              style={{ transformStyle: "preserve-3d" }}
            >
              <Card className="w-[250px] h-[350px] bg-gray-900 text-white border-gray-700">
                <CardContent className="p-4">
                  {project.photoURL && (
                    <div className="relative w-full h-32 mb-4">
                      <Image
                        src={project.photoURL}
                        alt={project.name}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        style={{ objectFit: 'cover' }}
                        className="rounded-md"
                      />
                    </div>
                  )}
                  <h3 className="text-lg font-bold">{project.name}</h3>
                  <p className="text-sm text-gray-400 truncate">{project.description}</p>
                  {project.url && <a href={project.url} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline mt-2 inline-block">View Project</a>}
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      </AnimatePresence>
      <button onClick={nextProject} className="absolute right-0 z-10 p-2 bg-gray-800/50 rounded-full">
        <ChevronRight className="w-6 h-6 text-white" />
      </button>
    </div>
  );
}
