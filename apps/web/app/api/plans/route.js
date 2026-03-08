import { NextResponse } from "next/server";

export async function POST(req) {
  const form = await req.formData();

  const projectId = form.get("projectId");
  if (!projectId) {
    return NextResponse.redirect(new URL("/projects", req.url), 303);
  }

  const payload = {
    sheetId: form.get("sheetId"),
    sheetNo: form.get("sheetNo"),
    title: form.get("title"),
    discipline: form.get("discipline"),
    rev: form.get("rev"),
    revDate: form.get("revDate"),
    fileUrl: form.get("fileUrl"),
  };

  const base = process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005";

  const resp = await fetch(`${base}/projects/${projectId}/plans`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!resp.ok) {
    // fallback: go back to form (you can add nicer error handling later)
    return NextResponse.redirect(new URL(`/projects/${projectId}/plans/new`, req.url), 303);
  }

  return NextResponse.redirect(new URL(`/projects/${projectId}/plans`, req.url), 303);
}