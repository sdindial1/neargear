"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, KeyRound } from "lucide-react";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }

    setLoading(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError(updateError.message);
      setLoading(false);
      return;
    }

    toast.success("Password updated. You're signed in.");
    router.push("/profile");
    router.refresh();
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
          <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
            Set New Password
          </h1>
          <p className="text-center text-muted-foreground text-sm mb-8">
            Pick something at least 8 characters.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className="input-large"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="Re-enter password"
                className="input-large"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
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
                <KeyRound className="w-5 h-5" />
              )}
              Update Password
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
