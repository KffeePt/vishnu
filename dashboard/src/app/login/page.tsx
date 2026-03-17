"use client";

import { useState, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  GithubAuthProvider, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  ConfirmationResult
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Github, Chrome, Phone, ArrowLeft, KeyRound } from "lucide-react";

declare global {
  interface Window {
    recaptchaVerifier: any;
  }
  var grecaptcha: any;
}

type AuthView = "main" | "email" | "phone";

export default function LoginPage() {
  const [view, setView] = useState<AuthView>("main");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  
  const router = useRouter();

  useEffect(() => {
    // Setup recaptcha on mount for phone auth
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
      });
    }
  }, []);

  const handleProviderLogin = async (provider: any, providerName: string) => {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, provider);
      router.replace('/portal');
    } catch (err: any) {
      setError(`Failed to sign in with ${providerName}. ${err.message}`);
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.replace('/portal');
    } catch (err: any) {
      setError("Invalid credentials or user does not exist.");
      setLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return setError("Please enter a phone number");
    
    setLoading(true);
    setError("");
    try {
      const appVerifier = window.recaptchaVerifier;
      const confirmation = await signInWithPhoneNumber(auth, phone, appVerifier);
      setConfirmationResult(confirmation);
    } catch (err: any) {
      setError(`Failed to send SMS code. ${err.message}`);
      // Reset recaptcha on error so user can try again
      if (window.recaptchaVerifier) {
         window.recaptchaVerifier.render().then((widgetId: any) => {
           grecaptcha.reset(widgetId);
         });
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp || !confirmationResult) return;
    
    setLoading(true);
    setError("");
    try {
      await confirmationResult.confirm(otp);
      router.replace('/portal');
    } catch (err: any) {
      setError(`Invalid verification code.`);
      setLoading(false);
    }
  };

  const renderMainView = () => (
    <div className="space-y-4 animate-fadeIn animate-duration-300">
      <Button 
        variant="outline" 
        className="w-full justify-start h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all shadow-md group"
        onClick={() => handleProviderLogin(new GithubAuthProvider(), "GitHub")}
        disabled={loading}
      >
        <Github className="mr-3 h-5 w-5 text-zinc-100 group-hover:scale-110 transition-transform" />
        Continue with GitHub
      </Button>
      
      <Button 
        variant="outline" 
        className="w-full justify-start h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all shadow-md group"
        onClick={() => handleProviderLogin(new GoogleAuthProvider(), "Google")}
        disabled={loading}
      >
        <Chrome className="mr-3 h-5 w-5 text-red-400 group-hover:scale-110 transition-transform" />
        Continue with Google
      </Button>

      <div className="relative py-2">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-white/10" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-zinc-950/80 px-2 text-zinc-400 backdrop-blur-md rounded">or</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Button 
          variant="outline" 
          className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300 transition-all font-normal"
          onClick={() => setView("phone")}
          disabled={loading}
        >
          <Phone className="mr-2 h-4 w-4 text-blue-400" />
          Phone / SMS
        </Button>
        <Button 
          variant="outline" 
          className="h-12 bg-white/5 border-white/10 hover:bg-white/10 text-zinc-300 transition-all font-normal"
          onClick={() => setView("email")}
          disabled={loading}
        >
          <Mail className="mr-2 h-4 w-4 text-emerald-400" />
          Email Admin
        </Button>
      </div>
    </div>
  );

  const renderEmailView = () => (
    <form onSubmit={handleEmailLogin} className="space-y-4 animate-fadeInRight animate-duration-300">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-zinc-300">Admin Email</Label>
        <Input 
          id="email" 
          type="email" 
          placeholder="admin@example.com" 
          required 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/5 border-white/10 text-white focus:border-emerald-500 transition-colors h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-zinc-300">Password</Label>
        <Input 
          id="password" 
          type="password" 
          required 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-white/5 border-white/10 text-white focus:border-emerald-500 transition-colors h-11"
        />
      </div>
      <div className="pt-2 flex gap-3">
        <Button type="button" variant="ghost" className="px-3 hover:bg-white/5" onClick={() => { setView("main"); setError(""); }}>
          <ArrowLeft className="h-4 w-4 text-zinc-400" />
        </Button>
        <Button type="submit" className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-500/20" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
        </Button>
      </div>
    </form>
  );

  const renderPhoneView = () => (
    <div className="space-y-4 animate-fadeInLeft animate-duration-300">
      {!confirmationResult ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-zinc-300">Phone Number (with country code)</Label>
            <Input 
              id="phone" 
              type="tel" 
              placeholder="+12345678900" 
              required 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-blue-500 transition-colors h-11"
            />
          </div>
          <div className="pt-2 flex gap-3">
            <Button type="button" variant="ghost" className="px-3 hover:bg-white/5" onClick={() => { setView("main"); setError(""); }}>
              <ArrowLeft className="h-4 w-4 text-zinc-400" />
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send SMS Code"}
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerifyOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="otp" className="text-zinc-300">Verification Code</Label>
            <Input 
              id="otp" 
              type="text" 
              placeholder="123456" 
              required 
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-blue-500 tracking-widest text-center text-lg h-12"
              maxLength={6}
            />
          </div>
          <div className="pt-2 flex gap-3">
            <Button type="button" variant="ghost" className="px-3 hover:bg-white/5" onClick={() => { setConfirmationResult(null); setError(""); }}>
              <ArrowLeft className="h-4 w-4 text-zinc-400" />
            </Button>
            <Button type="submit" className="flex-1 bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-500/20" disabled={loading || otp.length < 6}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify & Sign In"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center bg-zinc-950 overflow-hidden font-sans">
      {/* Background Ambience */}
      <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse animate-duration-[4s]" />
      <div className="absolute -bottom-[20%] -right-[10%] w-[50%] h-[50%] bg-indigo-600/10 rounded-full blur-[120px] mix-blend-screen pointer-events-none animate-pulse animate-duration-[5s]" />
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.03] mix-blend-overlay pointer-events-none" />

      {/* Required for Firebase Phone Auth invisible Recaptcha */}
      <div id="recaptcha-container"></div>

      <div className="z-10 w-full max-w-[420px] px-4">
        <div className="mb-8 flex flex-col items-center justify-center animate-fadeInDown animate-duration-500">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 shadow-xl shadow-blue-500/20 flex items-center justify-center mb-4">
            <KeyRound className="text-white h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-1">Welcome to Vishnu</h1>
          <p className="text-zinc-400 text-sm">Secure Command Dashboard</p>
        </div>

        <Card className="border-white/10 bg-zinc-900/40 backdrop-blur-xl shadow-2xl animate-fadeInUp animate-duration-[600ms] overflow-hidden">
          <CardHeader className="pb-6 border-b border-white/5 bg-white/[0.02]">
            <CardTitle className="text-lg font-medium text-zinc-100">
              {view === "main" && "Sign In Options"}
              {view === "email" && "Administrator Sign In"}
              {view === "phone" && "Mobile Verification"}
            </CardTitle>
            <CardDescription className="text-zinc-400">
              {view === "main" && "Select a provider to access the dashboard."}
              {view === "email" && "Enter your Firebase Auth credentials."}
              {view === "phone" && "We'll send you a secure SMS code."}
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            {error && (
              <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fadeIn">
                {error}
              </div>
            )}

            {view === "main" && renderMainView()}
            {view === "email" && renderEmailView()}
            {view === "phone" && renderPhoneView()}
          </CardContent>
          <CardFooter className="flex justify-center pb-6">
            <p className="text-xs text-zinc-600 text-center px-6">
              Access is restricted to authorized personnel only. All login attempts are recorded.
            </p>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
