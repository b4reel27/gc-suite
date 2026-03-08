import Link from "next/link";
import { cookies, headers } from "next/headers";
import ProjectHeader from "../../../../../components/ProjectHeader";

function fmtDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

async function getApiUrl() {
  const hdrs = await headers();
  const host = hdrs.get("host")?.split(":")[0];
  return process.env.API_BASE_URL || process.env.NEXT_PUBLIC_API_URL || (host ? `http://${host}:3005` : "http://localhost:3005");
}

async function apiFetchServer(path, token) {
  const base = await getApiUrl();

  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function norm(v) {
  return (v ?? "").toString().trim();
}

export default async function PlansPage({ params, searchParams }) {
  // Next.js 15+: params/searchParams can be Promises in Server Components
  const { projectId } = await Promise.resolve(params);
  const sp = (await Promise.resolve(searchParams)) || {};

  const q = norm(sp?.q);
  const discipline = norm(sp?.discipline);

  const cookieStore = await cookies();
  const token = cookieStore.get("gc_auth")?.value || "";

  const disciplines = ["", "ARCH", "STRUCT", "ELEC", "MECH", "CIVIL", "PLUMB", "FIRE", "GEN"];

  // Fetch projects (for header) + plans list (if endpoint exists)
  let project = null;
  let plans = [];
  let loadError = "";

  try {
    const projects = await apiFetchServer(`/projects`, token);
    project = Array.isArray(projects) ? projects.find((p) => p.id === projectId) : null;
  } catch (e) {
    // non-fatal; header can still render
  }

  // Try a few likely plans endpoints (turnkey / resilient)
  // If your API only supports one of these, it will work.
  const planEndpointsToTry = [
    `/projects/${projectId}/plans`,
    `/plans/${projectId}`, // some builds use this pattern
    `/plans/${projectId}/list`,
  ];

  for (const ep of planEndpointsToTry) {
    try {
      const data = await apiFetchServer(ep, token);
      if (Array.isArray(data)) {
        plans = data;
        break;
      }
      if (Array.isArray(data?.plans)) {
        plans = data.plans;
        break;
      }
    } catch (e) {
      // keep trying
    }
  }

  // Apply filters server-side (safe even if API doesn’t support filtering)
  const filtered = (plans || []).filter((p) => {
    const dOk = !discipline || norm(p.discipline).toUpperCase() === discipline.toUpperCase();
    if (!dOk) return false;

    if (!q) return true;
    const hay = `${norm(p.sheetNo)} ${norm(p.sheetId)} ${norm(p.title)} ${norm(p.discipline)}`.toLowerCase();
    return hay.includes(q.toLowerCase());
  });

  // Sort by sheetNo if possible
  filtered.sort((a, b) => {
    const A = norm(a.sheetNo);
    const B = norm(b.sheetNo);
    return A.localeCompare(B, undefined, { numeric: true, sensitivity: "base" });
  });

  return (
    <div className="space-y-4">
      {/* ✅ Pro header */}
      <ProjectHeader
        projectName={project?.name || "Project"}
        location={project?.location || ""}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Plans</h1>
          <p className="mt-1 text-sm text-slate-600">
            {project?.name ? (
              <>
                Project: <span className="font-semibold text-slate-900">{project.name}</span>
                {project.location ? <span className="text-slate-500"> — {project.location}</span> : null}
              </>
            ) : (
              <>
                Project ID: <span className="font-mono text-xs">{projectId}</span>
              </>
            )}
          </p>
        </div>

        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}/plans`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:shadow-sm"
          >
            Refresh
          </Link>

          <Link
            href={`/projects/${projectId}/plans/new`}
            className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            + Add Sheet
          </Link>
        </div>
      </div>

      {/* Search / Filter */}
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        action={`/projects/${projectId}/plans`}
        method="get"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search sheet no, id, or title…"
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
        />
        <select
          name="discipline"
          defaultValue={discipline}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm sm:w-48"
        >
          {disciplines.map((d) => (
            <option key={d} value={d}>
              {d ? d : "All Disciplines"}
            </option>
          ))}
        </select>
        <button
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm text-white hover:opacity-90"
          type="submit"
        >
          Apply
        </button>
      </form>

      {/* Plans List */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-2">Sheet</div>
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Discipline</div>
          <div className="col-span-3">Open</div>
        </div>

        {!token ? (
          <div className="px-4 py-4 text-sm text-slate-600">
            Not logged in. Go to <Link className="underline" href="/login">Login</Link> and try again.
          </div>
        ) : filtered.length === 0 ? (
          <div className="px-4 py-4 text-sm text-slate-600">
            No plan sheets found.
            <div className="mt-2 text-xs text-slate-500">
              If you just uploaded, click <b>Refresh</b>.
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((p) => (
              <div key={p.sheetId || p.id || `${p.sheetNo}-${p.title}`} className="grid grid-cols-12 gap-2 px-4 py-3 text-sm">
                <div className="col-span-2 font-semibold text-slate-900">
                  {p.sheetNo || p.sheetId || "—"}
                  {p.currentRev ? (
                    <div className="mt-1 text-xs text-slate-500">Rev: {p.currentRev}</div>
                  ) : null}
                </div>

                <div className="col-span-5 text-slate-700">
                  {p.title || "—"}
                  {p.updatedAt ? (
                    <div className="mt-1 text-xs text-slate-500">Updated: {fmtDate(p.updatedAt)}</div>
                  ) : null}
                </div>

                <div className="col-span-2">
                  <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                    {p.discipline || "—"}
                  </span>
                </div>

                <div className="col-span-3">
                  <Link
                    href={`/projects/${projectId}/plans/${encodeURIComponent(p.sheetId || p.sheetNo)}`}
                    className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
                  >
                    Open
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Small helper note (only if API had no plans) */}
      {!plans?.length && token ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-xs text-slate-600">
          If your API doesn’t expose a plans list endpoint yet, that’s OK — the viewer still works once you have a sheetId.
          We can add a clean <b>GET /projects/:projectId/plans</b> endpoint to make this list fully live.
        </div>
      ) : null}
    </div>
  );
}