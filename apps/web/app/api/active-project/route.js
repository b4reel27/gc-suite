import { NextResponse } from "next/server";

export async function POST(request) {
  let projectId = "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    projectId = body.projectId || "";
  } else {
    const form = await request.formData().catch(() => null);
    projectId = form?.get("projectId")?.toString() || "";
  }

  const res = NextResponse.json({ ok: true });

  if (projectId) {
    res.cookies.set("activeProjectId", projectId, { path: "/" });
  }

  return res;
}