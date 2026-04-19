import { useState, useEffect, useRef } from 'react';
import { UserAuth } from '@/context/auth-context';
import { rtdb, db } from '@/config/firebase';
import { doc, onSnapshot } from 'firebase/firestore';
import { ref as rtdbRef, onChildAdded as rtdbOnChildAdded, onValue as rtdbOnValue, off as rtdbOff, remove as rtdbRemove } from 'firebase/database';
import { decryptSignal, verifyBroadcastSignal, DecryptedSignal } from '@/lib/sentinel-crypto-client';
import { Codebook } from '@/lib/sentinel-wordlist';

export interface UseSentinelOptions {
    onKeysReset?: (signal: DecryptedSignal) => void;
    onClaimsChanged?: (signal: DecryptedSignal) => void;
    onInventoryUpdated?: (signal: DecryptedSignal) => void;
    onSessionRevoked?: (signal: DecryptedSignal) => void;
    onSentinelRotated?: (signal: DecryptedSignal) => void;
    sentinelPrivateKey?: CryptoKey | null;
}

export function useSentinel(options: UseSentinelOptions) {
    const { user } = UserAuth();
    const [isConnected, setIsConnected] = useState(false);
    const [isSentinelSetup, setIsSentinelSetup] = useState(false);
    const [codebookVersion, setCodebookVersion] = useState(0);
    const [codebook, setCodebook] = useState<Codebook | null>(null);

    const privateKeyRef = useRef<CryptoKey | null>(null);
    useEffect(() => { privateKeyRef.current = options.sentinelPrivateKey || null; }, [options.sentinelPrivateKey]);

    const optionsRef = useRef(options);
    useEffect(() => { optionsRef.current = options; }, [options]);

    // Sync Codebook from Firestore
    useEffect(() => {
        if (!user) return;
        const cbRef = doc(db, 'sentinel', 'codebook');
        const unsub = onSnapshot(cbRef, (docSnap) => {
            if (docSnap.exists()) {
                setCodebook(docSnap.data() as Codebook);
            }
        });
        return () => unsub();
    }, [user]);

    useEffect(() => {
        if (!user || !codebook) return;

        // Track RTDB connection
        const connectedRef = rtdbRef(rtdb, '.info/connected');
        rtdbOnValue(connectedRef, (snap) => {
            setIsConnected(snap.val() === true);
        });

        // Track Codebook Version in RTDB to catch fast rotations
        const cbVersionRef = rtdbRef(rtdb, 'codebook/current');
        rtdbOnValue(cbVersionRef, (snap) => {
            if (snap.exists()) {
                setCodebookVersion(snap.val().version);
            }
        });

        // The unified presence and concurrency handling is deliberately deferred 
        // to `use-tab-presence.ts` to prevent race conditions and split-brain RTDB paths.
        // `use-sentinel.ts` solely concentrates on Crypto Signals and Codebook state.

        const handleDecryptedSignal = (signal: DecryptedSignal) => {
            const action = codebook.mapping[signal.codeWord];
            if (!action) return;

            const opts = optionsRef.current;
            switch (action) {
                case 'keysReset': opts.onKeysReset?.(signal); break;
                case 'claimsChanged': opts.onClaimsChanged?.(signal); break;
                case 'inventoryUpdated': opts.onInventoryUpdated?.(signal); break;
                case 'sessionRevoked': opts.onSessionRevoked?.(signal); break;
                case 'sentinelRotated': opts.onSentinelRotated?.(signal); break;
            }
        };

        const broadcastRef = rtdbRef(rtdb, 'signals/broadcast');
        const handleBroadcast = async (snap: any) => {
            const data = snap.val();
            if (!data) return;
            try {
                const decrypted = await verifyBroadcastSignal(data.payload, data.signature, data.codeWord, data.timestamp);
                if (decrypted) handleDecryptedSignal(decrypted);
            } catch (error) {
                console.error('Failed to verify broadcast:', error);
            }
        };

        const privateRef = rtdbRef(rtdb, `signals/${user.uid}`);
        const handlePrivateSignal = async (snap: any) => {
            const data = snap.val();
            const signalId = snap.key;
            if (!data || data.consumed || !privateKeyRef.current) return;

            try {
                const decrypted = await decryptSignal(
                    data.wrappedKey, data.iv, data.ciphertext,
                    privateKeyRef.current, data.codeWord, data.timestamp
                );

                handleDecryptedSignal(decrypted);

                if (signalId) {
                    await rtdbRemove(rtdbRef(rtdb, `signals/${user.uid}/${signalId}`));
                }
            } catch (error) {
                console.error('Failed to decrypt signal:', error);
            }
        };

        rtdbOnChildAdded(broadcastRef, handleBroadcast);
        const unsubscribePrivate = rtdbOnChildAdded(privateRef, handlePrivateSignal);

        return () => {
            rtdbOff(connectedRef);
            rtdbOff(cbVersionRef);
            rtdbOff(broadcastRef, 'child_added', handleBroadcast);
            rtdbOff(privateRef, 'child_added', handlePrivateSignal);
        };
    }, [user, codebook]);

    return {
        isConnected,
        isSentinelSetup,
        codebookVersion
    };
}
