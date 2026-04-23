"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2 } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex flex-col bg-navy safe-top safe-bottom">
      {/* Logo */}
      <div className="pt-12 pb-6 text-center">
        <Link href="/" className="inline-block text-4xl font-bold font-heading">
          <span className="text-white">Sport</span>
          <span className="text-orange">Swap</span>
        </Link>
        <p className="text-white/40 text-sm mt-1">DFW Sports Gear Marketplace</p>
      </div>

      {/* Form */}
      <div className="flex-1 flex items-start justify-center px-4 pt-4">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h1 className="font-heading text-2xl font-bold text-navy text-center mb-1">
            Welcome Back
          </h1>
          <p className="text-center text-muted-foreground text-sm mb-8">
            Log in to buy and sell sports gear
          </p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@example.com"
                className="input-large"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                className="input-large"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 rounded-xl p-3">{error}</p>
            )}

            <Button type="submit" disabled={loading} className="btn-large btn-primary">
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
              Sign In
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{" "}
            <Link href="/auth/signup" className="text-orange hover:text-orange-light font-semibold">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
