"use client";

import { useState, useEffect } from "react";
import { 
  signInWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider, 
  GithubAuthProvider, 
  RecaptchaVerifier, 
  signInWithPhoneNumber,
  ConfirmationResult,
  AuthProvider,
  UserCredential
} from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, Github, Chrome, Phone, ArrowLeft, KeyRound } from "lucide-react";
declare global {
  interface Window {
    recaptchaVerifierOverlay?: RecaptchaVerifier;
    grecaptcha?: { reset: (id?: number) => void };
  }
}

type AuthView = "main" | "email" | "phone";

interface AuthDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AuthDialog({ open, onOpenChange }: AuthDialogProps) {
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
    // We only initialize recaptcha when the dialog opens, to avoid multiple invisible widget issues
    if (open && !window.recaptchaVerifierOverlay) {
      window.recaptchaVerifierOverlay = new RecaptchaVerifier(auth, 'recaptcha-container-overlay', {
        size: 'invisible',
      });
    }
  }, [open]);

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setTimeout(() => {
        setView("main");
        setError("");
        setConfirmationResult(null);
        setOtp("");
      }, 300);
    }
  }, [open]);

  const handleSuccess = async (userResult: UserCredential) => {
    // Give it a tiny delay for context to update if needed, then route
    setTimeout(async () => {
      onOpenChange(false);
      // We will let AuthProvider handle the exact routing if we push to /login, 
      // but since we are replacing the login flow:
      const idTokenResult = await userResult.user.getIdTokenResult();
      if (idTokenResult.claims.client) {
        router.push('/portal');
      } else {
        router.push('/admin');
      }
    }, 500);
  };

  const handleProviderLogin = async (provider: AuthProvider, providerName: string) => {
    setLoading(true);
    setError("");
    try {
      const result = await signInWithPopup(auth, provider);
      await handleSuccess(result);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to sign in with ${providerName}. ${message}`);
      setLoading(false);
    }
  };

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signInWithEmailAndPassword(auth, email, password);
      await handleSuccess(result);
    } catch {
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
      const appVerifier = window.recaptchaVerifierOverlay;
      if (!appVerifier) {
        setError("Recaptcha not ready. Please try again.");
        setLoading(false);
        return;
      }
      const confirmation = await signInWithPhoneNumber(auth, phone, appVerifier);
      setConfirmationResult(confirmation);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(`Failed to send SMS code. ${message}`);
      if (window.recaptchaVerifierOverlay) {
         window.recaptchaVerifierOverlay.render().then((widgetId) => {
           window.grecaptcha?.reset(widgetId);
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
      const result = await confirmationResult.confirm(otp);
      await handleSuccess(result);
    } catch {
      setError(`Invalid verification code.`);
      setLoading(false);
    }
  };

  const renderMainView = () => (
    <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
      <Button 
        variant="outline" 
        className="w-full justify-start h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all shadow-md group border-graviton-cyan/20"
        onClick={() => handleProviderLogin(new GithubAuthProvider(), "GitHub")}
        disabled={loading}
      >
        <Github className="mr-3 h-5 w-5 text-zinc-100 group-hover:scale-110 transition-transform" />
        Continue with GitHub
      </Button>
      
      <Button 
        variant="outline" 
        className="w-full justify-start h-12 bg-white/5 border-white/10 hover:bg-white/10 text-white transition-all shadow-md group border-graviton-cyan/20"
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
          <span className="bg-[#0f172a] px-2 text-zinc-400 rounded">or</span>
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
          <Mail className="mr-2 h-4 w-4 text-graviton-cyan" />
          Email Admin
        </Button>
      </div>
    </div>
  );

  const renderEmailView = () => (
    <form onSubmit={handleEmailLogin} className="space-y-4 animate-in slide-in-from-right-4 duration-300">
      <div className="space-y-2">
        <Label htmlFor="email" className="text-zinc-300">Admin Email</Label>
        <Input 
          id="email-overlay" 
          type="email" 
          placeholder="admin@gravitonsystems.com" 
          required 
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="bg-white/5 border-white/10 text-white focus:border-graviton-cyan transition-colors h-11"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-zinc-300">Password</Label>
        <Input 
          id="password-overlay" 
          type="password" 
          required 
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="bg-white/5 border-white/10 text-white focus:border-graviton-cyan transition-colors h-11"
        />
      </div>
      <div className="pt-2 flex gap-3">
        <Button type="button" variant="ghost" className="px-3 hover:bg-white/5 text-zinc-400" onClick={() => { setView("main"); setError(""); }}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button type="submit" className="flex-1 bg-graviton-cyan hover:bg-[#20b2aa] text-[#0B132B] font-semibold" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign In"}
        </Button>
      </div>
    </form>
  );

  const renderPhoneView = () => (
    <div className="space-y-4 animate-in slide-in-from-left-4 duration-300">
      {!confirmationResult ? (
        <form onSubmit={handleSendOtp} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="phone" className="text-zinc-300">Phone Number (with country code)</Label>
            <Input 
              id="phone-overlay" 
              type="tel" 
              placeholder="+12345678900" 
              required 
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="bg-white/5 border-white/10 text-white focus:border-blue-500 transition-colors h-11"
            />
          </div>
          <div className="pt-2 flex gap-3">
            <Button type="button" variant="ghost" className="px-3 hover:bg-white/5 text-zinc-400" onClick={() => { setView("main"); setError(""); }}>
              <ArrowLeft className="h-4 w-4" />
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
              id="otp-overlay" 
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
            <Button type="button" variant="ghost" className="px-3 hover:bg-white/5 text-zinc-400" onClick={() => { setConfirmationResult(null); setError(""); }}>
              <ArrowLeft className="h-4 w-4" />
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-[#0f172a] border-white/10 text-zinc-100 p-0 overflow-hidden shadow-2xl">
        <div id="recaptcha-container-overlay"></div>
        
        {/* Header gradient */}
        <div className="h-2 w-full bg-gradient-to-r from-graviton-purple to-graviton-cyan" />
        
        <div className="p-6">
          <DialogHeader className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-graviton-purple to-graviton-cyan flex items-center justify-center">
                <KeyRound className="text-[#0B132B] h-5 w-5" />
              </div>
              <DialogTitle className="text-xl font-orbitron font-bold text-white tracking-wide">
                {view === "main" && "Authenticate"}
                {view === "email" && "Admin Access"}
                {view === "phone" && "Mobile Verify"}
              </DialogTitle>
            </div>
            <DialogDescription className="text-zinc-400 font-inter text-sm">
              {view === "main" && "Select a provider to access your Graviton platform."}
              {view === "email" && "Enter your administrative credentials."}
              {view === "phone" && "We'll send you a secure SMS code to verify identity."}
            </DialogDescription>
          </DialogHeader>

          {error && (
            <div className="mb-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-in fade-in">
              {error}
            </div>
          )}

          {view === "main" && renderMainView()}
          {view === "email" && renderEmailView()}
          {view === "phone" && renderPhoneView()}
          
          <div className="mt-6 pt-4 border-t border-white/10 text-center">
            <p className="text-xs text-zinc-500 font-inter">
              Access is restricted to authorized personnel only. All login attempts are recorded.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
