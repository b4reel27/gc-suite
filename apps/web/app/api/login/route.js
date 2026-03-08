import { NextResponse } from "next/server";

function redirectRelative(request, path) {
  const abs = new URL(path, request.url);        // Next requires absolute URL objects
  const res = NextResponse.redirect(abs);
  res.headers.set("Location", path);             // force browser to use relative path (prevents 0.0.0.0 issues)
  return res;
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const nextPath = url.searchParams.get("next") || "/dashboard";

    const formData = await request.formData();
    const email = (formData.get("email") || "").toString().trim();

    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

    // ✅ TURNKEY: use dev-login (matches your API usage)
    // If email is blank, fall back to your known dev email so login works “out of the box”
    const devEmail = email || "b4reel271980@yahoo.com";

    let apiRes = await fetch(`${API}/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: devEmail }),
    });

    // Fallback: if you later add /auth/login, this will still work
    if (!apiRes.ok) {
      apiRes = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: devEmail,
          password: (formData.get("password") || "").toString(),
        }),
      });
    }

    if (!apiRes.ok) {
      return redirectRelative(request, "/login?error=invalid");
    }

    const data = await apiRes.json();
    if (!data?.token) {
      return redirectRelative(request, "/login?error=invalid");
    }

    const res = redirectRelative(request, nextPath);

    // ✅ cookie your app can read everywhere
    res.cookies.set("gc_auth", data.token, {
      path: "/",
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return redirectRelative(request, "/login?error=server");
  }
}