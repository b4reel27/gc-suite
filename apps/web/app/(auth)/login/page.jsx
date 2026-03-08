import React from "react";

export default function LoginPage({ searchParams }) {
  // Next 15+ treats dynamic APIs (like searchParams) as async in server components
  const next =
    (typeof searchParams?.then === "function"
      ? React.use(searchParams).next
      : searchParams?.next) || "/dashboard";

  return (
    <main className="min-h-screen flex items-center justify-center bg-slate-900 text-white">
      <div className="w-full max-w-md p-6 rounded-xl bg-slate-800 border border-slate-700 shadow">
        <h1 className="text-2xl font-semibold mb-2">GC Suite</h1>
        <p className="text-slate-300 mb-6">Sign in to continue.</p>

        <form action={`/api/login?next=${encodeURIComponent(next)}`} method="post" className="space-y-3">
          <input
            name="email"
            type="email"
            placeholder="Email"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          />
          <input
            name="password"
            type="password"
            placeholder="Password"
            className="w-full px-3 py-2 rounded bg-slate-900 border border-slate-700"
          />
          <button
            type="submit"
            className="w-full py-2 rounded bg-blue-600 hover:bg-blue-500 font-medium"
          >
            Login
          </button>
        </form>
      </div>
    </main>
  );
}