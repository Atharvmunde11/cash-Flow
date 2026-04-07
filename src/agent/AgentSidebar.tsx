"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Send, X } from "lucide-react";
import {
  AgentMessageBubble,
  UserMessageBubble,
} from "@/agent/AgentMessageBubble";
import {
  dummyConversation,
  type DummyConversationItem,
  type AgentResponse,
} from "@/agent/dummyResponses";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function AgentSidebar({
  isOpen,
  setIsOpen,
}: {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
}) {
  const [conversation, setConversation] = useState<DummyConversationItem[]>([]);
  const [inputValue, setInputValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  // 🎤 recording state
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null); // ✅ NEW

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [conversation, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, setIsOpen]);

  // ✅ Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const handleConfirm = (id: string) => {
    setConversation((current) =>
      current.map((item) => {
        if (item.role !== "agent" || item.response.id !== id) return item;

        const nextResponse: AgentResponse = {
          ...item.response,
          status: "done",
          requiresConfirm: false,
          message: "Bill INV-2026-000012 created for Nilesh Munde.",
        };

        return { ...item, response: nextResponse };
      }),
    );
  };

  const handleCancel = (id: string) => {
    setConversation((current) =>
      current.filter(
        (item) => item.role !== "agent" || item.response.id !== id,
      ),
    );
  };

  const handleSendMessage = () => {
    setInputValue("");
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  // 🎤 mic handler (FIXED)
  const handleMicClick = async () => {
    if (!recording) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream; // ✅ store stream

      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        setIsTranscribing(true); // ✅ start loading

        try {
          const blob = new Blob(chunksRef.current, { type: "audio/webm" });
          const file = new File([blob], "audio.webm");

          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData,
          });

          const data = await res.json();

          setInputValue((prev) => (prev ? prev + " " : "") + data.text);
        } finally {
          setIsTranscribing(false); // ✅ stop loading
        }
      };

      mediaRecorder.start();
      setRecording(true);
    } else {
      mediaRecorderRef.current?.stop();

      // ✅ CRITICAL FIX: stop mic
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;

      setRecording(false);
    }
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-50 transition-all duration-200",
        isOpen
          ? "pointer-events-auto opacity-100"
          : "pointer-events-none opacity-0",
      )}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={() => setIsOpen(false)}
      />

      <div className="relative flex h-full items-center justify-center p-3 md:p-6">
        <div
          className="flex h-[98vh] w-[90vw] min-w-0 flex-col overflow-hidden rounded-2xl border border-border/70 bg-background shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="shrink-0 flex items-center justify-between border-b border-border/70 px-5 py-4 md:px-6">
            <div>
              <div className="text-sm font-semibold">Agent Assistant</div>
              <div className="text-xs text-muted-foreground">
                Simple bill preview
              </div>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="h-9 w-9 rounded-xl"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="agent-scrollbar min-h-0 flex-1 bg-background">
            <div className="mx-auto flex w-full max-w-3xl flex-col space-y-4 px-4 py-5 md:px-6 md:py-6">
              {conversation.length === 0 ? (
                <div className="flex h-[60vh] flex-col items-center justify-center text-center px-6">
                  {/* Icon */}
                  <div className="mb-4 rounded-2xl bg-muted p-4 shadow-sm">
                    <Send className="w-6 h-6 opacity-60" />
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-semibold mb-1">
                    No conversations yet
                  </h3>

                  {/* Description */}
                  <p className="text-xs text-muted-foreground max-w-xs">
                    Start by typing a message or use the microphone to talk.
                  </p>
                </div>
              ) : (
                conversation.map((item) =>
                  item.role === "user" ? (
                    <UserMessageBubble key={item.id} message={item.message} />
                  ) : (
                    <AgentMessageBubble
                      key={item.id}
                      response={item.response}
                      onConfirm={handleConfirm}
                      onCancel={handleCancel}
                    />
                  ),
                )
              )}
              <div ref={bottomRef} />
            </div>
          </ScrollArea>

          <div className="shrink-0 border-t border-border/70 bg-background px-4 py-4 md:px-6">
            <div className="mx-auto w-full md:w-[65%]">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Textarea
                    ref={textareaRef}
                    placeholder={
                      isTranscribing ? "Transcribing..." : " Ask something..."
                    }
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="min-h-[40px] max-h-[120px] resize-none overflow-hidden"
                    rows={1}
                  />
                </div>

                <Button
                  size="icon"
                  variant="outline"
                  className="h-10 w-10 rounded-xl"
                  type="button"
                  onClick={handleMicClick}
                  disabled={isTranscribing} // ✅
                >
                  <Mic
                    className={`w-4 h-4 ${recording ? "text-red-500" : ""}`}
                  />
                </Button>

                <Button
                  onClick={handleSendMessage}
                  disabled={!inputValue.trim()}
                  size="icon"
                  className="h-10 w-10 rounded-xl"
                  type="button"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>

              <p className="mt-3 text-center text-xs text-muted-foreground">
                Press Enter to send, Shift+Enter for new line
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
