"use client";

import { CreditCard, CheckCircle2 } from "lucide-react";
import { useSearchParams } from "next/navigation";

export default function CheckoutPage() {
  const searchParams = useSearchParams();
  const packages = searchParams.getAll("packages");

  const totalMonthly = 49 + (packages.includes('shop') ? 99 : 0) + (packages.includes('community') ? 79 : 0) + (packages.includes('crypto') ? 149 : 0);

  const handleCheckout = (gateway: string) => {
    // In production, this would call the `createSubscription` Cloud Function mapping the gateway
    alert(`Initiating checkout with ${gateway} for $${totalMonthly}/mo`);
  };

  return (
    <div className="flex-1 space-y-8 p-8 pt-6 max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-3xl font-bold tracking-tight text-zinc-50">Complete Procurement</h2>
        <p className="text-zinc-400 mt-2">Activate your chosen Vishnu modules.</p>
      </div>

      <div className="grid gap-12 md:grid-cols-2">
        {/* Order Summary */}
        <div className="space-y-6">
          <h3 className="text-xl font-medium text-zinc-50 border-b border-white/10 pb-2">Order Summary</h3>
          <ul className="space-y-4">
            <li className="flex justify-between text-zinc-300">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Base Portal
              </div>
              <span>$49/mo</span>
            </li>
            {packages.includes("shop") && (
              <li className="flex justify-between text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                  Shop & Inventory
                </div>
                <span>$99/mo</span>
              </li>
            )}
            {packages.includes("community") && (
              <li className="flex justify-between text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                  Blog & Social
                </div>
                <span>$79/mo</span>
              </li>
            )}
            {packages.includes("crypto") && (
              <li className="flex justify-between text-zinc-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-indigo-400" />
                  Crypto Panel
                </div>
                <span>$149/mo</span>
              </li>
            )}
            <li className="flex justify-between text-lg font-bold text-white border-t border-white/10 pt-4">
              <span>Total due monthly</span>
              <span>${totalMonthly}/mo</span>
            </li>
          </ul>
        </div>

        {/* Payment Methods */}
        <div className="space-y-6">
          <h3 className="text-xl font-medium text-zinc-50 border-b border-white/10 pb-2">Payment Option</h3>
          
          <div className="space-y-4">
            <button 
              onClick={() => handleCheckout("mercadopago")}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-blue-500/10 rounded flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-blue-400" />
                </div>
                <div>
                  <div className="font-medium text-zinc-100">Mercado Pago</div>
                  <div className="text-xs text-zinc-400">Cards, Transfer, OXXO (Mexico)</div>
                </div>
              </div>
            </button>

            <button 
              onClick={() => handleCheckout("openpay")}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-emerald-500/10 rounded flex items-center justify-center">
                  <CreditCard className="h-5 w-5 text-emerald-400" />
                </div>
                <div>
                  <div className="font-medium text-zinc-100">BBVA OpenPay</div>
                  <div className="text-xs text-zinc-400">Direct debit, Cards, Stores (Mexico)</div>
                </div>
              </div>
            </button>

            <button 
              onClick={() => handleCheckout("fiverr")}
              className="w-full flex items-center justify-between p-4 rounded-xl border border-white/10 bg-zinc-900/50 hover:bg-white/5 transition-colors text-left"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 bg-green-500/10 rounded flex items-center justify-center">
                  <span className="font-bold text-green-400">Fi</span>
                </div>
                <div>
                  <div className="font-medium text-zinc-100">Fiverr</div>
                  <div className="text-xs text-zinc-400">Redirect to global payment (USA/Intl)</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
