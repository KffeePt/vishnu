import { useState, useEffect } from 'react';
import { UserAuth } from '@/context/auth-context';
import { rtdb } from '@/config/firebase';
import { ref as rtdbRef, onValue, onDisconnect, set, serverTimestamp, get, remove, runTransaction } from 'firebase/database';

export function useTabPresence() {
    const { user } = UserAuth();
    const [activeTabCount, setActiveTabCount] = useState<number>(0);
    const [isTabAllowed, setIsTabAllowed] = useState<boolean>(true);
    const [tabId] = useState(() => {
        if (typeof crypto !== 'undefined' && crypto.randomUUID) {
            return crypto.randomUUID();
        }
        return Math.random().toString(36).substring(2, 15);
    });

    useEffect(() => {
        if (!user) return;

        const connectedRef = rtdbRef(rtdb, '.info/connected');
        const myTabRef = rtdbRef(rtdb, `presence/${user.uid}/tabs/${tabId}`);
        const userTabsRef = rtdbRef(rtdb, `presence/${user.uid}/tabs`);

        // Listen for all tabs for this user
        const unsubUserTabs = onValue(userTabsRef, (snap) => {
            if (snap.exists()) {
                const tabs = snap.val();
                const count = Object.keys(tabs).length;
                setActiveTabCount(count);
            } else {
                setActiveTabCount(0);
            }
        });

        // Handle connection events
        const unsubConnected = onValue(connectedRef, async (snap) => {
            if (snap.val() === true) {
                // Pre-check count to enforce limit
                const currentTabsSnap = await get(userTabsRef);
                const currentTabs = currentTabsSnap.exists() ? currentTabsSnap.val() : {};
                const count = Object.keys(currentTabs).length;

                // Check tab ID in case it already exists (reconnect), otherwise enforce limit
                if (!currentTabs[tabId] && count >= 3) {
                    setIsTabAllowed(false);
                    return; // Don't write presence, and signal UI to block
                }

                setIsTabAllowed(true);

                // Set up onDisconnect cleanup
                await onDisconnect(myTabRef).remove();

                // Write our presence
                await set(myTabRef, {
                    connectedAt: serverTimestamp(),
                    lastActive: serverTimestamp(),
                    userAgent: navigator.userAgent
                });
            }
        });

        // Periodic ping to show tab is still alive acts as a fallback for unclean disconnects
        const pingInterval = setInterval(() => {
            if (user && isTabAllowed) {
                set(rtdbRef(rtdb, `presence/${user.uid}/tabs/${tabId}/lastActive`), serverTimestamp()).catch(() => { });
            }
        }, 60000);

        return () => {
            unsubUserTabs();
            unsubConnected();
            clearInterval(pingInterval);

            // Clean up our node when unmounting tab
            if (user && isTabAllowed) {
                remove(myTabRef).catch(() => { });
                onDisconnect(myTabRef).cancel();
            }
        };
    }, [user, tabId, isTabAllowed]);

    // Function to acquire passkey lock atomically across tabs
    const acquirePasskeyLock = async (force: boolean = false): Promise<boolean> => {
        if (!user) return false;

        const lockRef = rtdbRef(rtdb, `presence/${user.uid}/passkey_lock`);

        try {
            let wasStolenOrEmpty = false;
            const result = await runTransaction(lockRef, (currentData) => {
                const now = Date.now();
                // If it's forced, or no lock, or lock is stale (older than 60 seconds)
                if (force || currentData === null || (now - currentData.timestamp > 60000)) {
                    wasStolenOrEmpty = true;
                    return { tabId, timestamp: Date.now() }; // Use local now for math, not serverTimestamp
                } else {
                    return undefined; // Abort transaction - lock is held by another tab
                }
            });

            if (result.committed) {
                // Attach an onDisconnect so if this tab crashes/closes mid-prompt, the lock is freed universally!
                onDisconnect(lockRef).remove().catch(() => { });
            }

            return result.committed;
        } catch (e) {
            console.error("Failed to acquire passkey lock:", e);
            return false;
        }
    };

    // Function to release passkey lock
    const releasePasskeyLock = async () => {
        if (!user) return;

        const lockRef = rtdbRef(rtdb, `presence/${user.uid}/passkey_lock`);

        try {
            // Only release if we hold it
            const snap = await get(lockRef);
            if (snap.exists() && snap.val().tabId === tabId) {
                await remove(lockRef);
                onDisconnect(lockRef).cancel().catch(() => { });
            }
        } catch (e) {
            console.error("Failed to release passkey lock:", e);
        }
    };

    return { activeTabCount, isTabAllowed, acquirePasskeyLock, releasePasskeyLock, tabId };
}
