"use client"

import React, { useState, useEffect } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ChevronRight, ShoppingCart, Info, Settings } from "lucide-react";
import { motion } from "framer-motion";
import { Carousel, CarouselContent, CarouselItem } from "@/components/ui/carousel";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Candy } from "lucide-react";
import { RiAdminLine } from "react-icons/ri";
import Link from "next/link";
import Autoplay from "embla-carousel-autoplay";
import FeaturedCandies from "@/components/landing-page/featured-candies";
import { useIsMobile } from "@/hooks/use-mobile";
import StarryBackground from "@/components/ui/starry-background/starry-background";
import { cn } from "@/lib/utils";
import { UserAuth } from "@/context/auth-context";
import { useRouter } from "next/navigation";

interface HeroContentItem {
  src: string;
  description: string;
  alt: string;
}

interface LandingPageProps {
  activeSection: string;
  setActiveSection: (section: string) => void;
}

export function LandingPage({ activeSection, setActiveSection }: LandingPageProps) {
  const [hasMounted, setHasMounted] = useState(false);
  const { userClaims } = UserAuth();
  const router = useRouter();
  useEffect(() => {
    setHasMounted(true);
  }, []);

  const isMobileDevice = useIsMobile();

  const dynamicMessages = [
    "Your one-stop shop for the sweetest treats.",
    "From gummy bears to chocolate bars, we have it all.",
    "Life is short, make it sweet.",
    "Discover a world of candy.",
    "Get your sugar rush at Candy Land."
  ];

  const heroContent: HeroContentItem[] = [
    {
      src: "https://images.unsplash.com/photo-1499195333224-3ce974eecb47?auto=format&fit=crop&w=1000&q=80",
      alt: "Multicolored candy worms",
      description: dynamicMessages[0]
    },
    {
      src: "https://images.unsplash.com/photo-1606312619070-d48b4c652a52?auto=format&fit=crop&w=1000&q=80",
      alt: "Delicious chocolate bar pieces",
      description: dynamicMessages[1]
    },
    {
      src: "https://images.unsplash.com/photo-1581798459219-318e76aecc7b?auto=format&fit=crop&w=1000&q=80",
      alt: "Person holding a candy pack on white plastic box",
      description: dynamicMessages[2]
    },
  ];

  const showDesktopView = !hasMounted || (hasMounted && !isMobileDevice);
  const showMobileView = hasMounted && isMobileDevice;

  if (!hasMounted) {
    return null;
  }

  return (
    <div className="relative w-full">
      {userClaims && (userClaims.admin === true || userClaims.owner === true || userClaims.staff === true) && (
        <div className="hidden lg:block absolute top-4 right-4 z-50">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="sm"
                className="bg-yellow-500 hover:bg-yellow-600 text-black shadow-lg"
              >
                <Settings className="w-4 h-4 mr-2" />
                Menu
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              {(userClaims.admin === true || userClaims.owner === true) && (
                <DropdownMenuItem asChild>
                  <Link href="/udhhmbtc" prefetch={false} className="cursor-pointer flex items-center">
                    <RiAdminLine className="mr-2 h-4 w-4 text-orange-600" />
                    <span>Admin Panel</span>
                  </Link>
                </DropdownMenuItem>
              )}
              {(userClaims.staff === true || userClaims.owner === true || userClaims.admin === true) && (
                <DropdownMenuItem asChild>
                  <Link href="/candyman" prefetch={false} className="cursor-pointer flex items-center">
                    <Candy className="mr-2 h-4 w-4 text-pink-600" />
                    <span>Candyman Portal</span>
                  </Link>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
      <StarryBackground className="!absolute" />
      <div className={cn(
        "h-full transition-all duration-300 ease-in-out",
        showDesktopView ? "min-w-[100vdh] w-full items-center" : "w-screen"
      )}>
        <div className={cn( // This div will now be a sibling to the background, inside the relative parent
          "flex items-center flex-col",
          showDesktopView ? "w-full min-w-[100vdh]" : "w-screen overflow-x-hidden"
        )}>
          {/* Hero Section */}
          <section className="flex flex-col w-full py-12 md:py-16 bg-transparent dark:via-primary/10 transition-colors duration-300 ease-in-out items-center">
            <div className={cn(
              "container px-4 md:px-6 transition-all duration-300 ease-in-out",
              showMobileView
                ? "flex flex-col space-y-6 items-center text-center"
                : "grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px] lg:gap-10 xl:grid-cols-[1fr_550px] xl:gap-14 lg:items-stretch"
            )}>
              {/* Text & Desktop Menu Section OR Mobile H1 */}
              <div className={cn(
                showMobileView ? "space-y-3" : "space-y-4 order-1 lg:order-none flex flex-col justify-center"
              )}>
                <h1 className={cn(
                  "font-bold tracking-tighter text-foreground",
                  showMobileView ? "text-3xl sm:text-4xl" : "text-4xl sm:text-5xl md:text-6xl xl:text-7xl/none"
                )}>
                  Welcome to Candy Land
                </h1>
                <p className={cn(
                  "mt-4 text-xl text-muted-foreground",
                  showMobileView ? "text-center" : ""
                )}>
                  Discover our magical world of candy and treats!
                </p>
              </div>

              {/* Image Carousel */}
              <div className={cn(
                showMobileView ? "w-full max-w-md" : "order-2 lg:order-none lg:col-start-2 lg:flex lg:items-center lg:justify-center"
              )}>
                <Carousel
                  plugins={[Autoplay({ delay: 3500, stopOnInteraction: true }) as any]}
                  className={cn(
                    "mx-auto",
                    showMobileView ? "w-full max-w-md" : "w-full max-w-md lg:max-w-none"
                  )}
                  opts={{ loop: true }}
                >
                  <CarouselContent>
                    {heroContent.map((item, index) => (
                      <CarouselItem key={index}>
                        <div className={cn(
                          "relative aspect-square w-full overflow-hidden rounded-lg",
                          !isMobileDevice && "shadow-md dark:shadow-black/20"
                        )}>
                          <Image
                            src={item.src}
                            alt={item.alt}
                            fill
                            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                            style={{ objectFit: 'cover' }}
                            className="rounded-lg"
                            priority={index === 0}
                          />
                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 rounded-b-lg">
                            <p className={cn(
                              "text-white text-sm",
                              showMobileView ? "md:text-base" : "md:text-lg"
                            )}>
                              {item.description}
                            </p>
                          </div>
                        </div>
                      </CarouselItem>
                    ))}
                  </CarouselContent>
                </Carousel>
              </div>
            </div>
          </section>

          {/* Featured Candies Section */}
          <section className="w-full py-12 md:py-16 bg-background/50 backdrop-blur-sm">
            <div className="container px-4 md:px-6">
              <div className="flex flex-col items-center text-center mb-8">
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground mb-4">
                  Featured Candies
                </h2>
                <p className="text-xl text-muted-foreground max-w-2xl">
                  Check out our most popular and delicious treats, loved by kids and adults alike!
                </p>
              </div>
              <FeaturedCandies setActiveSection={setActiveSection} />
            </div>
          </section>

          {/* Call to Action Section */}
          <section className="w-full py-12 md:py-16 bg-gradient-to-r from-purple-400 via-pink-500 to-red-400 dark:from-purple-600 dark:via-pink-600 dark:to-red-600 text-white transition-all duration-300 ease-in-out relative overflow-hidden">
            {/* Floating candy effects */}
            <div className="absolute inset-0 pointer-events-none">
              {[...Array(6)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute text-2xl opacity-20"
                  initial={{
                    x: Math.random() * 100 + '%',
                    y: Math.random() * 100 + '%',
                    rotate: Math.random() * 360
                  }}
                  animate={{
                    y: [null, '-20vh', null],
                    rotate: [null, Math.random() * 360 + 180, null]
                  }}
                  transition={{
                    duration: 8 + Math.random() * 4,
                    repeat: Infinity,
                    ease: "easeInOut"
                  }}
                >
                  {['🍬', '🍭', '🍪'][i % 3]}
                </motion.div>
              ))}
            </div>
            <div className="w-full grid items-center justify-center gap-4 px-4 text-center md:px-6 max-w-full transition-all duration-300 ease-in-out relative z-10">
              <div className="space-y-3 w-full">
                <h2 className={cn(
                  "font-bold tracking-tighter drop-shadow-lg",
                  showMobileView ? "text-xl md:text-2xl" : "text-2xl md:text-3xl/tight"
                )}>
                  🌟 Ready to satisfy your sweet tooth? 🍫
                </h2>
                <p className={cn(
                  "mx-auto max-w-[600px] text-pink-100 drop-shadow-md",
                  showMobileView ? "md:text-lg/relaxed" : "md:text-xl/relaxed"
                )}>
                  Dive into our magical world of handcrafted candies, gourmet chocolates, and sweet surprises that will make your taste buds dance! ✨
                </p>
              </div>
              <div className={cn(
                "flex justify-center mt-6 gap-2",
                showMobileView ? "flex-col items-center gap-3" : "min-[400px]:flex-row"
              )}>
                <Button
                  onClick={() => setActiveSection("shop")}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full border border-white bg-gradient-to-r from-yellow-400 to-orange-500 text-white shadow-lg hover:from-yellow-300 hover:to-orange-400 transform transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 disabled:pointer-events-none disabled:opacity-50 text-sm font-bold px-8 group",
                    showMobileView ? "h-12 w-full max-w-xs" : "h-14"
                  )}
                >
                  <ShoppingCart className="mr-2 h-5 w-5" />
                  🛒 Shop Now
                  <motion.div
                    className="ml-2"
                    initial={{ x: 0 }}
                    transition={{ type: "spring", stiffness: 400, damping: 10 }}
                  >
                    <ChevronRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
                  </motion.div>
                </Button>
                <Button
                  onClick={() => setActiveSection("about")}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full bg-gradient-to-r from-purple-500 to-blue-500 text-white shadow-lg hover:from-purple-400 hover:to-blue-400 transform transition-all hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 disabled:pointer-events-none disabled:opacity-50 text-sm font-bold px-8 group",
                    showMobileView ? "h-12 w-full max-w-xs" : "h-14"
                  )}
                >
                  <Info className="mr-2 h-5 w-5" />
                  ✨ Learn More
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
          </section>
        </div>
      </div>

    </div>
  );
}
