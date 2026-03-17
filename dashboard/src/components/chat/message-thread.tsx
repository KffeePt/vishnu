"use client";
import { format } from "date-fns";
import { User, Paperclip, CheckCheck } from "lucide-react";
type TimestampLike = { toDate: () => Date };

export interface Message {
  id: string;
  senderId: string;
  senderRole: "client" | "staff" | "admin" | "maintainer";
  text: string;
  attachments?: string[]; // URLs
  timestamp: Date | TimestampLike;
  readBy: string[];
}

export function MessageThread({ messages, currentUserId }: { messages: Message[], currentUserId: string }) {
  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-zinc-500">
        <div className="h-12 w-12 bg-white/5 rounded-full flex items-center justify-center mb-4">
          <User className="h-6 w-6 opacity-50" />
        </div>
        <p>No messages yet.</p>
        <p className="text-sm">Start the conversation below.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {messages.map((msg, idx) => {
        const isMe = msg.senderId === currentUserId;
        const timeStr = msg.timestamp instanceof Date
          ? format(msg.timestamp, "h:mm a")
          : msg.timestamp?.toDate
            ? format(msg.timestamp.toDate(), "h:mm a")
            : "";

        return (
          <div key={msg.id || idx} className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
            <div className="flex items-end gap-2 max-w-[80%]">
              {!isMe && (
                <div className="h-8 w-8 rounded-full bg-indigo-500/20 flex flex-shrink-0 items-center justify-center mb-1">
                  <span className="text-xs font-medium text-indigo-400">
                    {msg.senderRole === "client" ? "C" : "V"}
                  </span>
                </div>
              )}
              
              <div 
                className={`p-4 rounded-2xl ${
                  isMe 
                    ? "bg-indigo-600 text-white rounded-br-sm" 
                    : "bg-zinc-800 text-zinc-100 rounded-bl-sm border border-white/5"
                }`}
              >
                {msg.text && (
                  <p className="whitespace-pre-wrap leading-relaxed select-text">{msg.text}</p>
                )}

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className={`flex flex-wrap gap-2 ${msg.text ? "mt-3 pt-3 border-t border-white/10" : ""}`}>
                    {msg.attachments.map((url, aId) => (
                      <a 
                        key={aId} 
                        href={url} 
                        target="_blank" 
                        rel="noreferrer"
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm ${
                          isMe ? "bg-black/20 hover:bg-black/30" : "bg-white/5 hover:bg-white/10"
                        } transition-colors`}
                      >
                        <Paperclip className="h-4 w-4" />
                        Attachment {aId + 1}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className={`flex items-center gap-1.5 mt-1 text-[11px] text-zinc-500 ${isMe ? "mr-1" : "ml-11"}`}>
              <span>{timeStr}</span>
              {isMe && (
                <CheckCheck className={`h-3.5 w-3.5 ${msg.readBy.length > 1 ? "text-indigo-400 opacity-100" : "opacity-40"}`} />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
