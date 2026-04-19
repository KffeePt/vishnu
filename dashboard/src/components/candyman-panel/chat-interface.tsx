"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Send } from 'lucide-react';
import { db } from '@/config/firebase';
import { collection, query, where, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc } from 'firebase/firestore';
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
    WrappedPrivateKey,
    unwrapPrivateKey,
    envelopeDecrypt,
    envelopeEncrypt,
    EnvelopeEncryptedPayload
} from '@/lib/crypto-client';

function safeTimestamp(ts: any): Date | null {
    if (!ts) return null;
    if (typeof ts.toDate === 'function') return ts.toDate();
    if (ts instanceof Date) return ts;
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    return null;
}

interface ChatInterfaceProps {
    masterPassword: string;
    encryptedPrivateKey: WrappedPrivateKey;
}

interface ChatMessage {
    id: string;
    senderId: string;
    senderRole: 'staff' | 'admin' | 'owner';
    senderName: string;
    text: string; // Decrypted text
    timestamp: Date | null;
}

export default function ChatInterface({ masterPassword, encryptedPrivateKey }: ChatInterfaceProps) {
    const { user, getIDToken } = UserAuth();
    const { toast } = useToast();

    // Crypto state
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [staffPubKey, setStaffPubKey] = useState<string | null>(null);
    const [adminKeysInfo, setAdminKeysInfo] = useState<{ uid: string, publicKey: string }[] | null>(null);
    const [isCryptoReady, setIsCryptoReady] = useState(false);

    // Chat state
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Initialize Cryptography
    useEffect(() => {
        let isMounted = true;
        const initCrypto = async () => {
            if (!user) return;
            try {
                // 1. Unwrap private key
                const unwrapped = await unwrapPrivateKey(encryptedPrivateKey, masterPassword);
                if (!isMounted) return;
                setPrivateKey(unwrapped);

                // 2. Fetch staff's own public key
                const publicDoc = await getDoc(doc(db, 'public', user.uid));
                if (publicDoc.exists() && publicDoc.data().publicKey) {
                    setStaffPubKey(publicDoc.data().publicKey);
                } else {
                    throw new Error("Could not find your public key.");
                }

                // 3. Fetch admin's public key
                const token = await getIDToken();
                const adminKeyRes = await fetch('/api/staff/admin-key', {
                    headers: { 'Authorization': `Bearer ${token}` },
                    cache: 'no-store'
                });

                if (adminKeyRes.ok) {
                    const adminKeyData = await adminKeyRes.json();
                    if (adminKeyData.keys) setAdminKeysInfo(adminKeyData.keys);
                    else if (adminKeyData.publicKey) setAdminKeysInfo([{ uid: 'legacy', publicKey: adminKeyData.publicKey }]);
                } else {
                    console.warn("Could not fetch admin public key. E2E chat might fail.");
                }

                setIsCryptoReady(true);
            } catch (error) {
                console.error("Failed to initialize chat crypto:", error);
                toast({ title: "Error de Encriptación", description: "Error al cargar las llaves de chat.", variant: "destructive" });
            }
        };

        initCrypto();
        return () => { isMounted = false; };
    }, [user, encryptedPrivateKey, masterPassword, getIDToken, toast]);

    // Listen to messages
    useEffect(() => {
        if (!user || !isCryptoReady || !privateKey) return;

        const q = query(
            collection(db, 'messages'),
            where('threadId', '==', user.uid),
            orderBy('timestamp', 'asc')
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            const newMessages: ChatMessage[] = [];

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                try {
                    // Envelope payload
                    const payload: EnvelopeEncryptedPayload = {
                        encryptedData: data.encryptedData,
                        iv: data.iv,
                        staffWrappedDEK: data.staffWrappedDEK,
                        adminWrappedDEK: data.adminWrappedDEK,
                        encryptionVersion: data.encryptionVersion || 2
                    };

                    // Staff always uses staffWrappedDEK to decrypt since the sender wrapped it for the staff
                    const decryptedText = await envelopeDecrypt(payload, data.staffWrappedDEK, privateKey);

                    newMessages.push({
                        id: docSnap.id,
                        senderId: data.senderId,
                        senderRole: data.senderRole,
                        senderName: data.senderName,
                        text: decryptedText,
                        timestamp: safeTimestamp(data.timestamp) || new Date()
                    });
                } catch (err: any) {
                    console.warn("[Chat] Skipping legacy/corrupted message due to decryption failure (expected if keys reset):", err.name || err.message);
                    newMessages.push({
                        id: docSnap.id,
                        senderId: data.senderId,
                        senderRole: data.senderRole,
                        senderName: data.senderName,
                        text: "🔒 [Desencriptación Fallida - Llave Incorrecta]",
                        timestamp: safeTimestamp(data.timestamp) || new Date()
                    });
                }
            }
            setMessages(newMessages);
            scrollToBottom();
        });

        return () => unsubscribe();
    }, [user, isCryptoReady, privateKey]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !isCryptoReady || !staffPubKey || !adminKeysInfo) return;

        const msgText = newMessage.trim();
        setNewMessage("");
        setIsSending(true);

        try {
            // Envelope encrypt for ALL admins
            const payload = await envelopeEncrypt(msgText, staffPubKey, adminKeysInfo);

            await addDoc(collection(db, 'messages'), {
                threadId: user.uid,
                senderId: user.uid,
                senderRole: 'staff',
                senderName: user.displayName || user.email || 'Staff Member',
                ...payload,
                timestamp: serverTimestamp()
            });
            scrollToBottom();
        } catch (error) {
            console.error("Failed to send message:", error);
            toast({ title: "Error", description: "Error al enviar el mensaje encriptado.", variant: "destructive" });
            setNewMessage(msgText); // Restore on fail
        } finally {
            setIsSending(false);
        }
    };

    if (!isCryptoReady) {
        return (
            <Card className="h-full flex items-center justify-center p-8">
                <div className="flex flex-col items-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-muted-foreground font-mono text-sm">Inicializando Encriptación E2E...</p>
                </div>
            </Card>
        );
    }

    if (!adminKeysInfo || adminKeysInfo.length === 0) {
        return (
            <Card className="h-full flex items-center justify-center p-8">
                <div className="flex flex-col items-center space-y-4 text-center">
                    <p className="text-destructive font-semibold">Faltan Llaves E2E del Administrador</p>
                    <p className="text-muted-foreground text-sm">No puedes mensajear de forma segura al administrador porque no ha configurado sus llaves de encriptación.</p>
                </div>
            </Card>
        );
    }

    return (
        <Card className="flex flex-col h-[600px] border-none shadow-none md:border md:shadow-sm">
            <CardHeader className="border-b bg-muted/20 py-4">
                <CardTitle className="text-lg flex items-center">
                    <span className="font-semibold">Enlace Seguro de Comunicación</span>
                    <span className="ml-3 px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs font-mono font-medium flex items-center">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                        Encriptado E2E
                    </span>
                </CardTitle>
            </CardHeader>
            <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-muted-foreground text-sm font-mono text-center">
                            Canal de comunicación establecido.<br />Los mensajes están encriptados de extremo a extremo.
                        </p>
                    </div>
                ) : (
                    messages.map((msg) => {
                        // Simulate 2-person chat even if using the same account
                        const isMe = msg.senderRole === 'staff';
                        return (
                            <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                                <span className="text-[10px] text-muted-foreground mb-1 ml-1">
                                    {isMe ? 'Tú' : msg.senderName}
                                </span>
                                <div
                                    className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isMe
                                        ? 'bg-primary text-primary-foreground rounded-tr-sm'
                                        : 'bg-muted rounded-tl-sm'
                                        }`}
                                >
                                    {msg.text}
                                </div>
                                <span className="text-[10px] text-muted-foreground mt-1 mr-1">
                                    {msg.timestamp ? msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                                </span>
                            </div>
                        );
                    })
                )}
                <div ref={messagesEndRef} />
            </CardContent>
            <div className="p-4 bg-background border-t mt-auto">
                <form onSubmit={handleSendMessage} className="flex gap-2">
                    <Input
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        placeholder="Escribe un mensaje encriptado..."
                        disabled={isSending}
                        className="flex-1"
                    />
                    <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()}>
                        {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                </form>
            </div>
        </Card>
    );
}
