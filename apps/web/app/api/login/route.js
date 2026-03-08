import { NextResponse } from "next/server";

function redirectRelative(request, path) {
  const abs = new URL(path, request.url);
  const res = NextResponse.redirect(abs);
  res.headers.set("Location", path);
  return res;
}

export async function POST(request) {
  try {
    const url = new URL(request.url);
    const nextPath = url.searchParams.get("next") || "/dashboard";

    const formData = await request.formData();
    const email = (formData.get("email") || "").toString().trim();
    const password = (formData.get("password") || "").toString();

    const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";
    const devEmail = email || "b4reel271980@yahoo.com";

    let apiRes = await fetch(`${API}/auth/dev-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: devEmail }),
      cache: "no-store",
    });

    if (!apiRes.ok) {
      console.error("dev-login failed:", apiRes.status, await apiRes.text());

      apiRes = await fetch(`${API}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: devEmail,
          password,
        }),
        cache: "no-store",
      });
    }

    if (!apiRes.ok) {
      const bodyText = await apiRes.text();
      console.error("login failed:", apiRes.status, bodyText);
      return redirectRelative(
        request,
        `/login?error=${encodeURIComponent(`api_${apiRes.status}`)}`
      );
    }

    const data = await apiRes.json();

    if (!data?.token) {
      console.error("login response missing token:", data);
      return redirectRelative(request, "/login?error=no_token");
    }

    const res = redirectRelative(request, nextPath);

    res.cookies.set("gc_auth", data.token, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: true,
    });

    return res;
  } catch (err) {
    console.error("Login error:", err);
    return redirectRelative(request, "/login?error=server");
  }
}