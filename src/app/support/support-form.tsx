"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2, Loader2 } from "lucide-react";

type Status = "idle" | "submitting" | "done";

/**
 * Client validation is a courtesy; /api/support re-checks everything. The
 * user id is NOT sent from here: the route reads it from the session cookie.
 */
export function SupportForm({ fromPath }: { fromPath: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  // Signed-in visitors shouldn't have to type what we already know. Only fills
  // empty fields, so it never overwrites something they started typing.
  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!alive || !user) return;
      if (user.email) setEmail((prev) => prev || user.email!);
      const { data: profile } = await supabase
        .from("users")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      const fullName =
        profile?.full_name ??
        (user.user_metadata?.full_name as string | undefined) ??
        "";
      if (alive && fullName) setName((prev) => prev || fullName);
    });
    return () => {
      alive = false;
    };
  }, [supabase]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim() || !email.trim() || !message.trim()) {
      setError("Please fill in your name, email and message.");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message, pagePath: fromPath, website }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok) {
        setError(body.message || "Something went wrong. Please try again.");
        setStatus("idle");
        return;
      }
      setStatus("done");
    } catch {
      setError("Network error. Please check your connection and try again.");
      setStatus("idle");
    }
  };

  if (status === "done") {
    return (
      <div className="bg-white rounded-2xl border p-6 text-center space-y-3">
        <CheckCircle2 className="w-10 h-10 text-orange mx-auto" />
        <h1 className="font-heading text-2xl font-bold text-navy">
          Message sent
        </h1>
        <p className="text-sm text-muted-foreground">
          Thanks, {name.trim().split(/\s+/)[0]}. A real person will reply to{" "}
          <span className="font-semibold text-navy">{email.trim()}</span>,
          usually within a day.
        </p>
        <div className="pt-2">
          <Link href={fromPath && fromPath.startsWith("/") && !fromPath.startsWith("//") ? fromPath : "/marketplace"}>
            <Button variant="outline" className="btn-large w-full">
              Back to NearGear
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-navy mb-1">
        Contact support
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Question about a listing, a meetup or your account? Send us a message
        and we&rsquo;ll reply by email.
      </p>

      <form
        onSubmit={submit}
        noValidate
        className="bg-white rounded-2xl border p-5 space-y-4"
      >
        <div className="space-y-1.5">
          <label
            htmlFor="support-name"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Name
          </label>
          <Input
            id="support-name"
            autoComplete="name"
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="support-email"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Email
          </label>
          <Input
            id="support-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <label
            htmlFor="support-message"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wide"
          >
            Message
          </label>
          <Textarea
            id="support-message"
            rows={6}
            maxLength={5000}
            placeholder="How can we help?"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="text-base"
          />
        </div>

        {/* Honeypot: off-screen and out of the tab order, so only bots fill it. */}
        <div aria-hidden="true" className="absolute -left-[9999px] h-0 overflow-hidden">
          <label htmlFor="support-website">Website</label>
          <input
            id="support-website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
            {error}
          </p>
        )}

        <Button
          type="submit"
          disabled={status === "submitting"}
          className="btn-large w-full btn-primary"
        >
          {status === "submitting" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "Send message"
          )}
        </Button>
      </form>
    </>
  );
}
