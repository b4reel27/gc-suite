"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Style constants (match punch/page.jsx)
// ---------------------------------------------------------------------------

const fieldClass =
  "mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const labelClass =
  "text-xs font-semibold uppercase tracking-wide text-slate-500";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#162033]";

const dangerButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TRADES = [
  "General",
  "Electrical",
  "Plumbing",
  "HVAC",
  "Drywall",
  "Concrete",
  "Flooring",
  "Paint",
  "Ceiling",
  "Doors/Hardware",
  "Glazing",
  "Millwork",
  "Roofing",
  "Site",
  "Framing",
  "Steel",
  "Masonry",
];

const EMPTY_FORM = {
  name: "",
  company: "",
  role: "",
  trade: "",
  phone: "",
  email: "",
  notes: "",
};

// ---------------------------------------------------------------------------
// Sub-components (defined outside default export to avoid re-mount on render)
// ---------------------------------------------------------------------------

function Card({ children, className = "" }) {
  return (
    <div
      className={`rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      {children}
    </div>
  );
}

function PhoneIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
    </svg>
  );
}

function EmailIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4 shrink-0"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className="h-4 w-4"
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function ContactFormCard({ title, formData, onChangeField, onSubmit, onCancel, saving }) {
  return (
    <form onSubmit={onSubmit}>
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className={labelClass}>Name *</label>
            <input
              value={formData.name}
              onChange={(e) => onChangeField("name", e.target.value)}
              required
              placeholder="Full name"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Company</label>
            <input
              value={formData.company}
              onChange={(e) => onChangeField("company", e.target.value)}
              placeholder="Company name"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Role</label>
            <input
              value={formData.role}
              onChange={(e) => onChangeField("role", e.target.value)}
              placeholder="e.g. Project Manager"
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Trade</label>
            <select
              value={formData.trade}
              onChange={(e) => onChangeField("trade", e.target.value)}
              className={fieldClass}
            >
              <option value="">Select trade</option>
              {TRADES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Phone</label>
            <input
              type="tel"
              value={formData.phone}
              onChange={(e) => onChangeField("phone", e.target.value)}
              placeholder="(555) 000-0000"
              className={fieldClass}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Email</label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => onChangeField("email", e.target.value)}
              placeholder="name@example.com"
              className={fieldClass}
            />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => onChangeField("notes", e.target.value)}
              rows={2}
              placeholder="Any additional notes..."
              className={fieldClass}
            />
          </div>

          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              disabled={saving}
              className={`${primaryButtonClass} ${saving ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {saving ? "Saving…" : "Save Contact"}
            </button>
            {onCancel && (
              <button type="button" onClick={onCancel} className={secondaryButtonClass}>
                Cancel
              </button>
            )}
          </div>
        </div>
      </Card>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function DirectoryPage() {
  const { projectId } = useParams();

  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  const [query, setQuery] = useState("");

  // Add form
  const [showAdd, setShowAdd] = useState(false);
  const [addForm, setAddForm] = useState(EMPTY_FORM);
  const [addSaving, setAddSaving] = useState(false);

  // Edit form
  const [editId, setEditId] = useState(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [editSaving, setEditSaving] = useState(false);

  const apiBase = useMemo(() => getApiBase(), []);

  // -------------------------------------------------------------------------
  // API
  // -------------------------------------------------------------------------

  async function apiFetch(path, opts = {}) {
    const token = getToken();
    if (!token) throw new Error("Not logged in");

    const res = await fetch(`${apiBase}${path}`, {
      ...opts,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.headers || {}),
      },
    });

    const ct = res.headers.get("content-type") || "";

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        if (ct.includes("application/json")) {
          const data = await res.json();
          msg = data?.error || JSON.stringify(data);
        } else {
          const txt = await res.text();
          if (txt) msg = txt;
        }
      } catch {
        // ignore parse errors
      }
      throw new Error(msg);
    }

    if (ct.includes("application/json")) return res.json();
    return null;
  }

  async function fetchProjectMeta() {
    try {
      const projects = await apiFetch("/projects");
      const p = Array.isArray(projects)
        ? projects.find((x) => x.id === projectId)
        : null;
      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {
      // non-fatal
    }
  }

  async function loadContacts() {
    setLoading(true);
    setError("");
    try {
      await fetchProjectMeta();
      const data = await apiFetch(`/projects/${projectId}/contacts`);
      setContacts(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      setError(e?.message || "Error loading contacts");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (projectId) loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      `${c.name || ""} ${c.company || ""} ${c.trade || ""}`
        .toLowerCase()
        .includes(q)
    );
  }, [contacts, query]);

  // Group by company, sort companies A-Z (blanks last)
  const grouped = useMemo(() => {
    const map = new Map();
    for (const c of filtered) {
      const key = c.company?.trim() || "—";
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(c);
    }
    return Array.from(map.entries()).sort(([a], [b]) => {
      if (a === "—") return 1;
      if (b === "—") return -1;
      return a.localeCompare(b);
    });
  }, [filtered]);

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  function patchForm(prev, field, value) {
    return { ...prev, [field]: value };
  }

  async function handleAdd(e) {
    e.preventDefault();
    setAddSaving(true);
    setError("");
    try {
      await apiFetch(`/projects/${projectId}/contacts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(addForm),
      });
      setAddForm(EMPTY_FORM);
      setShowAdd(false);
      await loadContacts();
    } catch (e2) {
      setError(e2?.message || "Error adding contact");
    } finally {
      setAddSaving(false);
    }
  }

  function startEdit(contact) {
    setShowAdd(false);
    setEditId(contact.id);
    setEditForm({
      name: contact.name || "",
      company: contact.company || "",
      role: contact.role || "",
      trade: contact.trade || "",
      phone: contact.phone || "",
      email: contact.email || "",
      notes: contact.notes || "",
    });
  }

  async function handleEdit(e) {
    e.preventDefault();
    setEditSaving(true);
    setError("");
    try {
      await apiFetch(`/contact/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      setEditId(null);
      await loadContacts();
    } catch (e2) {
      setError(e2?.message || "Error updating contact");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this contact? This cannot be undone.")) return;
    setError("");
    try {
      await apiFetch(`/contact/${id}`, { method: "DELETE" });
      setContacts((prev) => prev.filter((c) => c.id !== id));
    } catch (e2) {
      setError(e2?.message || "Error deleting contact");
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <ProjectHeader
        projectName={projectName || "Project"}
        location={projectLocation || ""}
      />

      {/* Page header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
          Directory
        </h1>
        <button
          type="button"
          onClick={() => {
            setShowAdd((v) => !v);
            setEditId(null);
          }}
          className={primaryButtonClass}
        >
          {showAdd ? "Cancel" : "+ Add Contact"}
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Search bar */}
      <div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, company, or trade…"
          className={fieldClass}
          style={{ marginTop: 0 }}
        />
      </div>

      {/* Add contact form */}
      {showAdd && (
        <ContactFormCard
          title="Add Contact"
          formData={addForm}
          onChangeField={(field, value) =>
            setAddForm((prev) => patchForm(prev, field, value))
          }
          onSubmit={handleAdd}
          onCancel={() => setShowAdd(false)}
          saving={addSaving}
        />
      )}

      {/* List */}
      {loading ? (
        <Card className="text-sm text-slate-500">Loading contacts…</Card>
      ) : grouped.length === 0 ? (
        <Card className="text-sm text-slate-500">
          {query
            ? "No contacts match your search."
            : 'No contacts yet. Click "+ Add Contact" to get started.'}
        </Card>
      ) : (
        <div className="space-y-6">
          {grouped.map(([company, members]) => (
            <div key={company}>
              {/* Company header */}
              <div className="mb-2 px-1 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                {company}
              </div>

              <div className="space-y-3">
                {members.map((c) => {
                  // Edit mode: replace the card with an inline form
                  if (editId === c.id) {
                    return (
                      <ContactFormCard
                        key={c.id}
                        title="Edit Contact"
                        formData={editForm}
                        onChangeField={(field, value) =>
                          setEditForm((prev) => patchForm(prev, field, value))
                        }
                        onSubmit={handleEdit}
                        onCancel={() => setEditId(null)}
                        saving={editSaving}
                      />
                    );
                  }

                  return (
                    <Card key={c.id}>
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        {/* Contact info */}
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-900">
                            {c.name}
                          </div>

                          {(c.role || c.trade) && (
                            <div className="mt-0.5 text-sm text-slate-500">
                              {[c.role, c.trade].filter(Boolean).join(" · ")}
                            </div>
                          )}

                          <div className="mt-2 flex flex-wrap gap-4 text-sm">
                            {c.phone && (
                              <a
                                href={`tel:${c.phone}`}
                                className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                              >
                                <PhoneIcon />
                                {c.phone}
                              </a>
                            )}
                            {c.email && (
                              <a
                                href={`mailto:${c.email}`}
                                className="inline-flex items-center gap-1.5 text-blue-600 hover:underline"
                              >
                                <EmailIcon />
                                {c.email}
                              </a>
                            )}
                          </div>

                          {c.notes && (
                            <div className="mt-2 text-sm text-slate-500">
                              {c.notes}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex shrink-0 gap-2">
                          <button
                            type="button"
                            onClick={() => startEdit(c)}
                            className={secondaryButtonClass}
                            title="Edit contact"
                          >
                            <PencilIcon />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(c.id)}
                            className={dangerButtonClass}
                            title="Delete contact"
                          >
                            <TrashIcon />
                          </button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
