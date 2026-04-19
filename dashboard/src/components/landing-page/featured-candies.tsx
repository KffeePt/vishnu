"use client"
import { useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button";
import { motion, useInView } from "framer-motion"
import { cn } from "@/lib/utils";
import Image from "next/image";

const featuredCandies = [
  {
    name: "🍬 Gummy Bears",
    price: "$2.99",
    image: "https://images.unsplash.com/photo-1582053433976-25c00369fc93?auto=format&fit=crop&w=800&q=80",
    highlight: "Best Seller"
  },
  {
    name: "🍫 Gourmet Chocolate",
    price: "$3.99",
    image: "https://images.unsplash.com/photo-1511381939415-e44015466834?auto=format&fit=crop&w=800&q=80",
    highlight: "Premium"
  },
  {
    name: "🍭 Rainbow Lollipops",
    price: "$0.99",
    image: "https://images.unsplash.com/photo-1575224300306-1b8da36134ec?auto=format&fit=crop&w=800&q=80",
    highlight: "Kids Favorite"
  },
  {
    name: "🍪 Cookie Bites",
    price: "$4.99",
    image: "https://images.unsplash.com/photo-1499636136210-6f4ee915583e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80",
    highlight: "New"
  },
  {
    name: "🍇 Jelly Beans",
    price: "$1.49",
    image: "https://images.unsplash.com/photo-1511690656952-34342bb7c2f2?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80",
    highlight: "Colorful"
  },
  {
    name: "🥧 Candy Pie",
    price: "$5.99",
    image: "https://images.unsplash.com/photo-1519915028121-7d3463d20b13?ixlib=rb-4.0.3&auto=format&fit=crop&w=1470&q=80",
    highlight: "Decadent"
  }
];

export default function FeaturedCandies({ className, setActiveSection }: { className?: string; setActiveSection: (section: string) => void }) {
  const cardRef = useRef(null)
  const cardInView = useInView(cardRef, { once: true, amount: 0.3 })

  return (
    <motion.div ref={cardRef} initial="hidden" animate={cardInView ? "show" : "hidden"} variants={{ hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }} className={cn("max-w-3xl lg:max-w-none mx-auto pb-2", className)}>
      <Card className="overflow-hidden border-none shadow-lg bg-background/50">
        <CardContent className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {featuredCandies.map((candy, index) => (
              <motion.div
                key={candy.name}
                initial={{ opacity: 0, y: 20 }}
                animate={cardInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="group relative rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden hover:border-primary/30 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5"
              >
                {/* Image Container */}
                <div className="relative h-44 w-full overflow-hidden">
                  <Image
                    src={candy.image}
                    alt={candy.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                  {/* Highlight badge — inside image, z-10 */}
                  <span className="absolute top-3 right-3 z-10 text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 backdrop-blur-md text-white border border-white/20 shadow-sm">
                    {candy.highlight}
                  </span>
                </div>
                {/* Content Container */}
                <div className="p-4 space-y-3">
                  <h4 className="font-semibold text-base text-foreground">{candy.name}</h4>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-primary">{candy.price}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="rounded-full text-xs font-medium border-primary/30 hover:bg-primary/10 hover:text-primary transition-colors"
                      onClick={() => setActiveSection("shop")}
                    >
                      Add to Cart
                    </Button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}
