"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function RegisterPage() {
  const router = useRouter();
  const [name,     setName]     = useState("");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Registration failed");

      localStorage.setItem("token", data.token);
      if (data.user) localStorage.setItem("user", JSON.stringify(data.user));
      document.cookie = `gc_token=${data.token};path=/;max-age=86400;SameSite=Lax`;

      router.replace("/projects");
    } catch (err) {
      setError(err.message === "Failed to fetch"
        ? "Cannot reach the server. Try again in a moment."
        : err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md p-6 rounded-xl bg-slate-800 border border-slate-700 shadow">
        <h1 className="text-2xl font-semibold mb-2">GC Suite</h1>
        <p className="text-slate-300 mb-6">Create your account.</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            type="text"
            placeholder="Full name"
            required
            autoComplete="name"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
          />
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
            placeholder="Password (min 8 characters)"
            required
            minLength={8}
            autoComplete="new-password"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700 text-white"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium disabled:opacity-60"
          >
            {loading ? "Creating account…" : "Create Account"}
          </button>

          {error ? <p className="text-sm text-red-400">{error}</p> : null}
        </form>

        <p className="mt-4 text-sm text-slate-400 text-center">
          Already have an account?{" "}
          <Link href="/login" className="text-blue-400 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
