import React from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { UserAuth } from "@/context/auth-context";

interface SignInPromptProps {
  googleSigningIn?: boolean;
}

export function SignInPrompt({ googleSigningIn = false }: SignInPromptProps) {
  const { googleSignIn } = UserAuth();

  return (
    <div className="flex justify-center items-center min-h-screen w-full flex-col gap-4">
      <h1 className="text-2xl font-bold">Page Under Construction</h1>
      <p className="text-muted-foreground text-center">
        This page is currently under construction. Please sign in to access beta features.
      </p>
      <Button onClick={googleSignIn} disabled={googleSigningIn}>
        {googleSigningIn && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Sign In with Google
      </Button>
    </div>
  );
}
