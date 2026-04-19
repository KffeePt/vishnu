"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Autoplay from "embla-carousel-autoplay";
import { Card, CardContent } from "@/components/ui/card";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "@/components/ui/carousel";
import { Button } from "@/components/ui/button";
import {
  Stethoscope,
  Shield,
  Users,
  Calendar,
  Heart,
  Star,
  Clock,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

interface CarouselCardProps {
  className?: string;
}

export function CarouselCard({ className }: CarouselCardProps) {
  const isMobile = useIsMobile();
  const router = useRouter();

  const cardBaseClasses = "bg-background/50 h-full flex items-center flex-col overflow-hidden border-border shadow-lg";
  const desktopCardClasses = "md:backdrop-blur-xs md:hover:shadow-xl md:transition-shadow md:duration-300";

  return (
    <section className={cn("w-full items-center flex flex-col py-16 md:py-24 lg:py-32 transition-colors duration-300 ease-in-out", className)}>
      <Carousel
        plugins={[
          Autoplay({
            delay: 6000, // Slightly longer delay
            stopOnInteraction: true,
          }) as any,
        ]}
        className="md:w-3/4 w-full justify-center mx-4 "
        opts={{
          loop: true,
        }}
      >
        <CarouselContent className="">
          {/* Slide 1: For Patients */}
          <CarouselItem className="pl-4 md:basis-full lg:basis-full will-change-transform">
            <Card className={cn(cardBaseClasses, !isMobile && desktopCardClasses)}>
              <CardContent className=" p-6 md:p-8 flex-grow flex flex-col items-center text-center ">
                <div className="mb-4">
                  <span className="inline-block rounded-full bg-[#03B5AA]/10 px-4 py-1.5 text-sm font-semibold text-[#03B5AA]">FOR PATIENTS</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">Find the Right Doctor, Instantly</h2>
                <p className="max-w-3xl text-muted-foreground mb-6 md:text-lg">
                  Connect with qualified healthcare professionals in your area. Book appointments, check insurance coverage, and get the care you need when you need it.
                </p>
                <div className="w-full max-w-md bg-card/50 dark:bg-card/30 rounded-lg p-6 border border-border/50 mb-6">
                  <h3 className="text-xl font-semibold text-foreground mb-4 text-left">🏥 Patient Benefits:</h3>
                  <ul className="space-y-3 text-left text-muted-foreground">
                    <li className="flex items-start gap-3">
                      <Calendar className="h-6 w-6 text-[#03B5AA] flex-shrink-0 mt-0.5" />
                      <span>Easy appointment scheduling</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <Shield className="h-6 w-6 text-[#03B5AA] flex-shrink-0 mt-0.5" />
                      <span>Insurance verification & coverage</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <MapPin className="h-6 w-6 text-[#03B5AA] flex-shrink-0 mt-0.5" />
                      <span>Find doctors near you</span>
                    </li>
                  </ul>
                </div>
                <p className="text-muted-foreground text-lg mb-6 italic">
                  Your health journey starts here.
                </p>
              </CardContent>
            </Card>
          </CarouselItem>

          {/* Slide 2: For Doctors */}
          <CarouselItem className="pl-4 md:basis-full lg:basis-full will-change-transform">
            <Card className={cn(cardBaseClasses, !isMobile && desktopCardClasses)}>
              <CardContent className="p-6 md:p-8 flex-grow flex flex-col items-center text-center">
                <div className="mb-4">
                  <span className="inline-block rounded-full bg-[#00BFB3]/10 px-4 py-1.5 text-sm font-semibold text-[#00BFB3]">FOR DOCTORS</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">Expand Your Practice, Help More Patients</h2>
                <p className="max-w-3xl text-muted-foreground mb-8 md:text-lg">
                  Join our network of healthcare professionals and connect with patients who need your expertise. Streamline your practice with our integrated tools.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mb-8">
                  <div className="bg-card/50 dark:bg-card/30 rounded-lg p-6 border border-border/50 flex flex-col">
                    <h3 className="text-xl font-semibold text-foreground mb-4">Doctor Benefits</h3>
                    <ul className="space-y-2 text-left text-muted-foreground flex-grow mb-4">
                      <li className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Reach more patients</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Efficient scheduling system</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Star className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Build your online reputation</span>
                      </li>
                       <li className="flex items-center gap-3">
                        <Stethoscope className="h-5 w-5 text-[#00BFB3] flex-shrink-0" />
                        <span>Focus on patient care</span>
                      </li>
                    </ul>
                  </div>
                  <div className="bg-card/50 dark:bg-card/30 rounded-lg p-6 border border-border/50 flex flex-col justify-center items-center">
                      <h3 className="text-xl font-semibold text-foreground mb-4">Join Our Network</h3>
                      <p className="text-muted-foreground mb-4 text-center">
                          Connect with patients and grow your practice with Doc Hut.
                      </p>
                      <Button size="lg" className="mt-4 w-full bg-[#03B5AA] hover:bg-[#00BFB3] text-white" onClick={() => router.push("/doctors")}>
                          Join as Doctor
                      </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>

          {/* Slide 3: For Insurance Companies */}
          <CarouselItem className="pl-4 md:basis-full lg:basis-full will-change-transform">
            <Card className={cn(cardBaseClasses, !isMobile && desktopCardClasses)}>
              <CardContent className="p-6 md:p-8 flex-grow flex flex-col items-center text-center">
                <div className="mb-4">
                  <span className="inline-block rounded-full bg-[#037971]/20 px-4 py-1.5 text-sm font-semibold text-[#037971]">FOR INSURANCE</span>
                </div>
                <h2 className="text-2xl md:text-3xl font-bold tracking-tight text-foreground mb-3">Streamlined Healthcare Networks</h2>
                <p className="max-w-3xl text-muted-foreground mb-8 md:text-lg">
                  Partner with us to provide your members seamless access to quality healthcare providers while optimizing costs and improving patient outcomes.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-4xl mb-8">
                  <div className="bg-card/50 dark:bg-card/30 rounded-lg p-6 border border-border/50 flex flex-col">
                    <h3 className="text-xl font-semibold text-foreground mb-4">Insurance Benefits</h3>
                    <ul className="space-y-2 text-left text-muted-foreground flex-grow mb-4">
                      <li className="flex items-center gap-3">
                        <Shield className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Real-time coverage verification</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Users className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Expanded provider network</span>
                      </li>
                      <li className="flex items-center gap-3">
                        <Clock className="h-5 w-5 text-[#03B5AA] flex-shrink-0" />
                        <span>Reduced administrative costs</span>
                      </li>
                       <li className="flex items-center gap-3">
                        <Heart className="h-5 w-5 text-[#00BFB3] flex-shrink-0" />
                        <span>Improved member satisfaction</span>
                      </li>
                    </ul>
                  </div>
                  <div className="bg-card/50 dark:bg-card/30 rounded-lg p-6 border border-border/50 flex flex-col justify-center items-center">
                      <h3 className="text-xl font-semibold text-foreground mb-4">Partner with Us</h3>
                      <p className="text-muted-foreground mb-4 text-center">
                          Enhance your network and provide better member experiences.
                      </p>
                      <Button size="lg" className="mt-4 w-full bg-[#03B5AA] hover:bg-[#00BFB3] text-white" onClick={() => router.push("?section=contact")}>
                          Partner Inquiry
                      </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </CarouselItem>
        </CarouselContent>
        {/* Optional: Add CarouselPrevious and CarouselNext if desired */}
        {/* <CarouselPrevious /> */}
        {/* <CarouselNext /> */}
      </Carousel>
    </section>
  );
}
