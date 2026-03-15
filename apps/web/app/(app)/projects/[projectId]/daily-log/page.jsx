"use client";

import { useMemo, useState } from "react";
import ProjectHeader from "../../../../../components/ProjectHeader";

function Section({ title, subtitle, children }) {
  return (
    <section className="rounded-[28px] border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="mb-1.5 text-sm font-semibold text-slate-700">{label}</div>
      {children}
    </label>
  );
}

export default function DailyLogPage() {
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const [form, setForm] = useState({
    date: today,
    weather: "",
    manpower: "",
    workCompleted: "",
    deliveries: "",
    visitors: "",
    delays: "",
    safety: "",
    notes: "",
  });

  function update(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-4 sm:space-y-5">
      <ProjectHeader projectName="Daily Log" location="Field-ready starter" />

      <Section
        title="Daily Log"
        subtitle="This is a solid starting shell for supers. Next move could be save-to-API, photo attach, and voice-to-log."
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Date">
            <input
              type="date"
              value={form.date}
              onChange={(e) => update("date", e.target.value)}
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Weather / Conditions">
            <input
              value={form.weather}
              onChange={(e) => update("weather", e.target.value)}
              placeholder="Clear, muddy, windy, rain delay..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Manpower / Trades On Site">
            <textarea
              rows={4}
              value={form.manpower}
              onChange={(e) => update("manpower", e.target.value)}
              placeholder="Framers 5, electricians 2, drywall 4..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Work Completed">
            <textarea
              rows={4}
              value={form.workCompleted}
              onChange={(e) => update("workCompleted", e.target.value)}
              placeholder="Hung grid in corridor, set rooftop curb, punch room 103..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Deliveries / Equipment">
            <textarea
              rows={4}
              value={form.deliveries}
              onChange={(e) => update("deliveries", e.target.value)}
              placeholder="Received RTU, scissor lift on site, concrete truck delayed..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Visitors / Inspections">
            <textarea
              rows={4}
              value={form.visitors}
              onChange={(e) => update("visitors", e.target.value)}
              placeholder="Owner visit, city inspection, architect walkthrough..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Delays / Impacts">
            <textarea
              rows={4}
              value={form.delays}
              onChange={(e) => update("delays", e.target.value)}
              placeholder="Rain delay, missing material, access issue..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>

          <Field label="Safety / Incidents">
            <textarea
              rows={4}
              value={form.safety}
              onChange={(e) => update("safety", e.target.value)}
              placeholder="No incidents, toolbox talk completed, PPE reminder..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Field label="General Notes">
            <textarea
              rows={6}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Anything else worth documenting for the day..."
              className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-slate-400"
            />
          </Field>
        </div>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            className="rounded-2xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Save Daily Log
          </button>
          <button
            type="button"
            className="rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
          >
            Add Photos Later
          </button>
        </div>
      </Section>
    </div>
  );
}
