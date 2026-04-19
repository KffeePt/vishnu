"use client";

import { useState, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const aspectRatios = [
  { id: "16/9", label: "16:9" },
  { id: "4/3", label: "4:3" },
  { id: "1/1", label: "1:1 (Square)" },
];

interface AspectRatioSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export default function AspectRatioSelector({ value, onValueChange }: AspectRatioSelectorProps) {

  return (
    <Card>
      <CardHeader>
        <CardTitle>Image Aspect Ratio</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Choose the aspect ratio for images in the roladex carousel.
        </p>
        <RadioGroup value={value} onValueChange={onValueChange}>
          {aspectRatios.map((ratio) => (
            <div key={ratio.id} className="flex items-center space-x-2">
              <RadioGroupItem value={ratio.id} id={ratio.id} />
              <Label htmlFor={ratio.id}>{ratio.label}</Label>
            </div>
          ))}
        </RadioGroup>
      </CardContent>
    </Card>
  );
}