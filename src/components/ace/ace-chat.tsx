"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AceCharacter, type AceState } from "./ace-character";
import { PhotoTipsCard } from "./photo-tips-card";
import { useAceContext, suggestedPrompts } from "@/hooks/useAceContext";

const INTRO_KEY = "neargear:ace:intro_seen";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  showsPhotoTips?: boolean;
  pending?: boolean;
}

interface Props {
  onClose: () => void;
  onAceState: (state: AceState) => void;
  onUnread: (unread: boolean) => void;
}

const PHOTO_TRIGGERS = ["photo", "picture", "image", "lighting"];

function shouldShowPhotoTips(text: string): boolean {
  const lower = text.toLowerCase();
  return PHOTO_TRIGGERS.some((t) => lower.includes(t));
}

export function AceChat({ onClose, onAceState }: Props) {
  const ctx = useAceContext();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const prompts = useMemo(() => suggestedPrompts(ctx), [ctx]);

  useEffect(() => {
    let intro = false;
    try {
      intro = window.localStorage.getItem(INTRO_KEY) !== "1";
    } catch {}
    if (intro) {
      setMessages([
        {
          id: "intro",
          role: "assistant",
          content:
            "Hey! I'm Ace 👋\nI'm here to help you find the right gear, price your items, and make swapping easy. What can I help you with?",
        },
      ]);
      try {
        window.localStorage.setItem(INTRO_KEY, "1");
      } catch {}
    }
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    const userMsg: Message = {
      id: `u${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    const aceMsg: Message = {
      id: `a${Date.now()}`,
      role: "assistant",
      content: "",
      pending: true,
      showsPhotoTips:
        ctx.page === "sell" && shouldShowPhotoTips(text),
    };
    setMessages((prev) => [...prev, userMsg, aceMsg]);
    setInput("");
    setSending(true);
    setError("");
    onAceState("thinking");

    const history = messages
      .filter((m) => !m.pending)
      .map((m) => ({ role: m.role, content: m.content }));
    history.push({ role: "user", content: text.trim() });

    try {
      const res = await fetch("/api/ace/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          conversationHistory: history.slice(0, -1),
          context: ctx,
        }),
      });

      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }

      onAceState("responding");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const evt = JSON.parse(data);
            if (
              evt.type === "content_block_delta" &&
              evt.delta?.type === "text_delta" &&
              typeof evt.delta.text === "string"
            ) {
              acc += evt.delta.text;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === aceMsg.id
                    ? { ...m, content: acc, pending: true }
                    : m,
                ),
              );
            }
          } catch {
            // ignore non-JSON lines
          }
        }
      }

      setMessages((prev) =>
        prev.map((m) =>
          m.id === aceMsg.id ? { ...m, content: acc, pending: false } : m,
        ),
      );
      onAceState(/great deal|good price|fair/i.test(acc) ? "excited" : "idle");
      setTimeout(() => onAceState("idle"), 2000);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === aceMsg.id
            ? {
                ...m,
                content:
                  "Oops, I had trouble with that one. Try asking me again? 🙏",
                pending: false,
              }
            : m,
        ),
      );
      onAceState("alert");
      setTimeout(() => onAceState("idle"), 2000);
    } finally {
      setSending(false);
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/30"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-3xl shadow-2xl flex flex-col ace-drawer-enter h-[78vh]">
        <div className="flex items-center gap-3 px-4 py-3 border-b">
          <AceCharacter
            state={sending ? "thinking" : "idle"}
            size="sm"
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="font-heading font-bold text-navy leading-none">
              Ace
            </p>
            <p className="text-[11px] text-muted-foreground">NearGear AI</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Ace"
            className="p-2 rounded-full hover:bg-gray-100"
          >
            <X className="w-5 h-5 text-navy" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-orange text-white px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex gap-2">
                <div className="flex-shrink-0 mt-0.5">
                  <AceCharacter state="idle" size="sm" className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-muted-foreground font-semibold mb-0.5">
                    Ace
                  </p>
                  {m.content && (
                    <div className="max-w-[90%] rounded-2xl rounded-bl-md bg-gray-100 text-navy px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                      {m.content}
                      {m.pending && (
                        <span className="inline-block w-2 h-3 bg-orange animate-pulse align-middle ml-1" />
                      )}
                    </div>
                  )}
                  {!m.content && m.pending && (
                    <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mt-1">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Ace is thinking…
                    </div>
                  )}
                  {m.showsPhotoTips && !m.pending && <PhotoTipsCard />}
                </div>
              </div>
            ),
          )}

          {messages.length <= 1 && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground mb-2">
                Suggested
              </p>
              <div className="flex flex-wrap gap-2">
                {prompts.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => sendMessage(p)}
                    className="text-sm border border-orange/40 text-orange rounded-full px-3 py-1.5 hover:bg-orange/5"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">
              {error}
            </p>
          )}

          <div ref={bottomRef} />
        </div>

        <div className="border-t p-3 flex gap-2 items-end safe-bottom">
          <Input
            ref={inputRef}
            placeholder="Ask Ace anything…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage(input);
              }
            }}
            className="input-large flex-1"
          />
          <Button
            onClick={() => sendMessage(input)}
            disabled={!input.trim() || sending}
            className="btn-primary h-[52px] px-4"
          >
            {sending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>
      </div>
    </>
  );
}
