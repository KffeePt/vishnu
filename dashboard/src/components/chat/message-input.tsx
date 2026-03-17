"use client";

import { useState, useRef } from "react";
import { Send, Paperclip, X, Image as ImageIcon } from "lucide-react";

interface MessageInputProps {
  onSendMessage: (text: string, files: File[]) => Promise<void>;
  disabled?: boolean;
}

export function MessageInput({ onSendMessage, disabled }: MessageInputProps) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(prev => [...prev, ...Array.from(e.target.files as FileList)]);
    }
    // Reset file input
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!text.trim() && files.length === 0) || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSendMessage(text.trim(), files);
      setText("");
      setFiles([]);
    } catch (err) {
      console.error("Failed to send", err);
      alert("Failed to send message. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="p-4 bg-zinc-900 border-t border-white/10">
      {/* File preview area */}
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {files.map((file, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-zinc-800 border border-white/10 rounded-md px-3 py-1.5 text-xs text-zinc-300">
              <ImageIcon className="h-3.5 w-3.5 text-zinc-500" />
              <span className="truncate max-w-[150px]">{file.name}</span>
              <button 
                onClick={() => removeFile(idx)}
                className="ml-1 p-0.5 hover:bg-white/10 rounded-full transition-colors text-zinc-400 hover:text-zinc-200"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input area */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2">
        <div className="flex-1 bg-black/20 border border-white/10 rounded-xl flex items-end p-1 focus-within:ring-1 focus-within:ring-indigo-500/50 focus-within:border-indigo-500/50 transition-all">
          <button
            type="button"
            className="p-2.5 text-zinc-400 hover:text-zinc-200 rounded-lg hover:bg-white/5 transition-colors flex-shrink-0"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isSending}
          >
            <Paperclip className="h-5 w-5" />
          </button>
          
          <input
            type="file"
            multiple
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileSelect}
          />
          
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={disabled || isSending}
            placeholder="Type your message..."
            className="flex-1 bg-transparent text-sm text-zinc-100 placeholder:text-zinc-600 border-0 focus:ring-0 resize-none min-h-[44px] max-h-32 py-3 px-2"
            rows={1}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSubmit();
              }
            }}
          />
        </div>

        <button
          type="submit"
          disabled={(!text.trim() && files.length === 0) || disabled || isSending}
          className="h-[46px] w-[46px] flex items-center justify-center rounded-xl bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 disabled:hover:bg-indigo-600 flex-shrink-0 transition-colors shadow-lg shadow-indigo-900/20"
        >
          {isSending ? (
            <div className="h-4 w-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
          ) : (
            <Send className="h-5 w-5 ml-0.5" />
          )}
        </button>
      </form>
    </div>
  );
}
