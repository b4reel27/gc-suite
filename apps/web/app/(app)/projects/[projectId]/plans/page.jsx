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

function norm(v) {
  return (v ?? "").toString().trim();
}

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
}

async function getApiUrl() {
  const hdrs = await headers();
  const host = hdrs.get("host")?.split(":")[0];

  return (
    process.env.API_BASE_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    (host ? `http://${host}:3005` : "http://localhost:3005")
  );
}

async function apiFetchServer(path, token) {
  const base = await getApiUrl();

  const res = await fetch(`${base}${path}`, {
    cache: "no-store",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const ct = res.headers.get("content-type") || "";
  let data = {};

  try {
    if (ct.includes("application/json")) {
      data = await res.json();
    } else {
      const text = await res.text();
      data = text ? { error: text } : {};
    }
  } catch {
    data = {};
  }

  if (!res.ok) {
    throw new Error(data?.error || `Request failed (${res.status})`);
  }

  return data;
}

function getCurrentRevLabel(plan) {
  if (plan?.currentRev) return plan.currentRev;
  if (plan?.current?.rev) return plan.current.rev;
  if (plan?.current_revision) return plan.current_revision;
  return "";
}

function getUpdatedLabel(plan) {
  return (
    plan?.updatedAt ||
    plan?.updated_at ||
    plan?.current?.date ||
    plan?.current_revision_date ||
    ""
  );
}

export default async function PlansPage({ params, searchParams }) {
  const { projectId } = await Promise.resolve(params);
  const sp = (await Promise.resolve(searchParams)) || {};

  const q = norm(sp?.q);
  const discipline = norm(sp?.discipline);

  const cookieStore = await cookies();
  const token =
    cookieStore.get("gc_auth")?.value ||
    cookieStore.get("gc_token")?.value ||
    cookieStore.get("token")?.value ||
    "";

  const disciplines = [
    "",
    "ARCH",
    "STRUCT",
    "ELEC",
    "MECH",
    "CIVIL",
    "PLUMB",
    "FIRE",
    "GEN",
  ];

  let project = null;
  let me = null;
  let plans = [];
  let loadError = "";

  if (token) {
    try {
      const projects = await apiFetchServer(`/projects`, token);
      project = Array.isArray(projects)
        ? projects.find((p) => p.id === projectId) || null
        : null;
    } catch {
      // non-fatal
    }

    try {
      me = await apiFetchServer(`/projects/${projectId}/me`, token);
    } catch {
      // non-fatal
    }

    const planEndpointsToTry = [
      `/projects/${projectId}/plans`,
      `/plans/${projectId}`,
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

        if (Array.isArray(data?.sheets)) {
          plans = data.sheets;
          break;
        }
      } catch (e) {
        loadError = e?.message || "";
      }
    }
  }

  const filtered = (plans || []).filter((p) => {
    const dOk =
      !discipline ||
      norm(p.discipline).toUpperCase() === discipline.toUpperCase();

    if (!dOk) return false;

    if (!q) return true;

    const hay =
      `${norm(p.sheetNo)} ${norm(p.sheetId)} ${norm(p.title)} ${norm(
        p.discipline
      )}`.toLowerCase();

    return hay.includes(q.toLowerCase());
  });

  filtered.sort((a, b) => {
    const A = norm(a.sheetNo || a.sheetId);
    const B = norm(b.sheetNo || b.sheetId);
    return A.localeCompare(B, undefined, {
      numeric: true,
      sensitivity: "base",
    });
  });

  const iAmGC = isGcRole(me?.role);

  return (
    <div className="space-y-4">
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
                Project:{" "}
                <span className="font-semibold text-slate-900">{project.name}</span>
                {project.location ? (
                  <span className="text-slate-500"> — {project.location}</span>
                ) : null}
              </>
            ) : (
              <>
                Project ID: <span className="font-mono text-xs">{projectId}</span>
              </>
            )}
          </p>

          {me?.role ? (
            <p className="mt-1 text-sm text-slate-600">
              Role: <span className="font-semibold text-slate-900">{me.role}</span>
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Link
            href={`/projects/${projectId}/plans`}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:shadow-sm"
          >
            Refresh
          </Link>

          {iAmGC ? (
            <Link
              href={`/projects/${projectId}/plans/new`}
              className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              + Add Sheet
            </Link>
          ) : null}
        </div>
      </div>

      {!iAmGC && token ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-600">
          Plans can be viewed here, but only GC users can add or manage plan sheets.
        </div>
      ) : null}

      {loadError && token ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {loadError}
        </div>
      ) : null}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-center"
        action={`/projects/${projectId}/plans`}
        method="get"
      >
        <input
          name="q"
          defaultValue={q}
          placeholder="Search sheet no, id, or title..."
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

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
          <div className="col-span-2">Sheet</div>
          <div className="col-span-5">Title</div>
          <div className="col-span-2">Discipline</div>
          <div className="col-span-3">Open</div>
        </div>

        {!token ? (
          <div className="px-4 py-4 text-sm text-slate-600">
            Not logged in. Go to{" "}
            <Link className="underline" href="/login">
              Login
            </Link>{" "}
            and try again.
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
            {filtered.map((p) => {
              const sheetKey = p.sheetId || p.id || `${p.sheetNo}-${p.title}`;
              const sheetHref = encodeURIComponent(p.sheetId || p.sheetNo || "");
              const revLabel = getCurrentRevLabel(p);
              const updatedLabel = getUpdatedLabel(p);

              return (
                <div
                  key={sheetKey}
                  className="grid grid-cols-12 gap-2 px-4 py-3 text-sm"
                >
                  <div className="col-span-2 font-semibold text-slate-900">
                    {p.sheetNo || p.sheetId || "—"}
                    {revLabel ? (
                      <div className="mt-1 text-xs text-slate-500">Rev: {revLabel}</div>
                    ) : null}
                  </div>

                  <div className="col-span-5 text-slate-700">
                    {p.title || "—"}
                    {updatedLabel ? (
                      <div className="mt-1 text-xs text-slate-500">
                        Updated: {fmtDate(updatedLabel)}
                      </div>
                    ) : null}
                  </div>

                  <div className="col-span-2">
                    <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                      {p.discipline || "—"}
                    </span>
                  </div>

                  <div className="col-span-3 flex flex-wrap gap-2">
                    <Link
                      href={`/projects/${projectId}/plans/${sheetHref}`}
                      className="inline-flex rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90"
                    >
                      Open
                    </Link>

                    {iAmGC ? (
                      <Link
                        href={`/projects/${projectId}/plans/${sheetHref}`}
                        className="inline-flex rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        Manage
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

    </div>
  );
}