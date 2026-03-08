"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL;

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/dashboard";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch(`${API}/auth/dev-login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Login failed");
      }

      localStorage.setItem("token", data.token);
      localStorage.setItem("user", JSON.stringify(data.user));

      router.push(next);
    } catch (err) {
      setError(err.message);
    }

    setLoading(false);
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md p-6 rounded-xl bg-slate-800 border border-slate-700 shadow">
        <h1 className="text-2xl font-semibold mb-2">GC Suite</h1>
        <p className="text-slate-300 mb-6">Sign in to continue.</p>

        <form onSubmit={handleLogin} className="space-y-3">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            type="email"
            placeholder="Email"
            required
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          />

          <button
            disabled={loading}
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium"
          >
            {loading ? "Signing in..." : "Login"}
          </button>

          {error && (
            <div className="text-red-400 text-sm pt-2">
              {error}
            </div>
          )}
        </form>
      </div>
    </main>
  );
}