import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const body = await request.json();
    const email    = String(body?.email    || "").trim();
    const password = String(body?.password || "").trim();

    if (!email)    return NextResponse.json({ error: "Email is required" },    { status: 400 });
    if (!password) return NextResponse.json({ error: "Password is required" }, { status: 400 });

    const API =
      process.env.API_BASE_URL ||
      process.env.NEXT_PUBLIC_API_URL ||
      "http://localhost:3005";

    const apiRes = await fetch(`${API}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    });

    if (!apiRes.ok) {
      let msg = `API error (${apiRes.status})`;
      try { const d = await apiRes.json(); msg = d?.error || msg; } catch {}
      return NextResponse.json({ error: msg }, { status: apiRes.status });
    }

    const data = await apiRes.json();
    if (!data?.token) return NextResponse.json({ error: "No token received" }, { status: 500 });

    const res = NextResponse.json({ token: data.token, user: data.user });
    res.cookies.set("gc_auth", data.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    return res;
  } catch (err) {
    console.error("Login route error:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
