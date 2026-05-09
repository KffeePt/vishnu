"use client";

import {
    useContext,
    createContext,
    useState,
    useEffect,
    useMemo,
    useCallback,
    useRef,
    ReactNode
} from 'react';
import {
    GoogleAuthProvider,
    signInWithPopup,
    signOut,
    onAuthStateChanged,
    User,
    UserCredential,
    IdTokenResult
} from "firebase/auth";
import { auth, db } from '../config/firebase';
import { doc, getDoc, setDoc, updateDoc, DocumentData } from "firebase/firestore";
import { useTheme } from 'next-themes';
import { UserEffectiveRole } from '@/zod_schemas/user-related';

// --- Type Definitions ---

interface UserProfile extends DocumentData {
    uid: string;
    createdAt: string; // or Date
    theme?: 'dark' | 'light';
}

interface AuthContextType {
    user: User | null;
    userProfile: UserProfile | null;
    userClaims: IdTokenResult['claims'] | null;
    effectiveRole: UserEffectiveRole | null;
    loading: boolean;
    theme: string | undefined;
    changeTheme: (newTheme: 'light' | 'dark') => void;
    googleSignIn: () => Promise<UserCredential | void>;
    logOut: () => Promise<void>;
    refreshAuthUser: () => Promise<void>;
    updateUserProfileInContext: (uid: string, dataToUpdate: Partial<UserProfile>) => Promise<boolean>;
    forceRefreshUser: () => Promise<void>;
    getIDToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthContextProviderProps {
    children: ReactNode;
}

export const AuthContextProvider = ({ children }: AuthContextProviderProps) => {
    const [user, setUser] = useState<User | null>(null);
    const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
    const [userClaims, setUserClaims] = useState<IdTokenResult['claims'] | null>(null);
    const [effectiveRole, setEffectiveRole] = useState<UserEffectiveRole | null>(null);
    const [loading, setLoading] = useState(true);
    const { theme, setTheme } = useTheme();

    const changeTheme = useCallback(async (newTheme: 'light' | 'dark') => {
        if (newTheme === theme) return;
        setTheme(newTheme);
        if (user) {
            const userDocRef = doc(db, 'users', user.uid);
            try {
                await updateDoc(userDocRef, { theme: newTheme });
                setUserProfile(prevProfile =>
                    prevProfile ? { ...prevProfile, theme: newTheme } : null
                );
            } catch (error) {
                console.error('Error updating theme in Firestore:', error);
            }
        }
    }, [setTheme, user, theme]);

    const fetchUserProfile = useCallback(async (uid: string): Promise<UserProfile | null> => {
        if (!uid) {
            setUserProfile(null);
            return null;
        }
        try {
            const userDocRef = doc(db, "users", uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
                const profileData = userDocSnap.data() as UserProfile;
                setUserProfile(profileData);
                console.log("AuthContext: User profile fetched", profileData);
                return profileData;
            } else {
                console.log("AuthContext: No such user profile document!");
                setUserProfile(null);
                return null;
            }
        } catch (error) {
            console.error("AuthContext: Error fetching user profile:", error);
            setUserProfile(null);
            return null;
        }
    }, []);

    const resolveEffectiveRole = useCallback(async (claims: IdTokenResult['claims']): Promise<UserEffectiveRole | null> => {
        if (!claims) {
            setEffectiveRole(null);
            return null;
        }
        try {
            const response = await fetch('/api/admin/user/role', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ claims }),
            });

            if (!response.ok) {
                console.error('AuthContext: Failed to resolve effective role');
                setEffectiveRole(null);
                return null;
            }

            const data = await response.json();
            const effectiveRole = data.effectiveRole || null;
            setEffectiveRole(effectiveRole);
            console.log("AuthContext: Effective role resolved", effectiveRole);
            return effectiveRole;
        } catch (error) {
            console.error("AuthContext: Error resolving effective role:", error);
            setEffectiveRole(null);
            return null;
        }
    }, []);

    useEffect(() => {
        // Global fetch interceptor for detecting 401 Unauthorized (Stale Session)
        const originalFetch = window.fetch;
        window.fetch = async (...args) => {
            const response = await originalFetch(...args);
            if (response.status === 401) {
                const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');
                // Do not intercept auth-session checks
                if (url.includes('/api/') && !url.includes('/api/auth/session') && !url.includes('/api/session')) {
                    if (auth.currentUser) {
                        try {
                            // Try to force-refresh the Firebase token.
                            // If it succeeds, the 401 was likely just an expired master password session or similar.
                            await auth.currentUser.getIdToken(true);
                        } catch (e) {
                            // If token refresh fails, the session is truly dead (e.g. 24h expired or revoked).
                            window.dispatchEvent(new CustomEvent('session-stale'));
                        }
                    } else {
                        // Not logged in at all
                        window.dispatchEvent(new CustomEvent('session-stale'));
                    }
                }
            }
            return response;
        };
        return () => {
            window.fetch = originalFetch;
        };
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setLoading(true);
            if (currentUser) {
                try {
                    const idToken = await currentUser.getIdToken();
                    await fetch('/api/auth/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ idToken }),
                    });
                    const idTokenResult = await currentUser.getIdTokenResult(true); // Force refresh to get latest claims
                    let profile = await fetchUserProfile(currentUser.uid);

                    // If no profile exists, create one
                    if (!profile) {
                        console.log("AuthContext: No profile found, creating one...");
                        const userDocRef = doc(db, "users", currentUser.uid);
                        const newProfile: UserProfile = {
                            uid: currentUser.uid,
                            createdAt: new Date().toISOString(),
                            // Add other default fields if necessary
                        };
                        await setDoc(userDocRef, newProfile);
                        profile = newProfile; // Use the newly created profile
                    }

                    setUser(currentUser);
                    setUserClaims(idTokenResult.claims);
                    setUserProfile(profile);
                    await resolveEffectiveRole(idTokenResult.claims);
                } catch (error) {
                    console.error("Error getting user claims or profile:", error);
                    setUser(currentUser);
                    setUserClaims(null);
                    setUserProfile(null);
                    setEffectiveRole(null);
                }
            } else {
                await fetch('/api/auth/session-logout', { method: 'POST' });
                // Clear master password session data from sessionStorage
                sessionStorage.removeItem('vishnu_admin_session');
                sessionStorage.removeItem('vishnu_admin_master');
                setUser(null);
                setUserClaims(null);
                setUserProfile(null);
                setEffectiveRole(null);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [fetchUserProfile]);

    useEffect(() => {
        if (userProfile?.theme) {
            setTheme(userProfile.theme);
        }
    }, [userProfile?.theme, setTheme]);

    const googleSignIn = useCallback(async (): Promise<UserCredential | void> => {
        const googleProvider = new GoogleAuthProvider();
        try {
            const userCredential = await signInWithPopup(auth, googleProvider);
            return userCredential;
        } catch (error) {
            console.error("AuthContext: Error during Google Sign-In:", error);
            throw error;
        }
    }, []);

    const logOut = useCallback(async (): Promise<void> => {
        try {
            // Clear master password session data from sessionStorage before Firebase logout
            sessionStorage.removeItem('vishnu_admin_session');
            sessionStorage.removeItem('vishnu_admin_master');
            await signOut(auth);
        } catch (error) {
            console.error("AuthContext: Error signing out:", error);
        }
    }, []);

    const updateUserProfileInContext = useCallback(async (uid: string, dataToUpdate: Partial<UserProfile>): Promise<boolean> => {
        if (!uid) {
            console.error("AuthContext: Cannot update profile, UID is missing.");
            return false;
        }
        const userDocRef = doc(db, "users", uid);
        try {
            await updateDoc(userDocRef, dataToUpdate);
            const updatedProfile = { ...(userProfile || {}), ...dataToUpdate } as UserProfile;
            setUserProfile(updatedProfile);
            console.log("AuthContext: User profile updated in Firestore and context", updatedProfile);
            return true;
        } catch (error: any) {
            if (error.code === 'not-found') {
                console.log("AuthContext: Document not found for update, attempting to create.", uid);
                try {
                    const createData: UserProfile = {
                        ...dataToUpdate,
                        uid: uid,
                        createdAt: new Date().toISOString()
                    };
                    await setDoc(userDocRef, createData);
                    const newProfile = { ...(userProfile || {}), ...createData } as UserProfile;
                    setUserProfile(newProfile);
                    console.log("AuthContext: User profile created in Firestore and context", newProfile);
                    return true;
                } catch (setCatchError) {
                    console.error("AuthContext: Error creating user profile after 'not-found' error:", setCatchError);
                    return false;
                }
            } else {
                console.error("AuthContext: Error updating user profile (not 'not-found'):", error);
                return false;
            }
        }
    }, [userProfile]);

    const refreshAuthUser = useCallback(async (): Promise<void> => {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
            try {
                const idTokenResult = await firebaseUser.getIdTokenResult();
                setUser({ ...firebaseUser } as User);
                setUserClaims(idTokenResult.claims);
                await fetchUserProfile(firebaseUser.uid);
                await resolveEffectiveRole(idTokenResult.claims);
                console.log("AuthContext: User and profile refreshed", firebaseUser);
            } catch (error) {
                console.error("AuthContext: Error refreshing user claims/profile during manual refresh:", error);
                setUser({ ...firebaseUser } as User);
                setUserClaims(null);
                setUserProfile(null);
                setEffectiveRole(null);
            }
        } else {
            setUser(null);
            setUserClaims(null);
            setUserProfile(null);
            setEffectiveRole(null);
        }
    }, [fetchUserProfile, resolveEffectiveRole]);

    const forceRefreshUser = useCallback(async (): Promise<void> => {
        const firebaseUser = auth.currentUser;
        if (firebaseUser) {
            try {
                const idTokenResult = await firebaseUser.getIdTokenResult(true); // Force refresh
                setUser({ ...firebaseUser } as User);
                setUserClaims(idTokenResult.claims);
                await fetchUserProfile(firebaseUser.uid);
                await resolveEffectiveRole(idTokenResult.claims);
                console.log("AuthContext: User and profile force refreshed", firebaseUser);
            } catch (error) {
                console.error("AuthContext: Error force refreshing user claims/profile:", error);
                setEffectiveRole(null);
            }
        }
    }, [fetchUserProfile, resolveEffectiveRole]);

    // Token cache to prevent concurrent force-refresh races
    const tokenCacheRef = useRef<{ token: string; timestamp: number } | null>(null);
    const TOKEN_CACHE_TTL = 5000; // 5 seconds

    const getIDToken = useCallback(async (): Promise<string | null> => {
        if (auth.currentUser) {
            const now = Date.now();
            if (tokenCacheRef.current && (now - tokenCacheRef.current.timestamp) < TOKEN_CACHE_TTL) {
                return tokenCacheRef.current.token;
            }
            const token = await auth.currentUser.getIdToken(true);
            tokenCacheRef.current = { token, timestamp: now };
            return token;
        }
        return null;
    }, []);

    const value = useMemo(() => ({
        user,
        userProfile,
        userClaims,
        effectiveRole,
        loading,
        theme,
        changeTheme,
        googleSignIn,
        logOut,
        refreshAuthUser,
        updateUserProfileInContext,
        forceRefreshUser,
        getIDToken,
    }), [user, userProfile, userClaims, effectiveRole, loading, theme, changeTheme, googleSignIn, logOut, refreshAuthUser, updateUserProfileInContext, forceRefreshUser, getIDToken]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function UserAuth(): AuthContextType {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('UserAuth must be used within an AuthContextProvider');
    }
    return context;
}
