import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const form = await req.formData();
  const next = (form.get("next") as string) || "/dashboard";

  // TODO: replace this with real auth validation
  // For now, accept anything.

  const res = NextResponse.redirect(new URL(next, req.url));
  res.cookies.set("gc_auth", "1", { httpOnly: true, path: "/" });
  return res;
}