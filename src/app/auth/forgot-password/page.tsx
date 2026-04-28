"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Mail, CheckCircle2 } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const origin =
      process.env.NEXT_PUBLIC_APP_URL || window.location.origin;

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: `${origin}/auth/reset-password` }
    );

    if (resetError) {
      setError(resetError.message);
      setLoading(false);
      return;
    }

    setSent(true);
    setLoading(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy safe-top safe-bottom">
      <div className="pt-12 pb-6 text-center">
        <Link href="/" className="inline-block text-4xl font-bold font-heading">
          <span className="text-white">Near</span>
          <span className="text-orange">Gear</span>
        </Link>
      </div>

      <div className="flex-1 flex items-start justify-center px-4 pt-4 pb-8">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          {sent ? (
            <div className="text-center">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h1 className="font-heading text-2xl font-bold text-navy mb-2">
                Check your email
              </h1>
              <p className="text-muted-foreground text-sm mb-6">
                We sent a password reset link to{" "}
                <span className="font-semibold text-navy">{email}</span>. The
                link expires in 1 hour.
              </p>
              <Link
                href="/auth/login"
                className="text-sm text-orange hover:text-orange-light font-semibold"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <>
              <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
                Reset Password
              </h1>
              <p className="text-center text-muted-foreground text-sm mb-8">
                Enter your email and we&apos;ll send you a link to reset it.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    className="input-large"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                {error && (
                  <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  disabled={loading}
                  className="btn-large btn-primary"
                >
                  {loading ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Mail className="w-5 h-5" />
                  )}
                  Send Reset Link
                </Button>
              </form>

              <p className="mt-6 text-center text-sm text-muted-foreground">
                Remembered it?{" "}
                <Link
                  href="/auth/login"
                  className="text-orange hover:text-orange-light font-semibold"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
