"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

// ─── Constants ────────────────────────────────────────────────────────────────

const HAZARD_TYPES = [
  { id: "electrical",    label: "Electrical Hazards" },
  { id: "fall_gt6ft",   label: "Fall Hazards (>6 ft)" },
  { id: "struck_by",    label: "Struck-By" },
  { id: "caught_in",    label: "Caught-In / Between" },
  { id: "heat_cold",    label: "Heat / Cold Stress" },
  { id: "chemical",     label: "Chemical Exposure" },
  { id: "noise",        label: "Noise Exposure" },
  { id: "heavy_equip",  label: "Heavy Equipment" },
  { id: "excavation",   label: "Excavation / Trenching" },
  { id: "confined",     label: "Confined Space" },
  { id: "overhead",     label: "Overhead Work" },
  { id: "hand_tools",   label: "Hand / Power Tools" },
  { id: "lifting",      label: "Lifting / Ergonomics" },
  { id: "slips_trips",  label: "Slips, Trips & Falls" },
  { id: "fire",         label: "Fire Hazard" },
  { id: "compressed",   label: "Compressed Gas" },
];

const PPE_TYPES = [
  { id: "hard_hat",     label: "Hard Hat" },
  { id: "safety_glass", label: "Safety Glasses" },
  { id: "vest_class2",  label: "Hi-Vis Vest (Class 2)" },
  { id: "vest_class3",  label: "Hi-Vis Vest (Class 3)" },
  { id: "steel_toe",    label: "Steel-Toed Boots" },
  { id: "gloves",       label: "Gloves" },
  { id: "hearing",      label: "Hearing Protection" },
  { id: "respirator",   label: "Respirator / Dust Mask" },
  { id: "face_shield",  label: "Face Shield" },
  { id: "fall_harness", label: "Fall Protection Harness" },
  { id: "cut_resist",   label: "Cut-Resistant Gloves" },
  { id: "welding",      label: "Welding Protection" },
];

const EMPTY_STEP = () => ({
  description: "",
  potential_hazards: "",
  controls: "",
});

const EMPTY_CREW = () => ({
  name: "",
  company: "",
  trade: "",
  acknowledged: false,
  time: "",
});

function emptyJsa() {
  return {
    work_description: "",
    work_location: "",
    jsa_date: (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; })(),
    superintendent_name: "",
    emergency_contacts: {
      fire: "911",
      police: "911",
      hospital_name: "",
      hospital_phone: "",
      nearest_er: "",
    },
    hazards: [],
    ppe: [],
    work_steps: [EMPTY_STEP()],
    crew: [EMPTY_CREW()],
  };
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getToken() {
  if (typeof document === "undefined") return "";
  const cookieVal = (name) =>
    document.cookie
      .split("; ")
      .find((c) => c.startsWith(name + "="))
      ?.split("=")
      .slice(1)
      .join("=") || "";
  const tok =
    cookieVal("gc_auth") ||
    cookieVal("gc_token") ||
    cookieVal("token") ||
    cookieVal("gcToken") ||
    "";
  if (tok) return decodeURIComponent(tok);
  return localStorage.getItem("token") || "";
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }
  return "http://localhost:3005";
}

function statusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "SUBMITTED") return "border-blue-200 bg-blue-50 text-blue-700";
  if (s === "APPROVED")  return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "REJECTED")  return "border-red-200 bg-red-50 text-red-700";
  return "border-slate-200 bg-slate-100 text-slate-600"; // DRAFT
}

function prettyDate(d) {
  if (!d) return "—";
  const date = new Date(d);
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

// ─── Shared UI Components ─────────────────────────────────────────────────────

function StatCard({ title, value }) {
  return (
    <div className="rounded-[24px] border border-black/10 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
        {title}
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900">
        {value}
      </div>
    </div>
  );
}

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function SectionLabel({ children }) {
  return (
    <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
      {children}
    </div>
  );
}

function InputField({ label, value, onChange, type = "text", placeholder = "", className = "", readOnly = false }) {
  return (
    <div className={`flex flex-col gap-1 ${className}`}>
      {label && (
        <label className="text-xs font-semibold text-slate-600">{label}</label>
      )}
      <input
        type={type}
        value={value || ""}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`rounded-2xl border px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${
          readOnly
            ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
            : "border-black/10 bg-white text-slate-900"
        }`}
      />
    </div>
  );
}

function TextareaField({ label, value, onChange, placeholder = "", rows = 2, readOnly = false }) {
  return (
    <div className="flex flex-col gap-1">
      {label && (
        <label className="text-xs font-semibold text-slate-600">{label}</label>
      )}
      <textarea
        value={value || ""}
        onChange={(e) => !readOnly && onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        readOnly={readOnly}
        className={`resize-none rounded-2xl border px-3 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100 ${
          readOnly
            ? "border-slate-200 bg-slate-100 text-slate-500 cursor-not-allowed"
            : "border-black/10 bg-white text-slate-900"
        }`}
      />
    </div>
  );
}

function CollapsibleSection({ label, children, defaultOpen = false, summary = "" }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 text-left"
      >
        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          {label}
        </div>
        <div className="flex items-center gap-2">
          {!open && summary && (
            <span className="text-xs text-slate-400">{summary}</span>
          )}
          <svg
            className={`h-4 w-4 flex-shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {open && <div className="mt-4">{children}</div>}
    </Card>
  );
}

function CheckboxGrid({ items, selected, onChange, readOnly = false }) {
  function toggle(id) {
    if (readOnly) return;
    if (selected.includes(id)) {
      onChange(selected.filter((x) => x !== id));
    } else {
      onChange([...selected, id]);
    }
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => {
        const checked = selected.includes(item.id);
        return (
          <label
            key={item.id}
            className={`flex cursor-pointer items-center gap-2 rounded-2xl border px-3 py-3 text-sm transition ${
              checked
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-black/10 bg-white text-slate-700 hover:bg-slate-50"
            } ${readOnly ? "cursor-default" : ""}`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(item.id)}
              className="sr-only"
            />
            <span
              className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${
                checked ? "border-white bg-white" : "border-slate-300 bg-white"
              }`}
            >
              {checked && (
                <svg
                  className="h-3 w-3 text-slate-900"
                  fill="none"
                  viewBox="0 0 12 12"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2 6l3 3 5-5" />
                </svg>
              )}
            </span>
            <span className="leading-tight">{item.label}</span>
          </label>
        );
      })}
    </div>
  );
}

// ─── JSA Form Component ───────────────────────────────────────────────────────

function JsaFormView({ jsa, me, onSave, onSubmit, onApprove, onReject, onBack, saving, actionError }) {
  const [form, setForm] = useState(() => {
    const base = emptyJsa();
    if (!jsa) return base;
    return {
      ...base,
      ...jsa,
      emergency_contacts: { ...base.emergency_contacts, ...(jsa.emergency_contacts || {}) },
      hazards:    Array.isArray(jsa.hazards)    ? jsa.hazards    : [],
      ppe:        Array.isArray(jsa.ppe)        ? jsa.ppe        : [],
      work_steps: Array.isArray(jsa.work_steps) && jsa.work_steps.length ? jsa.work_steps : [EMPTY_STEP()],
      crew:       Array.isArray(jsa.crew)       && jsa.crew.length       ? jsa.crew       : [EMPTY_CREW()],
    };
  });

  const isApproved  = jsa?.status === "APPROVED";
  const isSubmitted = jsa?.status === "SUBMITTED";
  const isDraft     = !jsa || jsa.status === "DRAFT";
  const iAmGC       = String(me?.role || "").toUpperCase().startsWith("GC");

  const canEdit   = isDraft;
  const canSubmit = isDraft;
  const canApprove = iAmGC && isSubmitted;

  function set(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  function setEC(field, value) {
    setForm((p) => ({
      ...p,
      emergency_contacts: { ...p.emergency_contacts, [field]: value },
    }));
  }

  function setStep(i, field, value) {
    setForm((p) => {
      const steps = [...p.work_steps];
      steps[i] = { ...steps[i], [field]: value };
      return { ...p, work_steps: steps };
    });
  }

  function addStep() {
    setForm((p) => ({ ...p, work_steps: [...p.work_steps, EMPTY_STEP()] }));
  }

  function removeStep(i) {
    setForm((p) => ({ ...p, work_steps: p.work_steps.filter((_, idx) => idx !== i) }));
  }

  function setCrew(i, field, value) {
    setForm((p) => {
      const crew = [...p.crew];
      crew[i] = { ...crew[i], [field]: value };
      return { ...p, crew };
    });
  }

  function addCrew() {
    setForm((p) => ({ ...p, crew: [...p.crew, EMPTY_CREW()] }));
  }

  function removeCrew(i) {
    setForm((p) => ({ ...p, crew: p.crew.filter((_, idx) => idx !== i) }));
  }

  return (
    <div className="space-y-4">
      {/* Back + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="rounded-2xl border border-black/10 bg-white p-2.5 text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <div className="text-xl font-extrabold tracking-tight text-slate-900">
            Job Safety Analysis
          </div>
          {jsa?.status && (
            <span
              className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${statusBadgeClass(jsa.status)}`}
            >
              {jsa.status}
            </span>
          )}
        </div>
      </div>

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}

      {/* 1 — Job Information */}
      <Card>
        <SectionLabel>1 — Job Information</SectionLabel>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextareaField
            label="Work / Task Description"
            value={form.work_description}
            onChange={(v) => set("work_description", v)}
            placeholder="Describe the work being performed…"
            rows={2}
            readOnly={!canEdit}
          />
          <InputField
            label="Work Location"
            value={form.work_location}
            onChange={(v) => set("work_location", v)}
            placeholder="Building A, Level 3 / Area / Zone"
            readOnly={!canEdit}
          />
          <InputField
            label="Date"
            type="date"
            value={form.jsa_date}
            onChange={(v) => set("jsa_date", v)}
            readOnly={!canEdit}
          />
          <InputField
            label="Superintendent"
            value={form.superintendent_name}
            onChange={(v) => set("superintendent_name", v)}
            placeholder="Full name"
            readOnly={!canEdit}
          />
        </div>
      </Card>

      {/* 2 — Emergency Contacts */}
      <CollapsibleSection
        label="2 — Emergency Contacts"
        defaultOpen={false}
        summary={form.emergency_contacts.hospital_name ? form.emergency_contacts.hospital_name : "911 / tap to set hospital"}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <InputField label="Fire Department" value={form.emergency_contacts.fire} onChange={(v) => setEC("fire", v)} placeholder="911" readOnly={!canEdit} />
          <InputField label="Police" value={form.emergency_contacts.police} onChange={(v) => setEC("police", v)} placeholder="911" readOnly={!canEdit} />
          <InputField label="Nearest Hospital" value={form.emergency_contacts.hospital_name} onChange={(v) => setEC("hospital_name", v)} placeholder="Hospital name" readOnly={!canEdit} />
          <InputField label="Hospital Phone" value={form.emergency_contacts.hospital_phone} onChange={(v) => setEC("hospital_phone", v)} placeholder="(555) 000-0000" readOnly={!canEdit} />
          <InputField label="Nearest ER / Address" value={form.emergency_contacts.nearest_er} onChange={(v) => setEC("nearest_er", v)} placeholder="123 Main St, City, TX" className="sm:col-span-2" readOnly={!canEdit} />
        </div>
      </CollapsibleSection>

      {/* 3 — Hazard Identification */}
      <CollapsibleSection
        label="3 — Hazard Identification"
        defaultOpen={form.hazards.length > 0}
        summary={form.hazards.length > 0 ? `${form.hazards.length} selected` : "tap to select"}
      >
        <CheckboxGrid items={HAZARD_TYPES} selected={form.hazards} onChange={(v) => set("hazards", v)} readOnly={!canEdit} />
      </CollapsibleSection>

      {/* 4 — Required PPE */}
      <CollapsibleSection
        label="4 — Required PPE"
        defaultOpen={form.ppe.length > 0}
        summary={form.ppe.length > 0 ? `${form.ppe.length} selected` : "tap to select"}
      >
        <CheckboxGrid items={PPE_TYPES} selected={form.ppe} onChange={(v) => set("ppe", v)} readOnly={!canEdit} />
      </CollapsibleSection>

      {/* 5 — Work Steps / JHA */}
      <Card>
        <SectionLabel>5 — Job Hazard Analysis — Work Steps</SectionLabel>
        <div className="space-y-3">
          {form.work_steps.map((step, i) => (
            <div key={i} className="rounded-2xl border border-black/10 bg-slate-50 p-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  Step {i + 1}
                </span>
                {canEdit && form.work_steps.length > 1 && (
                  <button
                    onClick={() => removeStep(i)}
                    className="text-xs text-red-500 hover:text-red-700"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="grid gap-3">
                <TextareaField
                  label="Task Description"
                  value={step.description}
                  onChange={(v) => setStep(i, "description", v)}
                  placeholder="What is being done in this step?"
                  readOnly={!canEdit}
                />
                <TextareaField
                  label="Potential Hazards"
                  value={step.potential_hazards}
                  onChange={(v) => setStep(i, "potential_hazards", v)}
                  placeholder="What could go wrong?"
                  readOnly={!canEdit}
                />
                <TextareaField
                  label="Control Measures"
                  value={step.controls}
                  onChange={(v) => setStep(i, "controls", v)}
                  placeholder="How will hazards be controlled?"
                  readOnly={!canEdit}
                />
              </div>
            </div>
          ))}
          {canEdit && (
            <button
              onClick={addStep}
              className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-500 hover:text-slate-900"
            >
              + Add Step
            </button>
          )}
        </div>
      </Card>

      {/* 6 — Crew Acknowledgements */}
      <Card>
        <SectionLabel>6 — Crew Sign-Off</SectionLabel>
        <div className="space-y-2">
          {form.crew.map((member, i) => (
            <div
              key={i}
              className={`rounded-2xl border p-3 transition ${
                member.acknowledged
                  ? "border-emerald-200 bg-emerald-50"
                  : "border-black/10 bg-slate-50"
              }`}
            >
              {/* Name + company row */}
              <div className="mb-2 flex items-start gap-2">
                <div className="flex-1 grid gap-2 sm:grid-cols-3">
                  <InputField
                    value={member.name}
                    onChange={(v) => setCrew(i, "name", v)}
                    placeholder="Full name"
                    readOnly={!canEdit}
                  />
                  <InputField
                    value={member.company}
                    onChange={(v) => setCrew(i, "company", v)}
                    placeholder="Company"
                    readOnly={!canEdit}
                  />
                  <InputField
                    value={member.trade}
                    onChange={(v) => setCrew(i, "trade", v)}
                    placeholder="Trade"
                    readOnly={!canEdit}
                  />
                </div>
                {canEdit && form.crew.length > 1 && (
                  <button onClick={() => removeCrew(i)} className="mt-1 flex-shrink-0 text-xs text-red-400 hover:text-red-700">✕</button>
                )}
              </div>
              {/* Big sign-off button */}
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => canEdit && setCrew(i, "acknowledged", !member.acknowledged)}
                className={`w-full rounded-xl py-2.5 text-sm font-bold transition ${
                  member.acknowledged
                    ? "bg-emerald-600 text-white"
                    : canEdit
                    ? "border border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                    : "border border-slate-200 bg-slate-100 text-slate-400 cursor-not-allowed"
                }`}
              >
                {member.acknowledged ? "✓ Signed — JSA Reviewed" : "Tap to Sign / Acknowledge JSA"}
              </button>
            </div>
          ))}
          {canEdit && (
            <button
              onClick={addCrew}
              className="w-full rounded-2xl border border-dashed border-slate-300 py-3 text-sm font-semibold text-slate-500 transition hover:border-slate-500 hover:text-slate-900"
            >
              + Add Crew Member
            </button>
          )}
          {canEdit && (
            <p className="w-full text-center text-xs text-slate-400">
              Signatures are saved when you tap Save Draft or Submit below.
            </p>
          )}
        </div>
      </Card>

      {/* Actions */}
      <Card>
        <div className="flex flex-wrap gap-3">
          {canEdit && (
            <button
              onClick={() => onSave(form)}
              disabled={saving}
              className="rounded-2xl border border-black/10 bg-white px-5 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-50 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save Draft"}
            </button>
          )}
          {canSubmit && (
            <button
              onClick={() => onSubmit(form)}
              disabled={saving}
              className="rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-40"
            >
              {saving ? "Submitting…" : "Submit for Review"}
            </button>
          )}
          {canApprove && (
            <>
              <button
                onClick={onApprove}
                disabled={saving}
                className="rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-40"
              >
                {saving ? "…" : "Approve"}
              </button>
              <button
                onClick={onReject}
                disabled={saving}
                className="rounded-2xl bg-red-600 px-5 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {saving ? "…" : "Reject"}
              </button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function FormsPage() {
  const { projectId } = useParams();
  const apiBase = useMemo(() => getApiBase(), []);

  const [view, setView]           = useState("list"); // "list" | "form"
  const [activeJsa, setActiveJsa] = useState(null);   // null = new form

  const [jsaForms, setJsaForms]             = useState([]);
  const [me, setMe]                         = useState(null);
  const [projectName, setProjectName]       = useState("");
  const [projectLocation, setProjectLoc]   = useState("");
  const [loadError, setLoadError]           = useState("");
  const [saving, setSaving]                 = useState(false);
  const [actionError, setActionError]       = useState("");

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");
    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const d = await res.json();
        msg = d?.error || JSON.stringify(d);
      } catch {}
      throw new Error(msg);
    }
    return res.json();
  }

  async function loadForms() {
    const rows = await apiFetch(`/projects/${projectId}/jsa`);
    setJsaForms(Array.isArray(rows) ? rows : []);
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoadError("");
      try {
        const projects = await apiFetch(`/projects`);
        const p = projects.find((x) => x.id === projectId);
        if (p && !cancelled) {
          setProjectName(p.name || "");
          setProjectLoc(p.location || "");
        }
        const meRes = await apiFetch(`/projects/${projectId}/me`);
        if (cancelled) return;
        setMe(meRes);
        await loadForms();
      } catch (e) {
        if (cancelled) return;
        setLoadError(e?.message || "Failed to load");
      }
    }
    if (projectId) load();
    return () => { cancelled = true; };
  }, [projectId]);

  const total     = jsaForms.length;
  const submitted = jsaForms.filter((f) => f.status === "SUBMITTED").length;
  const approved  = jsaForms.filter((f) => f.status === "APPROVED").length;

  function openNew() {
    setActiveJsa(null);
    setActionError("");
    setView("form");
  }

  function openJsa(jsa) {
    setActiveJsa(jsa);
    setActionError("");
    setView("form");
  }

  function backToList() {
    setView("list");
    setActiveJsa(null);
    setActionError("");
    loadForms().catch(() => {});
  }

  async function handleSave(formData) {
    setSaving(true);
    setActionError("");
    try {
      if (activeJsa?.id) {
        await apiFetch(`/jsa/${activeJsa.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      } else {
        const created = await apiFetch(`/projects/${projectId}/jsa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        setActiveJsa(created);
      }
      await loadForms();
    } catch (e) {
      setActionError(e?.message || "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleSubmit(formData) {
    setSaving(true);
    setActionError("");
    try {
      let id = activeJsa?.id;
      if (!id) {
        const created = await apiFetch(`/projects/${projectId}/jsa`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
        id = created.id;
        setActiveJsa(created);
      } else {
        await apiFetch(`/jsa/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });
      }
      const updated = await apiFetch(`/jsa/${id}/submit`, { method: "POST" });
      setActiveJsa(updated);
      await loadForms();
    } catch (e) {
      setActionError(e?.message || "Submit failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleApprove() {
    setSaving(true);
    setActionError("");
    try {
      const updated = await apiFetch(`/jsa/${activeJsa.id}/approve`, { method: "POST" });
      setActiveJsa(updated);
      await loadForms();
    } catch (e) {
      setActionError(e?.message || "Approve failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleReject() {
    setSaving(true);
    setActionError("");
    try {
      const updated = await apiFetch(`/jsa/${activeJsa.id}/reject`, { method: "POST" });
      setActiveJsa(updated);
      await loadForms();
    } catch (e) {
      setActionError(e?.message || "Reject failed");
    } finally {
      setSaving(false);
    }
  }

  // ── JSA Form view ──────────────────────────────────────────────────────────

  if (view === "form") {
    return (
      <div className="space-y-4">
        <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />
        <JsaFormView
          jsa={activeJsa}
          me={me}
          saving={saving}
          actionError={actionError}
          onSave={handleSave}
          onSubmit={handleSubmit}
          onApprove={handleApprove}
          onReject={handleReject}
          onBack={backToList}
        />
      </div>
    );
  }

  // ── List view ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      <ProjectHeader projectName={projectName || "Project"} location={projectLocation || ""} />

      {loadError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {loadError}
        </div>
      ) : null}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard title="Total Forms" value={total} />
        <StatCard title="Pending Review" value={submitted} />
        <StatCard title="Approved" value={approved} />
      </div>

      {/* Form Templates Rolodex */}
      <Card>
        <SectionLabel>Form Templates</SectionLabel>
        <div className="grid gap-3 sm:grid-cols-2">
          {/* JSA */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">Job Safety Analysis</div>
                <div className="mt-0.5 text-xs text-slate-500">JSA / JHA</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Hazards, PPE, work steps, and crew acknowledgements before work begins.
            </p>
            <button
              onClick={openNew}
              className="mt-auto w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              + New JSA
            </button>
          </div>

          {/* Daily Work Report — links to daily log */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm font-bold text-slate-900">Daily Work Report</div>
                <div className="mt-0.5 text-xs text-slate-500">Field Log</div>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-slate-600">
              Notes, photos, and voice memos throughout the day. Compile into issues and schedule items at end of shift.
            </p>
            <a
              href={`/projects/${projectId}/daily-log`}
              className="mt-auto w-full rounded-xl bg-slate-900 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-slate-800"
            >
              Open Daily Log
            </a>
          </div>

        </div>
      </Card>

      {/* Submissions List */}
      <Card>
        <SectionLabel>JSA Submissions</SectionLabel>

        {jsaForms.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-12 text-center text-sm text-slate-400">
            No JSAs filed yet — create one from the templates above.
          </div>
        ) : (
          <div className="space-y-2">
            {jsaForms.map((jsa) => (
              <button
                key={jsa.id}
                onClick={() => openJsa(jsa)}
                className="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-left transition hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {jsa.work_description || "Job Safety Analysis"}
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      {jsa.work_location ? `${jsa.work_location} · ` : ""}
                      {prettyDate(jsa.jsa_date || jsa.created_at)}
                      {jsa.created_by_name ? ` · ${jsa.created_by_name}` : ""}
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(jsa.status)}`}
                  >
                    {jsa.status || "DRAFT"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
