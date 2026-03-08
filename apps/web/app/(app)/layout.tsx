import Link from "next/link";
import { cookies } from "next/headers";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const activeProjectId = cookieStore.get("activeProjectId")?.value;
  const plansHref = activeProjectId ? `/projects/${activeProjectId}/plans` : "/projects";

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto max-w-7xl px-4 py-4">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          {/* Sidebar */}
          <aside className="rounded-2xl bg-white p-4 shadow-sm border border-slate-200">
            <div className="text-lg font-bold text-slate-900">GC Suite</div>
            <div className="mt-1 text-xs text-slate-500">Command Center</div>

            <nav className="mt-6 space-y-1">
              <Link className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href="/dashboard">
                Dashboard
              </Link>
              <Link className="block rounded-xl px-3 py-2 text-sm hover:bg-slate-50" href={plansHref}>
                Projects
              </Link>
            </nav>

            {!activeProjectId ? (
              <div className="mt-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 ring-1 ring-amber-200">
                No active project selected. Choose one in Projects.
              </div>
            ) : (
              <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-600 ring-1 ring-slate-200">
                Active Project: <span className="font-mono">{activeProjectId}</span>
              </div>
            )}

            <div className="mt-8">
              <form action="/api/logout" method="post">
                <button className="w-full rounded-xl bg-slate-900 px-3 py-2 text-sm text-white hover:opacity-90" type="submit">
                  Logout
                </button>
              </form>
            </div>
          </aside>

          {/* Main */}
          <main className="rounded-2xl bg-white p-6 shadow-sm border border-slate-200">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}