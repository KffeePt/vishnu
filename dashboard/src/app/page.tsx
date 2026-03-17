import Link from "next/link";
import { LandingNavbar } from "@/components/layout/landing-navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Check, Code2, Database, Shield, Zap, Rocket, ShoppingCart, MessageSquare, Bitcoin, Truck, Palette, Gamepad2, Quote } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#0B132B] text-zinc-50 font-inter selection:bg-graviton-cyan/30">
      <LandingNavbar />

      <main className="pt-16">
        {/* --- HERO SECTION --- */}
        <section className="relative overflow-hidden pt-24 pb-32 md:pt-40 md:pb-48">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--color-graviton-purple)_0%,_transparent_50%)] opacity-20 blur-3xl" />
          <div className="container relative mx-auto px-4 text-center z-10">
            <h1 className="text-5xl md:text-7xl font-bold font-orbitron mb-6 text-transparent bg-clip-text bg-gradient-to-r from-white via-zinc-200 to-zinc-400 tracking-tight leading-tight">
              Build Your <br className="md:hidden" />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-graviton-cyan to-blue-400">Digital Gravity.</span>
            </h1>
            <p className="max-w-2xl mx-auto text-lg md:text-xl text-zinc-300 mb-10 leading-relaxed">
              Web platforms, automation systems, and scalable infrastructure designed to pull your business into orbit. We design and deploy full-stack platforms end-to-end.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button size="lg" className="w-full sm:w-auto h-14 px-8 bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] text-lg font-bold shadow-[0_0_20px_rgba(46,196,182,0.4)] transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(46,196,182,0.6)]">
                Start Your Project
              </Button>
              <Button size="lg" variant="outline" className="w-full sm:w-auto h-14 px-8 border-white/20 hover:bg-white/5 text-white text-lg font-medium transition-colors">
                View Packages
              </Button>
            </div>
            
            <div className="mt-20 pt-10 border-t border-white/10 md:max-w-4xl mx-auto">
              <p className="text-sm text-zinc-500 mb-6 font-orbitron uppercase tracking-widest">Trusted Infrastructure</p>
              <div className="flex flex-wrap justify-center items-center gap-8 md:gap-16 opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
                {/* Simulated trust badges */}
                <div className="flex items-center gap-2"><Zap className="h-6 w-6"/> Vercel Engine</div>
                <div className="flex items-center gap-2"><Database className="h-6 w-6"/> Firebase Auth</div>
                <div className="flex items-center gap-2"><Shield className="h-6 w-6"/> Mercado Pago</div>
                <div className="flex items-center gap-2"><Code2 className="h-6 w-6"/> OpenPay Integration</div>
              </div>
            </div>
          </div>
        </section>

        {/* --- FEATURES SECTION --- */}
        <section id="features" className="py-24 bg-zinc-950/50 relative">
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-5xl font-bold font-orbitron mb-4 text-white">Infrastructure That <span className="text-graviton-purple">Scales.</span></h2>
              <p className="text-zinc-400 text-lg">Every Graviton platform is built with enterprise-grade architecture, ensuring your application remains lightning-fast and universally accessible.</p>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                { icon: Code2, title: "End-to-End Development", desc: "From UI/UX design to backend databases, we handle the entire stack.", color: "text-blue-400" },
                { icon: Zap, title: "Real-Time Infrastructure", desc: "Instant data synchronization across all clients using WebSockets.", color: "text-amber-400" },
                { icon: Check, title: "Integrated Payments", desc: "Seamless checkout flows with Mercado Pago & Stripe integration.", color: "text-emerald-400" },
                { icon: Shield, title: "Secure Communications", desc: "Role-based access control and encrypted data transmission.", color: "text-red-400" },
                { icon: Database, title: "Client Admin Panel", desc: "Take control of your data with a dedicated management dashboard.", color: "text-graviton-purple" },
                { icon: Rocket, title: "Automated Monitoring", desc: "24/7 uptime tracking and automated error reporting systems.", color: "text-graviton-cyan" },
              ].map((feature, i) => (
                <Card key={i} className="bg-[#0B132B]/50 border-white/5 hover:border-white/20 transition-all group overflow-hidden relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                  <CardContent className="p-8 relative z-10">
                    <feature.icon className={`h-10 w-10 mb-6 ${feature.color} group-hover:scale-110 transition-transform`} />
                    <h3 className="text-xl font-bold font-orbitron mb-3 text-white">{feature.title}</h3>
                    <p className="text-zinc-400 leading-relaxed">{feature.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* --- PRICING SECTION --- */}
        <section id="pricing" className="py-24 relative overflow-hidden">
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center max-w-3xl mx-auto mb-20">
              <h2 className="text-3xl md:text-5xl font-bold font-orbitron mb-4 text-white">Launch Packages</h2>
              <p className="text-zinc-400 text-lg">Predictable pricing for platforms of any scale. No hidden fees.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {/* Particle Tier */}
              <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 flex flex-col hover:border-graviton-purple/50 transition-colors">
                <h3 className="text-2xl font-orbitron font-bold text-white mb-2">Particle</h3>
                <p className="text-zinc-400 text-sm mb-6">Perfect for landing pages and simple portfolios.</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">$400</span>
                  <span className="text-zinc-500 font-medium"> – $800</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {["Custom UI Design", "Responsive Layout", "Contact Forms", "Basic SEO", "Fast Load Times"].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-zinc-300">
                      <Check className="h-4 w-4 text-graviton-purple" /> {item}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 pt-6 mb-6 text-sm text-zinc-400">
                  <strong className="text-white">$25/mo</strong> maintenance & hosting
                </div>
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white">Select Particle</Button>
              </div>

              {/* Atom Tier */}
              <div className="rounded-2xl border-2 border-graviton-cyan bg-[#0B132B] p-8 flex flex-col relative transform md:-translate-y-4 shadow-2xl shadow-graviton-cyan/20">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-graviton-cyan text-[#0B132B] px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
                  Most Popular
                </div>
                <h3 className="text-2xl font-orbitron font-bold text-white mb-2">Atom</h3>
                <p className="text-graviton-cyan/80 text-sm mb-6">For businesses replacing legacy web systems.</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">$1,200</span>
                  <span className="text-zinc-400 font-medium"> – $2,500</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {["Everything in Particle", "Client Dashboard", "Content Management", "User Authentication", "Database Integration", "API Connections"].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-zinc-200">
                      <Check className="h-4 w-4 text-graviton-cyan" /> {item}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 pt-6 mb-6 text-sm text-zinc-400">
                  <strong className="text-white">$50/mo</strong> maintenance & hosting
                </div>
                <Button className="w-full bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] font-bold">Select Atom</Button>
              </div>

              {/* Stellar Tier */}
              <div className="rounded-2xl border border-white/10 bg-zinc-900/40 p-8 flex flex-col hover:border-blue-500/50 transition-colors">
                <h3 className="text-2xl font-orbitron font-bold text-white mb-2">Stellar</h3>
                <p className="text-zinc-400 text-sm mb-6">Advanced SaaS and custom web applications.</p>
                <div className="mb-6">
                  <span className="text-4xl font-bold text-white">$4,000+</span>
                </div>
                <ul className="space-y-4 mb-8 flex-1">
                  {["Everything in Atom", "Payment Gateways", "Complex Logic & AI", "Real-time Sockets", "Admin Control Panel", "High Availability Infrastructure"].map((item, i) => (
                    <li key={i} className="flex items-center gap-3 text-zinc-300">
                      <Check className="h-4 w-4 text-blue-400" /> {item}
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 pt-6 mb-6 text-sm text-zinc-400">
                  <strong className="text-white">$100 – $250/mo</strong> maintenance & dedicated support
                </div>
                <Button className="w-full bg-white/10 hover:bg-white/20 text-white">Contact Sales</Button>
              </div>
            </div>
          </div>
        </section>

        {/* --- MODULES SECTION --- */}
        <section id="modules" className="py-24 bg-zinc-950/80 border-y border-white/5">
          <div className="container mx-auto px-4">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-3xl md:text-4xl font-bold font-orbitron mb-4 text-white">Expansion Modules</h2>
              <p className="text-zinc-400">Plug-and-play features that can be added to any Atom or Stellar platform.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
              {[
                { name: "Shop & Inventory", icon: ShoppingCart },
                { name: "Blog & Social", icon: MessageSquare },
                { name: "Trading Engine", icon: Gamepad2 },
                { name: "Crypto / Web3", icon: Bitcoin },
                { name: "Logistics", icon: Truck },
                { name: "Artist Profiles", icon: Palette },
              ].map((module, i) => (
                <div key={i} className="p-6 rounded-xl bg-[#0B132B]/60 border border-white/5 flex flex-col items-center justify-center text-center gap-4 hover:bg-white/5 hover:border-white/10 transition-all cursor-default">
                  <module.icon className="h-8 w-8 text-zinc-400" />
                  <span className="font-medium text-zinc-200">{module.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* --- TESTIMONIALS SECTION --- */}
        <section id="testimonials" className="py-24 relative">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom,_var(--color-graviton-purple)_0%,_transparent_40%)] opacity-10" />
          <div className="container mx-auto px-4 relative z-10">
            <h2 className="text-3xl md:text-4xl font-bold font-orbitron text-center mb-16 text-white">Trusted by Forward-Thinking Businesses</h2>
            
            <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
              {[
                { quote: "Graviton Systems overhauled our legacy database into a lightning-fast modern dashboard. The administrative controls they built saved us hours every week.", author: "Operations Director", company: "Logistics Firm" },
                { quote: "The Mercado Pago integration was flawless. We were able to start accepting payments on our new platform within days of the initial launch.", author: "Founder", company: "E-commerce Startup" },
                { quote: "Their technical expertise is unmatched. When we needed a real-time web socket implementation for our trading tool, Graviton delivered exactly what was promised.", author: "Lead Architect", company: "FinTech Agency" },
              ].map((t, i) => (
                <Card key={i} className="bg-zinc-900/50 border-white/5 relative">
                  <CardContent className="p-8 pt-10">
                    <Quote className="absolute top-6 left-6 h-8 w-8 text-white/5" />
                    <p className="text-zinc-300 italic mb-6 relative z-10">"{t.quote}"</p>
                    <div>
                      <div className="font-bold text-white">{t.author}</div>
                      <div className="text-sm text-graviton-cyan">{t.company}</div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* --- CTA SECTION --- */}
        <section className="py-24 border-t border-white/10 bg-gradient-to-b from-transparent to-[#0B132B]">
          <div className="container mx-auto px-4 text-center max-w-3xl">
            <h2 className="text-4xl md:text-5xl font-bold font-orbitron mb-6 text-white">Ready To Launch Your Platform?</h2>
            <p className="text-xl text-zinc-400 mb-10">Contact us today to discuss your architecture and get a precise technical proposal.</p>
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <Button size="lg" className="h-14 px-10 bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] text-lg font-bold shadow-[0_0_20px_rgba(46,196,182,0.3)]">
                Start Project
              </Button>
              <Button size="lg" variant="outline" className="h-14 px-10 border-white/20 hover:bg-white/5 text-white text-lg">
                View Specifications
              </Button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 bg-[#0B132B] py-12">
        <div className="container mx-auto px-4 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="h-6 w-6 rounded border border-white/20 flex items-center justify-center">
              <div className="h-2 w-2 rounded-full bg-graviton-cyan" />
            </div>
            <span className="font-orbitron font-bold text-zinc-300">Graviton Systems</span>
          </div>
          <p className="text-sm text-zinc-500">© {new Date().getFullYear()} Graviton Systems. All rights reserved.</p>
          <div className="flex gap-4 text-sm text-zinc-500">
            <Link href="#" className="hover:text-white transition-colors">Privacy</Link>
            <Link href="#" className="hover:text-white transition-colors">Terms</Link>
            <Link href="#" className="hover:text-white transition-colors">Support</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
