"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/components/providers/auth-provider";
import { MessageThread } from "@/components/chat/message-thread";
import { MessageInput } from "@/components/chat/message-input";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare, AlertCircle } from "lucide-react";

// Mock data to replace with Firebase queries later
const mockThreads = [
  { id: "thread1", subject: "Help with my custom domain", status: "open", lastMessage: "Yes, please update the A records.", updatedAt: new Date(), unreadCountClient: 1 },
  { id: "thread2", subject: "Question about analytics", status: "answered", lastMessage: "The dashboard syncs every 24h.", updatedAt: new Date(Date.now() - 86400000), unreadCountClient: 0 },
];

export default function ClientSupportPage() {
  const { user } = useAuth();
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [newSubject, setNewSubject] = useState("");

  const activeThread = mockThreads.find(t => t.id === activeThreadId);

  const handleSendMessage = async (text: string, files: File[]) => {
    // Calling Cloud Function or Firestore directly
    console.log("Sending to thread", activeThreadId, text, files);
    return Promise.resolve();
  };

  const handleCreateThread = async () => {
    if (!newSubject.trim()) return;
    console.log("Creating thread", newSubject);
    setIsCreating(false);
    setNewSubject("");
    // After creation, set activeThreadId to the new ID
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Sidebar: Thread List */}
      <div className="w-80 flex-shrink-0 border-r border-white/10 bg-zinc-950 flex flex-col">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-zinc-100 flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-indigo-400" />
            Support Tickets
          </h2>
          <Button variant="ghost" size="icon-sm" onClick={() => setIsCreating(true)} className="h-8 w-8 rounded-full bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {mockThreads.map(thread => (
            <button
              key={thread.id}
              onClick={() => { setActiveThreadId(thread.id); setIsCreating(false); }}
              className={`w-full flex flex-col p-3 rounded-xl text-left transition-colors ${
                activeThreadId === thread.id ? "bg-indigo-500/10 border-indigo-500/30" : "hover:bg-white/5 border-transparent"
              } border`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-sm text-zinc-200 truncate pr-2">{thread.subject}</span>
                {thread.unreadCountClient > 0 && (
                  <span className="h-4 min-w-[16px] px-1 rounded-full bg-indigo-500 flex items-center justify-center text-[10px] font-bold text-white">
                    {thread.unreadCountClient}
                  </span>
                )}
              </div>
              <div className="text-xs text-zinc-500 truncate">{thread.lastMessage}</div>
              <div className="mt-2 flex justify-between items-center text-[10px]">
                <span className={`px-2 py-0.5 rounded-full capitalize ${
                  thread.status === 'open' ? 'bg-emerald-500/10 text-emerald-400' :
                  thread.status === 'answered' ? 'bg-amber-500/10 text-amber-400' : 'bg-zinc-800 text-zinc-400'
                }`}>
                  {thread.status}
                </span>
                <span className="text-zinc-600">
                  {thread.updatedAt.toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-zinc-950 flex flex-col relative w-full h-full">
        {isCreating ? (
          <div className="flex-1 p-8 flex flex-col max-w-2xl mx-auto w-full">
            <h3 className="text-2xl font-bold text-zinc-100 mb-6">Open New Ticket</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-400 mb-2">Issue Subject</label>
                <input 
                  type="text" 
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="e.g., Question about my invoice..." 
                  className="w-full bg-black/20 border border-white/10 rounded-lg p-3 text-zinc-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-colors"
                />
              </div>
              <Button onClick={handleCreateThread} className="bg-indigo-600 hover:bg-indigo-500 text-white">
                Create & Continue
              </Button>
            </div>
          </div>
        ) : activeThreadId ? (
          <>
            {/* Thread Header */}
            <div className="h-16 px-6 border-b border-white/10 flex items-center justify-between bg-zinc-900/50 flex-shrink-0">
              <h3 className="font-semibold text-zinc-100 truncate">{activeThread?.subject}</h3>
              <span className="text-xs text-zinc-500">Ticket ID: {activeThread?.id}</span>
            </div>
            
            {/* Chat Area */}
            <MessageThread 
              messages={[
                { id: "1", senderId: user?.uid || "client1", senderRole: "client", text: "Hi, I need help updating my MX records.", timestamp: new Date(Date.now() - 3600000), readBy: ["admin"] },
                { id: "2", senderId: "admin", senderRole: "staff", text: "Hello! Please send a screenshot of your current GoDaddy DNS settings.", timestamp: new Date(), readBy: [] },
              ]} 
              currentUserId={user?.uid || ""} 
            />
            
            {/* Input Area */}
            <MessageInput onSendMessage={handleSendMessage} />
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500 relative h-full">
            <MessageSquare className="h-12 w-12 opacity-20 mb-4" />
            <p className="text-lg font-medium text-zinc-400">Select a support ticket</p>
            <p className="text-sm mt-1">Or create a new one to chat with our team.</p>
          </div>
        )}
      </div>
    </div>
  );
}
