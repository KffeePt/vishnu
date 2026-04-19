"use client";

import * as React from "react";
import { Paintbrush } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface ColorPickerProps {
  color: string;
  setColor: (color: string) => void;
}

export function ColorPicker({ color, setColor }: ColorPickerProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setColor(e.target.value);
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start text-left font-normal"
        >
          <div className="flex items-center gap-2">
            <div
              className="h-4 w-4 rounded-full border"
              style={{ backgroundColor: color }}
            />
            {color}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-4">
          <div className="flex items-center gap-2">
            <Paintbrush className="h-4 w-4" />
            <Input
              type="color"
              value={color}
              onChange={handleColorChange}
              className="w-auto flex-1"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}