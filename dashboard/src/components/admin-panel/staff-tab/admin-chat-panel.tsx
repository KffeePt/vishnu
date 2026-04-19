"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Send, MessageSquare, ShieldAlert, User, Search, Trash2 } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { db } from '@/config/firebase';
import { collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, doc, getDoc, deleteDoc } from 'firebase/firestore';
import { UserAuth } from "@/context/auth-context";
import { useMasterPassword } from "@/hooks/use-master-password";
import { useToast } from "@/hooks/use-toast";
import {
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

interface ChatMessage {
    id: string;
    threadId: string;
    senderId: string;
    senderRole: 'staff' | 'admin' | 'owner';
    senderName: string;
    text: string;
    timestamp: Date | null;
}

interface ThreadInfo {
    threadId: string;
    staffName: string;
    lastMessageTimestamp: Date | null;
    messages: ChatMessage[];
}

export default function AdminChatPanel() {
    const { user } = UserAuth();
    const { authSession } = useMasterPassword();
    const { toast } = useToast();

    // Crypto state
    const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
    const [adminPubKey, setAdminPubKey] = useState<string | null>(null);
    const [isCryptoReady, setIsCryptoReady] = useState(false);
    const [cryptoError, setCryptoError] = useState<string | null>(null);

    // Chat state
    const [threads, setThreads] = useState<Record<string, ThreadInfo>>({});
    const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
    const [newMessage, setNewMessage] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [clearTarget, setClearTarget] = useState<'all' | 'single'>('single');
    const [searchQuery, setSearchQuery] = useState("");

    const activeThread = selectedThreadId ? threads[selectedThreadId] : null;

    // UI Refs
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Listen to clear chat triggers from FAB
    useEffect(() => {
        const handleTriggerClear = (e: Event) => {
            const customEvent = e as CustomEvent;
            setClearTarget(customEvent.detail?.clearAll ? 'all' : 'single');
            setShowClearConfirm(true);
        };
        window.addEventListener('trigger-clear-chat', handleTriggerClear);
        return () => window.removeEventListener('trigger-clear-chat', handleTriggerClear);
    }, []);

    // 1. Initialize Crypto (Load Admin's keys)
    useEffect(() => {
        let isMounted = true;

        const initCrypto = async () => {
            if (!user || !authSession?.masterPassword) return;

            try {
                // Fetch admin's encrypted private key and public key securely via API
                const token = await user.getIdToken();
                const keysRes = await fetch('/api/admin/keys', {
                    headers: { 'Authorization': `Bearer ${token}` }
                });

                if (!keysRes.ok) throw new Error("Failed to fetch admin encryption keys.");

                const keysData = await keysRes.json();

                if (!keysData.hasKeys || !keysData.encryptedPrivateKey || !keysData.publicKey) {
                    throw new Error("Missing encryption keys. Please complete the master password setup first.");
                }

                const encryptedPrivKey = keysData.encryptedPrivateKey;
                const pubKey = keysData.publicKey;

                const unwrapped = await unwrapPrivateKey(encryptedPrivKey, authSession.masterPassword);

                if (!isMounted) return;
                setPrivateKey(unwrapped);
                setAdminPubKey(pubKey);
                setIsCryptoReady(true);
            } catch (error: any) {
                console.error("Admin chat crypto init failed:", error);
                if (isMounted) setCryptoError(error.message || "Failed to initialize keys.");
            }
        };

        initCrypto();
        return () => { isMounted = false; };
    }, [user, authSession]);

    // 2. Listen to all messages
    useEffect(() => {
        if (!isCryptoReady || !privateKey || !user) return;

        const q = query(collection(db, 'messages'), orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            // Group messages by threadId
            const newThreads: Record<string, ThreadInfo> = {};

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                const threadId = data.threadId;

                let decryptedText = "🔒 [Desencriptación Fallida - Llave Incorrecta]";

                try {
                    const payload: EnvelopeEncryptedPayload = {
                        encryptedData: data.encryptedData,
                        iv: data.iv,
                        staffWrappedDEK: data.staffWrappedDEK,
                        adminWrappedDEK: data.adminWrappedDEK,
                        adminWrappedDEKs: data.adminWrappedDEKs,
                        encryptionVersion: data.encryptionVersion || 2
                    };

                    console.log(`[AdminChatPanel Debug] Msg ${docSnap.id}: adminWrappedDEK exists? ${!!data.adminWrappedDEK}, adminWrappedDEKs keys =`, data.adminWrappedDEKs ? Object.keys(data.adminWrappedDEKs) : 'NULL', 'My UID = ', user!.uid);

                    // Admin uses their specific wrapped DEK if the sender was kind enough to map it,
                    // otherwise fall back to the legacy scalar wrap.
                    const myWrappedDEK = (data.adminWrappedDEKs && data.adminWrappedDEKs[user!.uid])
                        ? data.adminWrappedDEKs[user!.uid]
                        : data.adminWrappedDEK;

                    if (!myWrappedDEK) {
                        throw new Error("No wrapped DEK found for this admin");
                    }

                    decryptedText = await envelopeDecrypt(payload, myWrappedDEK, privateKey);
                } catch (err: any) {
                    console.warn(`[Admin Chat] Skipping message ${docSnap.id} due to decryption failure (expected if keys reset or meant for another admin):`, err.name || err.message);
                }

                const msg: ChatMessage = {
                    id: docSnap.id,
                    threadId,
                    senderId: data.senderId,
                    senderRole: data.senderRole,
                    senderName: data.senderName,
                    text: decryptedText,
                    timestamp: safeTimestamp(data.timestamp) || new Date()
                };

                if (!newThreads[threadId]) {
                    // Try to extract a decent name for the thread
                    const staffName = data.senderRole === 'staff' ? data.senderName : 'Staff Member';
                    newThreads[threadId] = {
                        threadId,
                        staffName, // We update this if we see a message from the staff
                        lastMessageTimestamp: msg.timestamp,
                        messages: []
                    };
                }

                if (data.senderRole === 'staff') {
                    newThreads[threadId].staffName = data.senderName;
                }

                newThreads[threadId].messages.push(msg);
                newThreads[threadId].lastMessageTimestamp = msg.timestamp;
            }

            setThreads(newThreads);
            scrollToBottom();
        });

        return () => unsubscribe();
    }, [isCryptoReady, privateKey]);

    const threadedArray = Object.values(threads)
        .filter(t => t.staffName.toLowerCase().includes(searchQuery.toLowerCase()))
        .sort((a, b) => {
            const timeA = a.lastMessageTimestamp?.getTime() || 0;
            const timeB = b.lastMessageTimestamp?.getTime() || 0;
            return timeB - timeA;
        });

    // Auto-select most recent thread if none selected
    useEffect(() => {
        if (!selectedThreadId && threadedArray.length > 0 && !searchQuery) {
            setSelectedThreadId(threadedArray[0].threadId);
            scrollToBottom();
        }
    }, [threads, selectedThreadId, searchQuery]);

    const scrollToBottom = () => {
        setTimeout(() => {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    };

    const handleClearChat = async () => {
        setIsClearing(true);
        try {
            const token = await user?.getIdToken(); // Need token for regular fetch? Wait, API uses session cookie. We can just use fetch.

            // Wait, the API route uses session cookies via the `cookies()` helper.
            // But we should also send the id token just in case if the API expects it?
            // The API uses `verifyAdminPrivileges(sessionCookie)`. It doesn't check the Auth header.

            const payload = (clearTarget === 'single' && activeThread && selectedThreadId)
                ? { threadId: selectedThreadId }
                : {};

            const response = await fetch('/api/admin/data/clear-messages', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to clear messages on server');
            }

            toast({
                title: payload.threadId && activeThread ? "Chat Deleted" : "All Chats Cleared",
                description: payload.threadId && activeThread
                    ? `All messages with ${activeThread.staffName} have been securely deleted.`
                    : "All conversations have been securely deleted."
            });

            if (activeThread) {
                setSelectedThreadId(null);
            }
        } catch (error: any) {
            console.error("Failed to clear chat:", error);
            toast({ title: "Error", description: error.message || "Failed to clear chat messages.", variant: "destructive" });
        } finally {
            setIsClearing(false);
            setShowClearConfirm(false); // Close dialog!
        }
    };

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newMessage.trim() || !user || !isCryptoReady || !selectedThreadId || !adminPubKey) return;

        const msgText = newMessage.trim();
        setNewMessage("");
        setIsSending(true);

        try {
            // Fetch target staff's public key
            const staffPublicDoc = await getDoc(doc(db, 'public', selectedThreadId));
            if (!staffPublicDoc.exists() || !staffPublicDoc.data().publicKey) {
                throw new Error("The selected staff member has no encryption keys.");
            }
            const staffPubKey = staffPublicDoc.data().publicKey;

            // Envelope encrypt
            const payload = await envelopeEncrypt(msgText, staffPubKey, adminPubKey);

            const senderName = user.displayName || user.email || 'Admin';

            await addDoc(collection(db, 'messages'), {
                threadId: selectedThreadId, // The conversation context
                senderId: user.uid,
                senderRole: 'admin',
                senderName,
                ...payload,
                timestamp: serverTimestamp()
            });
            scrollToBottom();
        } catch (error: any) {
            console.error("Failed to send message:", error);
            toast({ title: "Error", description: error.message || "Failed to send encrypted message.", variant: "destructive" });
            setNewMessage(msgText); // Restore on fail
        } finally {
            setIsSending(false);
        }
    };

    if (cryptoError) {
        return (
            <Card className="border-destructive/50">
                <CardHeader>
                    <CardTitle className="text-destructive flex items-center">
                        <ShieldAlert className="mr-2 h-5 w-5" />
                        Key Generation Required
                    </CardTitle>
                    <CardDescription>E2E Messaging failed to initialize.</CardDescription>
                </CardHeader>
                <CardContent>
                    <p className="text-sm">{cryptoError}</p>
                    <p className="text-sm mt-4 text-muted-foreground">
                        To read or send encrypted messages, you must first log into the Candyman Panel and complete the First Time Security Setup to generate your RSA keys.
                    </p>
                </CardContent>
            </Card>
        );
    }

    if (!isCryptoReady) {
        return (
            <div className="flex h-[500px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <Card className="flex flex-col md:flex-row h-[calc(100vh-14rem)] min-h-[500px] overflow-hidden">
            {/* Thread List Sidebar */}
            <div className="w-full md:w-64 border-r bg-muted/10 flex flex-col shrink-0 flex-none">
                <div className="p-4 border-b bg-muted/20 space-y-3">
                    <h3 className="font-semibold flex items-center">
                        <MessageSquare className="w-4 h-4 mr-2" />
                        Conversations
                    </h3>
                    <div className="relative">
                        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="h-9 pl-8 bg-background"
                        />
                    </div>
                </div>
                {/* Scrollable list: horizontal on mobile, vertical on desktop */}
                <div className="flex flex-row md:flex-col overflow-x-auto overflow-y-hidden md:overflow-x-hidden md:overflow-y-auto snap-x md:snap-none md:flex-1 p-2 md:p-0 border-b md:border-b-0 min-h-[85px] md:min-h-0 hidden-scrollbar">
                    {threadedArray.length === 0 ? (
                        <div className="p-6 text-center text-sm text-muted-foreground w-full">
                            No conversations found.
                        </div>
                    ) : (
                        threadedArray.map((thread, index) => (
                            <button
                                key={`thread-${thread.threadId}-${index}`}
                                onClick={() => {
                                    setSelectedThreadId(thread.threadId);
                                    scrollToBottom();
                                }}
                                className={`flex-shrink-0 w-48 md:w-full p-3 md:p-4 text-left border rounded-md md:rounded-none md:border-0 md:border-b transition-colors hover:bg-muted/50 snap-center mr-2 md:mr-0 ${selectedThreadId === thread.threadId
                                    ? 'bg-primary/10 border-primary md:border-l-4 md:border-l-primary md:border-r-0'
                                    : 'border-border md:border-l-4 md:border-l-transparent md:border-transparent'
                                    }`}
                            >
                                <div className="font-medium flex items-center gap-2">
                                    <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                        <User className="h-3 w-3 text-primary" />
                                    </div>
                                    <span className="truncate">{thread.staffName}</span>
                                </div>
                                <div className="text-xs text-muted-foreground mt-1 truncate">
                                    {thread.messages[thread.messages.length - 1]?.text || 'No messages'}
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 flex flex-col bg-background min-w-0 min-h-0">
                {!activeThread ? (
                    <div className="flex-1 flex items-center justify-center text-muted-foreground flex-col gap-4">
                        <MessageSquare className="w-12 h-12 opacity-20" />
                        <p>Select a conversation to start messaging</p>
                    </div>
                ) : (
                    <>
                        {/* Chat Header */}
                        <div className="p-4 border-b flex items-center justify-between bg-card">
                            <h3 className="font-semibold">Chat with {activeThread.staffName}</h3>
                            <div className="flex items-center gap-3">
                                <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-xs font-mono font-medium flex-nowrap flex items-center">
                                    <span className="w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5"></span>
                                    E2E Encrypted
                                </span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive hover:bg-destructive/10 hover:text-destructive h-8 w-8"
                                    onClick={() => {
                                        setClearTarget('single');
                                        setShowClearConfirm(true);
                                    }}
                                    title="Delete Chat"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>

                        {/* Messages Area */}
                        <ScrollArea className="flex-1 p-4">
                            <div className="space-y-4">
                                {activeThread.messages.map((msg) => {
                                    const isAdmin = msg.senderRole === 'admin' || msg.senderRole === 'owner';
                                    return (
                                        <div key={msg.id} className={`flex flex-col ${isAdmin ? 'items-end' : 'items-start'}`}>
                                            <span className="text-[10px] text-muted-foreground mb-1 ml-1">
                                                {isAdmin ? 'You' : msg.senderName}
                                            </span>
                                            <div
                                                className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isAdmin
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
                                })}
                            </div>
                            <div ref={messagesEndRef} />
                        </ScrollArea>

                        {/* Input Area */}
                        <div className="p-4 border-t bg-card">
                            <form onSubmit={handleSendMessage} className="flex gap-2">
                                <Input
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    placeholder={`Message ${activeThread.staffName}...`}
                                    disabled={isSending}
                                    className="flex-1"
                                />
                                <Button type="submit" size="icon" disabled={isSending || !newMessage.trim()}>
                                    {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                                </Button>
                            </form>
                        </div>
                    </>
                )}
            </div>

            <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Clear {clearTarget === 'single' && activeThread ? 'Messages' : 'All Conversations'}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {clearTarget === 'single' && activeThread
                                ? `Are you sure you want to delete the chat with ${activeThread.staffName}? This action cannot be undone.`
                                : "Are you sure you want to clear ALL messages across ALL conversations? This action cannot be undone."}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isClearing}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleClearChat}
                            disabled={isClearing}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isClearing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Clear All Messages
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    );
}
