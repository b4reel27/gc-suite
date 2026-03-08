import { cookies, headers } from "next/headers";
import OpenProjectButton from "../../../components/OpenProjectButton";

async function getApiUrl() {
  const hdrs = await headers();
  const host = hdrs.get("host")?.split(":")[0];
  return process.env.NEXT_PUBLIC_API_URL || (host ? `http://${host}:3005` : "");
}

async function fetchProjects(token) {
  const apiUrl = await getApiUrl();
  if (!apiUrl || !token) return [];
  const res = await fetch(`${apiUrl}/projects`, {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  return res.json();
}

export default async function ProjectsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("gc_auth")?.value || "";
  const projects = await fetchProjects(token);

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900">Projects</h1>
      <p className="mt-2 text-slate-600">Choose a project to work in.</p>

      <div className="mt-6 space-y-3">
        {(projects?.length ? projects : []).map((p) => (
          <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900">{p.name}</div>
                <div className="text-xs text-slate-500">{p.location || ""}</div>
                <div className="text-xs text-slate-400">{p.id}</div>
              </div>

              <OpenProjectButton projectId={p.id} />
            </div>
          </div>
        ))}

        {!projects?.length ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
            No projects found (or you&apos;re not logged in). Go to Login and try again.
          </div>
        ) : null}
      </div>
    </div>
  );
}
