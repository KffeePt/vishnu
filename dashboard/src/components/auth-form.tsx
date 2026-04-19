'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { getAuth, User, signInWithEmailAndPassword, UserCredential } from 'firebase/auth';
import { UserAuth } from '../context/auth-context';
import ParticleSystem, { ParticleSystemHandles } from './ui/particle-system';
import {
  House,
} from "lucide-react"
import { signIn } from 'next-auth/react';
import { db } from '../config/firebase'; // Import Firestore db instance
import { doc, setDoc, Timestamp } from 'firebase/firestore'; // Import Firestore functions
import { useToast } from '../hooks/use-toast'; // Import useToast
import { GrGoogle } from "react-icons/gr";
import zxcvbn from 'zxcvbn';
import { ThemeToggle } from './theme-toggle'; // Added theme toggle import
import { Button } from './ui/button'; // Changed to use generic UI button
import VantaBackground from './ui/vanta-background/vanta-background';

// --- Validation Regex ---
const passwordRegex = /^(?=.*[0-9])(?=.*[!@#$%^&*])[a-zA-Z0-9!@#$%^&*]{12,}$/;
const emailRegex = /\S+@\S+\.\S+/;

// --- Interfaces ---
interface EnhancedError extends Error {
  response?: Response;
  statusCode?: number;
}

interface AuthContextType {
  user: User | null;
  userClaims: { admin?: boolean } | null; // Add userClaims with potential admin property
  googleSignIn: () => Promise<UserCredential>; // Updated return type
  logOut: () => Promise<void>;
}

// Define OrderData type (subset of what's in OrderScreen)
// Ensure this matches the structure saved by OrderScreen
type PendingOrderData = {
  items: any[]; // Simplified for AuthForm, OrderScreen has detailed type
  deliveryInfo: {
    nombre: string;
    direccion: string;
    codigoPostal: string;
    numeroCelular: string;
    direccionesEntrega: string;
  };
  deliveryDateTime: {
    fecha: string | Date | null; // Can be string from JSON, needs parsing
    hora: string;
  };
  paymentMethod: string;
  orderId?: string;
  restaurantId?: string; // Crucial for submission
  // Add other fields if they are essential for AuthForm to submit
};

// --- Component ---
export const AuthForm: React.FC = () => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast(); // Initialize useToast
  const [isLoginMode, setIsLoginMode] = useState<boolean>(true);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [username, setUsername] = useState<string>(""); // Added username state
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [passwordsMatch, setPasswordsMatch] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false); // For email/password actions
  const [googleLoading, setGoogleLoading] = useState<boolean>(false); // For Google actions
  const [passwordStrength, setPasswordStrength] = useState<number>(0);
  const [strengthMessage, setStrengthMessage] = useState<string>('');
  const [preserveEmailPostSignup, setPreserveEmailPostSignup] = useState<boolean>(false);

  // --- Easter Egg State ---
  const [clickCount, setClickCount] = useState(0);
  const [scale, setScale] = useState(1);
  const particleSystemRef = useRef<ParticleSystemHandles>(null);
  const logoRef = useRef<HTMLButtonElement>(null);

  const handleLogoClick = () => {
    const newClickCount = clickCount + 1;
    setScale(1 + newClickCount * 0.15);

    if (newClickCount >= 5) {
      if (particleSystemRef.current && logoRef.current) {
        const rect = logoRef.current.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        particleSystemRef.current.createExplosion(x, y, ["#f08700", "#f49f0a", "#efca08", "#00a6a6", "#bbdef0"]);
      }
      setClickCount(0);
      setTimeout(() => setScale(1), 300);
    } else {
      setClickCount(newClickCount);
    }
  };

  // Destructure all needed values from AuthContext *once*
  const { user, userClaims, googleSignIn, logOut } = UserAuth() as AuthContextType;
  const auth = getAuth();

  // --- Auth State Monitoring ---
  useEffect(() => {
    // No need to redeclare context values here
    const unsubscribe = auth.onAuthStateChanged(async (firebaseUser) => { // Make async
      const callbackUrl = searchParams.get('callbackUrl'); // Original intended destination
      console.log('AuthForm: onAuthStateChanged. Firebase User:', firebaseUser?.uid, 'Callback URL:', callbackUrl);

      if (firebaseUser) {
        const isOrderLogin = sessionStorage.getItem('isOrderSubmissionLogin') === 'true';
        const pendingOrderJSON = sessionStorage.getItem('pendingOrderData');

        if (isOrderLogin && pendingOrderJSON) {
          console.log('AuthForm: Detected login for order submission.');
          let parsedOrderData: PendingOrderData | null = null;
          try {
            parsedOrderData = JSON.parse(pendingOrderJSON);
          } catch (e) {
            console.error("AuthForm: Error parsing pendingOrderData from session storage", e);
            toast({ title: "Error", description: "No se pudieron recuperar los datos del pedido.", variant: "destructive" });
            sessionStorage.removeItem('isOrderSubmissionLogin');
            sessionStorage.removeItem('pendingOrderData');
            router.push(callbackUrl || '/'); // Fallback redirect
            return;
          }

          if (parsedOrderData && parsedOrderData.paymentMethod !== 'mercadopago') {
            console.log('AuthForm: Attempting direct submission for non-MercadoPago order.');
            // --- Direct Order Submission Logic ---
            if (!parsedOrderData.deliveryDateTime?.fecha || !parsedOrderData.restaurantId) {
              toast({ title: "Datos incompletos", description: "Faltan datos esenciales (fecha o ID de restaurante) para el pedido. Por favor, completa tu pedido.", variant: "destructive" });
              // Keep session data for OrderScreen to handle, redirect back to order page
              router.push(callbackUrl || '/ordenar'); // Ensure callbackUrl is likely the order page
              return;
            }

            let deliveryDate: Date;
            if (typeof parsedOrderData.deliveryDateTime.fecha === 'string') {
              deliveryDate = new Date(parsedOrderData.deliveryDateTime.fecha);
              if (isNaN(deliveryDate.getTime())) {
                toast({ title: "Fecha inválida", description: "La fecha de entrega no es válida. Por favor, selecciona de nuevo.", variant: "destructive" });
                router.push(callbackUrl || '/ordenar');
                return;
              }
            } else if (parsedOrderData.deliveryDateTime.fecha instanceof Date) {
              deliveryDate = parsedOrderData.deliveryDateTime.fecha;
            } else {
              toast({ title: "Fecha inválida", description: "Formato de fecha de entrega no reconocido.", variant: "destructive" });
              router.push(callbackUrl || '/ordenar');
              return;
            }


            const finalOrderId = parsedOrderData.orderId || crypto.randomUUID();
            const orderToSubmit = {
              ...parsedOrderData,
              orderId: finalOrderId,
              userId: firebaseUser.uid,
              restaurantId: parsedOrderData.restaurantId, // Already included from OrderScreen
              createdAt: Timestamp.now(),
              deliveryDateTime: {
                date: Timestamp.fromDate(deliveryDate),
                timeSlot: parsedOrderData.deliveryDateTime.hora,
              },
              status: {
                orderStatus: "confirmado",
                progress: 25,
                estimatedTime: 45, // Default, OrderScreen might have more logic
                updatedAt: Timestamp.now()
              },
              paymentDetails: {
                method: parsedOrderData.paymentMethod,
                status: parsedOrderData.paymentMethod === 'efectivo' ? "pending_cash_payment" : "pending_confirmation",
              }
            };

            try {
              const orderDocRef = doc(db, "orders", finalOrderId);
              await setDoc(orderDocRef, orderToSubmit);
              console.log("AuthForm: Order submitted successfully (non-MP) with ID:", finalOrderId);

              toast({
                title: "Pedido Realizado",
                description: `Tu pedido #${finalOrderId.substring(0, 6)}... ha sido confirmado.`,
                variant: "default",
              });

              sessionStorage.removeItem('pendingOrderData');
              sessionStorage.removeItem('isOrderSubmissionLogin');
              router.push(`/tracking?external_reference=${finalOrderId}`);
              return; // Submission handled, exit onAuthStateChanged logic here

            } catch (error) {
              console.error("AuthForm: Error submitting order (non-MP):", error);
              toast({
                title: "Error al Realizar Pedido",
                description: "Hubo un problema al guardar tu pedido. Por favor, intenta desde la pantalla de orden.",
                variant: "destructive",
              });
              // Redirect to order screen for user to retry, keep session data for now
              router.push(callbackUrl || '/ordenar');
              return;
            }
            // --- End Direct Order Submission Logic ---
          } else if (parsedOrderData && parsedOrderData.paymentMethod === 'mercadopago') {
            // For MercadoPago, OrderScreen handles the brick. Just redirect.
            // The flags 'isOrderSubmissionLogin' and 'pendingOrderData' remain for OrderScreen.
            console.log('AuthForm: MercadoPago payment detected. Redirecting to OrderScreen for brick initialization.');
            router.push(callbackUrl || '/ordenar'); // Ensure callbackUrl is the order page
            return;
          } else {
            // No valid pending order data or unrecognized payment method for direct submission
            console.log('AuthForm: No specific order action after login, or payment method requires OrderScreen. Proceeding with normal redirect.');
            sessionStorage.removeItem('isOrderSubmissionLogin'); // Clean up if no action taken
            sessionStorage.removeItem('pendingOrderData');
          }
        }
        // Standard redirect logic if not an order submission login or if MP
        if (callbackUrl === '/udhhmbtc') {
          if (userClaims !== undefined) {
            if (userClaims?.admin === true) {
              console.log('AuthForm: Admin claims verified, redirecting to /udhhmbtc');
              router.push('/udhhmbtc');
            } else {
              console.warn('AuthForm: Admin access denied, redirecting to /');
              router.push('/');
            }
          } else {
            console.log('AuthForm: Claims still loading for admin check, waiting...');
            // Wait for userClaims to update, effect will re-run
          }
        } else {
          const redirectTarget = callbackUrl || '/';
          console.log('AuthForm: Redirecting to general target:', redirectTarget);
          router.push(redirectTarget);
        }
      } else {
        console.log('AuthForm: Firebase user is null.');
      }
    });
    return () => unsubscribe();
  }, [auth, router, searchParams, userClaims, toast]); // Added toast

  // --- Reset form state on mode change ---
  useEffect(() => {
    if (preserveEmailPostSignup) {
      // Mode changed to login AFTER signup. Email is already set and preserved.
      // Reset fields that are not relevant or should be cleared for login.
      setUsername(""); // Not used in login mode
      setPassword(""); // Ensure password field is clear for login
      setConfirmPassword(""); // Ensure confirm password field is clear
      setPasswordsMatch(true); // Reset for safety
      setErrorMessage(''); // Clear any previous error messages
      setPasswordStrength(0); // Reset strength display
      setStrengthMessage('');

      setPreserveEmailPostSignup(false); // Reset the flag now that we've handled it
    } else {
      // This is a manual toggle by the user, or initial setup. Reset all relevant fields.
      setUsername("");
      setEmail(""); // Clear email on manual toggle
      setPassword("");
      setConfirmPassword("");
      setPasswordsMatch(true);
      setErrorMessage('');
      // setIsLoading(false); // Generally managed by their respective async operations
      // setGoogleLoading(false); // Generally managed by their respective async operations
      setPasswordStrength(0);
      setStrengthMessage('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoginMode]); // Effect runs when isLoginMode changes

  // --- Password Strength Calculation ---
  const updatePasswordStrength = (newPassword: string) => {
    setPassword(newPassword);
    if (confirmPassword) {
      setPasswordsMatch(confirmPassword === newPassword);
    }
    if (!newPassword) {
      setPasswordStrength(0); setStrengthMessage(''); return;
    }
    const result = zxcvbn(newPassword);
    setPasswordStrength(result.score);
    switch (result.score) {
      case 0: setStrengthMessage('Very weak'); break;
      case 1: setStrengthMessage('Weak'); break;
      case 2: setStrengthMessage('Fair'); break;
      case 3: setStrengthMessage('Good'); break;
      case 4: setStrengthMessage('Strong'); break;
      default: setStrengthMessage('');
    }
  };

  // --- Check Passwords Match ---
  const checkPasswordsMatch = (confirmPwd: string) => {
    setConfirmPassword(confirmPwd);
    setPasswordsMatch(confirmPwd === password);
  };

  // --- Strength Bar Component ---
  const StrengthProgressBar: React.FC<{ score: number }> = ({ score }) => {
    const getColor = (index: number) => {
      if (score >= index + 1) {
        if (score <= 1) return 'bg-red-500';
        if (score <= 2) return 'bg-yellow-500';
        return 'bg-green-500';
      }
      return 'bg-gray-300';
    };
    return (
      <div className="flex space-x-1 mt-1 h-2 rounded overflow-hidden">
        {[...Array(4)].map((_, i) => (
          <div key={i} className={`flex-1 ${getColor(i)} transition-colors duration-300 ease-in-out`}></div>
        ))}
      </div>
    );
  };

  // --- Email/Password Submit Handler ---
  const handleEmailPasswordSubmit = async (e?: React.FormEvent<HTMLFormElement>): Promise<void> => {
    if (e) e.preventDefault(); // Prevent default form submission if event is passed

    if (isLoading || googleLoading) {
      console.log("AuthForm: Submission attempt while already loading. Aborting.");
      return;
    }
    setIsLoading(true);
    setErrorMessage('');

    // --- Client-Side Validation ---
    if (!email || !password || (!isLoginMode && !username) || (!isLoginMode && passwordStrength >= 3 && !confirmPassword)) {
      setErrorMessage("All required fields must be filled.");
      setIsLoading(false); return;
    }
    if (!emailRegex.test(email)) {
      setErrorMessage("Please enter a valid email address.");
      setIsLoading(false); return;
    }
    if (!isLoginMode) { // Signup specific validation
      if (!passwordRegex.test(password)) {
        setErrorMessage("Password: 12+ chars, incl. number & symbol (!@#$%^&*).");
        setIsLoading(false); return;
      }
      if (passwordStrength < 2) {
        setErrorMessage("Password is too weak. Please choose a stronger one.");
        setIsLoading(false); return;
      }
      if (passwordStrength >= 3 && !passwordsMatch) {
        setErrorMessage("Passwords do not match.");
        setIsLoading(false); return;
      }
    }

    try {
      if (isLoginMode) {
        // --- Login Logic (Call API Route) ---
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        let data;
        const responseText = await response.text(); // Read body as text first

        if (responseText) {
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            // Log the actual response text that failed to parse for debugging
            console.error("AuthForm: Failed to parse JSON response from /api/auth/login. Response text:", responseText, "Error:", parseError);
            // Throw a more specific error if parsing fails on non-empty text
            throw new Error('Received malformed JSON data from the server.');
          }
        } else {
          // Handle empty response body
          // If response.ok is true, it implies success with no data.
          // If response.ok is false, it implies an error response with an empty body.
          data = {}; // Default to empty object, error handling below will use status code
          if (response.ok) {
            console.warn("AuthForm: /api/auth/login returned an empty body with a success status.");
          }
        }

        if (!response.ok) {
          // Use data.error if available from parsed JSON (even if it was {} from empty response),
          // otherwise a generic message based on status.
          const errorMessage = data?.error || `Login failed: ${response.statusText || response.status} (Server response code: ${response.status})`;
          const error = new Error(errorMessage);
          (error as any).statusCode = response.status;
          throw error;
        }
        // API Login was successful, now sign in on the client-side Firebase instance
        // to ensure onAuthStateChanged picks it up.
        try {
          await signInWithEmailAndPassword(auth, email, password);
          // Client-side Firebase sign-in successful.
          // onAuthStateChanged in useEffect will now handle redirection.
          // setIsLoading(false) will be handled by onAuthStateChanged or finally block if redirection occurs.
          // If onAuthStateChanged doesn't redirect immediately, loading might need to be stopped sooner.
          // For now, assume onAuthStateChanged will lead to unmount or further state change.
        } catch (clientLoginError: any) {
          console.error("AuthForm: Client-side Firebase signIn failed after successful API login:", clientLoginError);
          // The API login was successful, but client-side Firebase sync failed.
          // This is an awkward state. User has a server session cookie but no client Firebase session.
          setErrorMessage(clientLoginError.message || "Failed to sync login with the browser. Please try again.");
          setIsLoading(false); // Stop loading as client-side part failed.
          return; // Exit handler
        }
      } else {
        // --- Signup Logic ---
        const response = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, username }), // Added username to payload
        });
        let data;
        const responseText = await response.text(); // Read body as text first

        if (responseText) {
          try {
            data = JSON.parse(responseText);
          } catch (parseError) {
            console.error("AuthForm: Failed to parse JSON response from /api/auth/signup. Response text:", responseText, "Error:", parseError);
            throw new Error('Received malformed JSON data from the server during signup.');
          }
        } else {
          data = {}; // Default to empty object
          if (response.ok) {
            console.warn("AuthForm: /api/auth/signup returned an empty body with a success status.");
          }
        }

        if (!response.ok) {
          const errorMessage = data?.error || `Signup failed: ${response.statusText || response.status} (Server response code: ${response.status})`;
          const error = new Error(errorMessage) as EnhancedError;
          // Not setting error.response = response as response body is consumed by .text()
          // If the original 'response' object (headers, status) is critical on EnhancedError,
          // this part of the error object would be missing.
          // However, statusCode and message are preserved.
          error.statusCode = response.status;
          throw error;
        }
        console.log("Signup successful via API:", data);
        // Signup successful, now switch to login mode and prompt user to log in.
        toast({
          title: "Account Created Successfully!",
          description: "Please log in with your new credentials.",
          variant: "default",
        });
        setPreserveEmailPostSignup(true); // Signal to preserve email before mode change
        setIsLoginMode(true); // Switch to login mode, this will trigger useEffect
        // Explicitly clear password fields for the new login mode
        setPassword("");
        setConfirmPassword("");
        // Username, password strength etc. will be handled by the useEffect.
        // Email state (holding the signup email) will be preserved by the useEffect logic.
        // No automatic signIn, user needs to log in manually.
        // The email field will be pre-filled with the 'email' state.
      }
    } catch (error) {
      console.error(`${isLoginMode ? 'Login' : 'Signup'} Error:`, error);
      let displayError = `An unexpected error occurred. Please try again.`;
      if (error instanceof Error) {
        // Firebase specific error codes for login
        // Use the error message directly from the caught error (thrown from API response)
        // No need to check for Firebase specific codes here anymore for login,
        // as the API route handles that and returns a user-friendly message.
        if (!isLoginMode) { // Keep signup error handling as is
          // Use message from EnhancedError or generic Error
          displayError = error.message;
        }
      } else if (error && typeof error === 'object' && 'message' in error) {
        displayError = error.message as string;
      }
      setErrorMessage(displayError);
    } finally {
      setIsLoading(false);
    }
  };

  // --- Google Submit Handler ---
  const handleGoogleSubmit = async (): Promise<void> => {
    setGoogleLoading(true);
    setErrorMessage(''); // Clear previous errors
    try {
      // 1. Perform client-side Google Sign-In using AuthContext's googleSignIn
      const userCredential = await googleSignIn(); // This now returns a Promise<UserCredential>

      if (userCredential && userCredential.user) {
        // 2. Get ID token from the signed-in user
        const idToken = await userCredential.user.getIdToken();

        // 3. Call the NextAuth session API route to create a server-side session
        const response = await fetch('/api/auth/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
          credentials: 'include', // Ensure cookies are handled correctly for session creation
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to create server session.');
        }

        console.log("Google Sign-In: Firebase sign-in successful and NextAuth server session created.");
        // The onAuthStateChanged listener in AuthContext will handle UI updates and redirection
        // based on the Firebase auth state. The NextAuth session cookie is now set.
      } else {
        // This case should ideally not be reached if signInWithPopup resolves successfully.
        // If it does, it means signInWithPopup resolved without a user or was cancelled.
        console.warn("Google Sign-In: UserCredential or user object was not available after sign-in attempt.");
        setErrorMessage('Google Sign-In was cancelled or failed to return user information.');
      }
    } catch (error: any) {
      console.error("Google Sign-In / Session Creation Error:", error);
      // Handle specific Firebase error codes for user-friendly messages
      let errorMsg = 'An error occurred during Google Sign-In or session setup.';
      if (error.code) {
        switch (error.code) {
          case 'auth/popup-closed-by-user':
            errorMsg = 'Google Sign-In was cancelled.';
            break;
          case 'auth/cancelled-popup-request':
            errorMsg = 'Google Sign-In was cancelled.';
            break;
          case 'auth/popup-blocked':
            errorMsg = 'Google Sign-In popup was blocked by the browser. Please enable popups.';
            break;
          // Add other Firebase auth error codes as needed
          default:
            errorMsg = error.message || errorMsg;
        }
      } else if (error instanceof Error) {
        errorMsg = error.message;
      }
      setErrorMessage(errorMsg);
    } finally {
      setGoogleLoading(false);
    }
  }

  // --- Toggle Mode ---
  const toggleMode = () => {
    setIsLoginMode(!isLoginMode);
  };

  // --- Render ---
  return (
    <>
      <VantaBackground />
      <div className="min-h-screen min-w-screen w-full flex flex-col justify-center items-center px-4 pt-24 pb-8 relative z-10">
        {/* Simple 3 Icon Navbar */}
        <nav className="fixed top-0 left-0 right-0 w-full bg-transparent shadow-sm z-10">
          <div className="flex flex-row mx-auto items-center justify-between h-16 px-4">
            {/* Left side: Home Icon */}
            <Link href="/" aria-label="Home" className=" p-2 rounded-md hover:bg-accent transition-colors w-1/3">
              <House className="h-4 w-4 text-card-foreground mx-auto " />
            </Link>
            {/* Center: Logo Icon */}
            <div className="relative w-1/3 flex justify-center items-center">
              <Button
                ref={logoRef}
                type="button"
                variant="ghost"
                aria-label="Site Logo"
                className="hover:bg-accent transition-transform duration-200 ease-in-out p-2 rounded-md"
                onClick={handleLogoClick}
                style={{ transform: `scale(${scale})` }}
              >
                <Image
                  src="/icon.png"
                  alt="Site Logo"
                  width={28}
                  height={28}
                  className="text-card-foreground"
                />
              </Button>
            </div>
            {/* Right side: Theme Toggle */}
            <div className="flex items-center space-x-2 w-1/3">
              <ThemeToggle />
            </div>
          </div>
        </nav>

        <div className="mx-auto lg:w-full max-w-lg mt-8"> {/* Added margin top to ensure title is clear of potential large icons */}
          <ParticleSystem ref={particleSystemRef} />
        </div>

        <div className="mx-auto w-full max-w-lg">
          <div className="bg-card/70 dark:bg-card/50 backdrop-blur-sm py-6 px-4 rounded-lg">
            <h2 className="text-center text-3xl font-extrabold text-primary mb-8 [text-shadow:1px_1px_2px_var(--tw-shadow-color)] shadow-black/50 dark:shadow-white/50">
              {isLoginMode ? 'Log In' : 'Create an Account'}
            </h2>
            <form className="space-y-4" onSubmit={handleEmailPasswordSubmit}>
              {errorMessage && (
                <div className="text-red-600 text-sm p-2 bg-red-100 border border-red-400 rounded-md">
                  {errorMessage}
                </div>
              )}

              <div className="space-y-3">
                {/* Username Input (Sign Up Mode Only) */}
                {!isLoginMode && (
                  <div>
                    <label htmlFor="username" className="block text-sm font-medium text-foreground mb-1">
                      Username
                    </label>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground bg-background"
                      placeholder="Choose a username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                )}

                {/* Email Input */}
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-foreground mb-1">
                    Email
                  </label>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground bg-background"
                    placeholder="your@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>

                {/* Password Input */}
                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-foreground mb-1">
                    Password
                  </label>
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={isLoginMode ? "current-password" : "new-password"}
                    required
                    className="w-full px-3 py-2 border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground bg-background"
                    placeholder={isLoginMode ? "••••••••" : "Create a strong password"}
                    value={password}
                    onChange={(e) => isLoginMode ? setPassword(e.target.value) : updatePasswordStrength(e.target.value)}
                  />
                  {/* Password Strength (Sign Up Mode Only) */}
                  {!isLoginMode && password && (
                    <div className="mt-2">
                      <StrengthProgressBar score={passwordStrength} />
                      <p className={`text-xs mt-1 ${passwordStrength <= 1 ? 'text-red-500' :
                          passwordStrength <= 2 ? 'text-yellow-500' : 'text-green-500'
                        }`}>
                        Strength: {strengthMessage}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Min 12 chars, incl. number & symbol (!@#$%^&*).
                      </p>
                    </div>
                  )}
                </div>

                {/* Confirm Password Input (Sign Up Mode Only & Strong Password) */}
                {!isLoginMode && (
                  <div className={`transition-all duration-300 ease-in-out overflow-hidden ${passwordStrength >= 3 ? 'max-h-40 opacity-100' : 'max-h-0 opacity-0'
                    }`}>
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-foreground mb-1">
                        Confirm Password
                      </label>
                      <input
                        id="confirmPassword"
                        name="confirmPassword"
                        type="password"
                        autoComplete="new-password"
                        required={passwordStrength >= 3} // Only require if visible
                        className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary text-foreground bg-background ${!passwordsMatch && confirmPassword ? 'border-red-500' : 'border-border'
                          }`}
                        placeholder="Confirm your password"
                        value={confirmPassword}
                        onChange={(e) => checkPasswordsMatch(e.target.value)}
                      />
                      {!passwordsMatch && confirmPassword && (
                        <p className="text-xs text-red-500 mt-1">
                          Passwords do not match
                        </p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {/* Submit Button */}
                <button
                  type="submit"
                  className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  // onClick removed, form onSubmit will handle it
                  disabled={isLoading || googleLoading}
                >
                  {isLoading ? (
                    <div className="flex items-center">
                      <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      {isLoginMode ? 'Signing in...' : 'Creating account...'}
                    </div>
                  ) : (
                    isLoginMode ? 'Sign In' : 'Create Account'
                  )}
                </button>

                {/* Divider */}
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="px-2 bg-card text-muted-foreground">Or continue with</span>
                  </div>
                </div>

                {/* Google Button */}
                <button
                  type="button"
                  className="w-full flex justify-center items-center py-2 px-4 border border-border rounded-md shadow-sm text-sm font-medium text-foreground bg-card hover:bg-accent focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                  onClick={handleGoogleSubmit}
                  disabled={isLoading || googleLoading}
                >
                  {googleLoading ? (
                    <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  ) : (
                    <GrGoogle className="h-5 w-5 mr-2" />
                  )}
                  Google
                </button>

                {/* Toggle Mode Link */}
                <div className="text-center text-sm">
                  <button
                    type="button"
                    onClick={toggleMode}
                    className="font-medium text-primary hover:text-primary/90 focus:outline-none"
                  >
                    {isLoginMode ? 'Don\'t have an account? Sign up' : 'Already have an account? Log in'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
};

export default AuthForm;