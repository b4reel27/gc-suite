export default function AppLoading() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white px-6 py-8 text-center shadow-[0_24px_60px_rgba(15,23,42,.10)]">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-slate-900 text-2xl font-black text-white shadow-lg">
          GC
        </div>
        <div className="mt-5 text-2xl font-black tracking-tight text-slate-900">GC Suite</div>
        <div className="mt-1 text-sm text-slate-500">Opening your command center…</div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
          <div className="gc-loader-bar h-full rounded-full bg-slate-900" />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-2 text-left">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="h-3 w-16 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-10 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="h-3 w-14 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-8 rounded bg-slate-200" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <div className="h-3 w-12 rounded bg-slate-200" />
            <div className="mt-3 h-7 w-9 rounded bg-slate-200" />
          </div>
        </div>
      </div>
    </div>
  );
}
