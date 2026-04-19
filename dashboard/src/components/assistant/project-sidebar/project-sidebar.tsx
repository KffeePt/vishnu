import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import ProjectFilesVisualizer from './sidebar-document-vizualizer/project-files-visualizer';
import { UserSettings } from '@/components/assistant/assistant-types';
import GearIconMenu from './gear-icon-menu/gear-icon-menu';

interface ProjectSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  userSettings: UserSettings | null;
  setUserSettings: React.Dispatch<React.SetStateAction<UserSettings | null>>;
}

const ProjectSidebar = ({
  isOpen,
  onClose,
  userSettings,
  setUserSettings,
}: ProjectSidebarProps) => {
  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="left" className="bg-black bg-opacity-80 text-white p-4 flex flex-col h-full">
        <SheetHeader>
          <SheetTitle className="text-lg font-semibold mb-4">Project Files</SheetTitle>
        </SheetHeader>
        <div className="flex-grow overflow-y-auto">
          <ProjectFilesVisualizer />
        </div>
        <div className="flex justify-end pt-4">
          <GearIconMenu
            userSettings={userSettings}
            setUserSettings={setUserSettings}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default ProjectSidebar;