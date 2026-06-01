"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") || "/dashboard";

  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Login failed");

      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      document.cookie = `gc_token=${data.token};path=/;max-age=86400;SameSite=Lax`;

      router.replace(next);
    } catch (err) {
      setError(err.message === "Failed to fetch"
        ? "Cannot reach the server. Try again in a moment."
        : err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md p-6 rounded-xl bg-slate-800 border border-slate-700 shadow">
        <h1 className="text-2xl font-semibold mb-2">GC Suite</h1>
        <p className="text-slate-300 mb-6">Sign in to continue.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            required
            autoComplete="email"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            placeholder="Password"
            required
            autoComplete="current-password"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium disabled:opacity-60"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>

        <p className="mt-4 text-sm text-slate-400 text-center">
          No account?{" "}
          <Link href="/register" className="text-blue-400 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="p-6 text-white">Loading…</div>}>
      <LoginInner />
    </Suspense>
  );
}
