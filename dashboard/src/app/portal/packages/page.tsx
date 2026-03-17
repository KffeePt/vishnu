"use client";

import { useAuth } from "@/components/providers/auth-provider";
import { Check, Package as PackageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { useRouter } from "next/navigation";

const AVAILABLE_PACKAGES = [
  {
    id: "base",
    name: "Base Portal",
    description: "Core project health monitoring, telemetry, and support messaging.",
    price: "$49/mo",
    features: ["Project Health Dashboard", "Direct Support Messaging", "Uptime Monitoring", "Basic Activity Telemetry"],
    isBase: true,
  },
  {
    id: "shop",
    name: "Shop & Inventory",
    description: "Full e-commerce capabilities with inventory and employee management.",
    price: "+$99/mo",
    features: ["Product Catalog", "Inventory Tracking", "Employee Roles", "Order Management"],
    isBase: false,
  },
  {
    id: "community",
    name: "Blog & Social Media",
    description: "Public blog, forums, and secure E2E encrypted private messaging.",
    price: "+$79/mo",
    features: ["WYSIWYG Blog Editor", "Community Forums", "E2E Encrypted Chat", "User Moderation"],
    isBase: false,
  },
  {
    id: "crypto",
    name: "Crypto Panel",
    description: "Accept BTC/ETH payments and manage cryptocurrency wallets.",
    price: "+$149/mo",
    features: ["BTC/ETH Payment Gateway", "Wallet Integration", "Transaction History", "Crypto Subscriptions"],
    isBase: false,
  },
];

export default function PackagesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [selectedPackages, setSelectedPackages] = useState<Set<string>>(new Set(["base"]));

  const togglePackage = (id: string) => {
    if (id === "base") return; // Base is mandatory
    const newSet = new Set(selectedPackages);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedPackages(newSet);
  };

  const handleCheckout = () => {
    // Navigate to checkout with selected packages
    const params = new URLSearchParams();
    selectedPackages.forEach(p => params.append("packages", p));
    router.push(`/checkout?${params.toString()}`);
  };

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Packages & Add-ons</h2>
        <p className="text-zinc-400 mt-2">Customize your Vishnu instance with modular features.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {AVAILABLE_PACKAGES.map((pkg) => {
          const isSelected = selectedPackages.has(pkg.id);
          return (
            <div 
              key={pkg.id}
              className={`relative flex flex-col rounded-xl border p-6 shadow-sm transition-all ${
                isSelected ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/10 bg-zinc-900/50 hover:border-white/20'
              }`}
            >
              <div className="mb-4">
                <PackageIcon className={`h-8 w-8 ${isSelected ? 'text-indigo-400' : 'text-zinc-400'}`} />
                <h3 className="mt-4 text-xl font-bold text-zinc-50">{pkg.name}</h3>
                <p className="mt-2 text-sm text-zinc-400 h-10">{pkg.description}</p>
              </div>
              
              <div className="mb-6 flex items-baseline text-zinc-50">
                <span className="text-3xl font-bold tracking-tight">{pkg.price}</span>
              </div>
              
              <ul className="mb-6 flex-1 space-y-3 text-sm text-zinc-300">
                {pkg.features.map((feature, i) => (
                  <li key={i} className="flex flex-row items-center gap-3">
                    <Check className="h-4 w-4 text-indigo-400 flex-shrink-0" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Button 
                variant={isSelected ? (pkg.isBase ? "secondary" : "default") : "outline"} 
                className="w-full"
                onClick={() => togglePackage(pkg.id)}
                disabled={pkg.isBase}
              >
                {pkg.isBase ? "Included in Plan" : (isSelected ? "Remove Add-on" : "Select Add-on")}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 border-t border-white/10">
        <Button onClick={handleCheckout} size="lg" className="px-8 bg-indigo-600 hover:bg-indigo-700 text-white">
          Proceed to Checkout ({selectedPackages.size} items)
        </Button>
      </div>
    </div>
  );
}
