"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Loader2, LogIn, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { AceCharacter, type AceState } from "./ace-character";
import { PhotoTipsCard } from "./photo-tips-card";
import { useAceContext, suggestedPrompts } from "@/hooks/useAceContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  showsPhotoTips?: boolean;
  showsSignIn?: boolean;
  pending?: boolean;
}

type LimitState = null | "user_hour" | "daily";

const SIGN_IN_PROMPT =
  "Hey! Sign in to chat with me — I can give you personalized help once I know who you are 😊";

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

/**
 * Bottom-drawer chat with its own backdrop. Slides up from the bottom
 * when ace-floating opens it and renders a small Ace avatar + state
 * indicator in the header.
 */
export function AceChat({ onClose, onAceState }: Props) {
  const ctx = useAceContext();
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [limitState, setLimitState] = useState<LimitState>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (alive) setSignedIn(!!user);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user);
    });
    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const prompts = useMemo(() => suggestedPrompts(ctx), [ctx]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const promptSignIn = () => {
    setMessages((prev) => {
      if (prev.length > 0 && prev[prev.length - 1].showsSignIn) return prev;
      return [
        ...prev,
        {
          id: `signin-${Date.now()}`,
          role: "assistant",
          content: SIGN_IN_PROMPT,
          showsSignIn: true,
        },
      ];
    });
  };

  const sendMessage = async (text: string) => {
    if (!text.trim() || sending) return;
    if (signedIn === false) {
      promptSignIn();
      return;
    }
    if (limitState !== null) return;
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
      showsPhotoTips: ctx.page === "sell" && shouldShowPhotoTips(text),
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

      if (res.status === 401) {
        const json = await res.json().catch(() => ({}));
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aceMsg.id
              ? {
                  ...m,
                  content: json.message || SIGN_IN_PROMPT,
                  showsSignIn: true,
                  pending: false,
                }
              : m,
          ),
        );
        onAceState("idle");
        return;
      }

      if (res.status === 429) {
        const json = await res.json().catch(() => ({}));
        const msg = json.message || "Try again later.";
        setMessages((prev) =>
          prev.map((m) =>
            m.id === aceMsg.id ? { ...m, content: msg, pending: false } : m,
          ),
        );
        if (json.error === "rate_limit") setLimitState("user_hour");
        else if (json.error === "daily_cap") setLimitState("daily");
        onAceState("alert");
        setTimeout(() => onAceState("idle"), 2000);
        return;
      }

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

  const placeholder =
    signedIn === false
      ? "Sign in to chat"
      : limitState === "user_hour"
        ? "Try again in an hour"
        : limitState === "daily"
          ? "Ace is back tomorrow"
          : "Ask Ace anything...";

  return (
    <>
      <div
        className="fixed inset-0 z-[70] bg-black/50"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="fixed inset-x-0 bottom-0 z-[71] bg-white rounded-t-3xl shadow-2xl flex flex-col ace-drawer-enter h-[65dvh] max-h-[65dvh]">
        {/* Header */}
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

        {/* Content area */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && signedIn !== false && (
          <div className="min-h-full flex flex-col items-center justify-center text-center">
            <p className="font-heading text-xl font-bold text-navy">
              Hey! I&apos;m Ace 👋
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs">
              Ask me anything about gear, sizing, or how NearGear works.
            </p>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mt-8 mb-3 self-start">
              Suggested
            </p>
            <div className="grid grid-cols-2 gap-2 w-full">
              {prompts.map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => sendMessage(p)}
                  className="text-sm border border-orange/40 text-orange rounded-xl px-3 py-2 hover:bg-orange/5 leading-tight text-left"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && signedIn === false && (
          <div className="min-h-full flex flex-col items-center justify-center text-center">
            <p className="font-heading text-xl font-bold text-navy">
              Hey! I&apos;m Ace 👋
            </p>
            <p className="text-sm text-muted-foreground mt-2 max-w-xs leading-relaxed">
              {SIGN_IN_PROMPT}
            </p>
            <Link href="/auth/login" className="mt-5 inline-block">
              <Button className="btn-primary h-11 px-6">
                <LogIn className="w-4 h-4" /> Sign In
              </Button>
            </Link>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-orange text-white px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                {m.content}
              </div>
            </div>
          ) : (
            <div key={m.id} className="flex">
              <div className="flex-1 min-w-0">
                {m.content && (
                  <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gray-100 text-navy px-3.5 py-2 text-sm leading-relaxed whitespace-pre-wrap">
                    {m.content}
                    {m.pending && (
                      <span className="inline-block w-2 h-3 bg-orange animate-pulse align-middle ml-1" />
                    )}
                  </div>
                )}
                {!m.content && m.pending && (
                  <div className="inline-flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Ace is thinking...
                  </div>
                )}
                {m.showsPhotoTips && !m.pending && <PhotoTipsCard />}
                {m.showsSignIn && !m.pending && (
                  <Link href="/auth/login" className="inline-block mt-2">
                    <Button className="btn-primary h-10 px-4">
                      <LogIn className="w-4 h-4" /> Sign In
                    </Button>
                  </Link>
                )}
              </div>
            </div>
          ),
        )}

        {error && (
          <p className="text-xs text-red-600 bg-red-50 rounded-xl p-3">
            {error}
          </p>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <div
        className="border-t p-3 flex gap-2 items-end"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        <Input
          ref={inputRef}
          placeholder={placeholder}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={(e) => {
            if (signedIn === false) {
              e.currentTarget.blur();
              promptSignIn();
            }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage(input);
            }
          }}
          disabled={limitState !== null}
          readOnly={signedIn === false}
          className="input-large flex-1"
        />
        <Button
          onClick={() => sendMessage(input)}
          disabled={
            !input.trim() ||
            sending ||
            limitState !== null ||
            signedIn === false
          }
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
