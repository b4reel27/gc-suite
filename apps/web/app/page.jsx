export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 text-slate-900">
      <div className="w-full max-w-md rounded-[32px] border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-4xl font-black tracking-tight">GC Suite</h1>
        <p className="mt-3 text-slate-500">Construction command center for the field and office.</p>
        <p className="mt-6">
          <a
            href="/login"
            className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 font-semibold text-white transition hover:bg-slate-800"
          >
            Go to Login →
          </a>
        </p>
      </div>
    </main>
  );
}
