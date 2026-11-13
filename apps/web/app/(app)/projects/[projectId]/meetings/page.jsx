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

/**
 * Format a date string as "Mon, Jun 1, 2026".
 * Handles date-only strings (YYYY-MM-DD) without timezone shift.
 */
function formatDate(dateStr) {
  if (!dateStr) return "—";
  const raw = String(dateStr).split("T")[0]; // strip time if present
  const parts = raw.split("-");
  if (parts.length === 3) {
    const [y, m, d] = parts.map(Number);
    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) {
      return new Date(y, m - 1, d).toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    }
  }
  const date = new Date(dateStr);
  if (isNaN(date)) return dateStr;
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
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
  "inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-100";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MEETING_TYPES = ["OAC", "Subcontractor", "Safety", "Kickoff", "Other"];

const ITEM_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"];

const EMPTY_MEETING_FORM = {
  title: "",
  meeting_type: "OAC",
  meeting_date: "",
  location: "",
  attendees: "",
  notes: "",
};

const EMPTY_ITEM_FORM = {
  topic: "",
  action_required: "",
  responsible_party: "",
  due_date: "",
};

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

function meetingTypeBadgeClass(type) {
  switch (String(type).toUpperCase()) {
    case "OAC":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "SUBCONTRACTOR":
      return "border-orange-200 bg-orange-50 text-orange-700";
    case "SAFETY":
      return "border-red-200 bg-red-50 text-red-700";
    case "KICKOFF":
      return "border-purple-200 bg-purple-50 text-purple-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function itemStatusBadgeClass(status) {
  switch (String(status || "").toUpperCase()) {
    case "OPEN":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "IN_PROGRESS":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "CLOSED":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    default:
      return "border-slate-200 bg-slate-100 text-slate-700";
  }
}

function nextItemStatus(status) {
  const s = String(status || "").toUpperCase();
  const idx = ITEM_STATUSES.indexOf(s);
  return ITEM_STATUSES[(idx + 1) % ITEM_STATUSES.length];
}

function prettyItemStatus(status) {
  return String(status || "").replace(/_/g, " ");
}

// ---------------------------------------------------------------------------
// Sub-components
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

function ChevronDown({ open }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      className={`h-5 w-5 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      viewBox="0 0 20 20"
      fill="currentColor"
    >
      <path
        fillRule="evenodd"
        d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
        clipRule="evenodd"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MeetingsPage() {
  const { projectId } = useParams();

  const [meetings, setMeetings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  // Expanded meeting id and its cached detail
  const [expandedId, setExpandedId] = useState(null);
  const [meetingDetails, setMeetingDetails] = useState({}); // { [id]: { ...meeting, items: [] } }
  const [loadingDetail, setLoadingDetail] = useState({}); // { [id]: bool }

  // New meeting form
  const [showNewForm, setShowNewForm] = useState(false);
  const [newForm, setNewForm] = useState(EMPTY_MEETING_FORM);
  const [savingMeeting, setSavingMeeting] = useState(false);

  // Action item form — keyed by meeting id
  const [addItemFor, setAddItemFor] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM_FORM);
  const [savingItem, setSavingItem] = useState(false);

  // Per-item operation flags
  const [togglingItem, setTogglingItem] = useState({});
  const [deletingItem, setDeletingItem] = useState({});
  const [deletingMeeting, setDeletingMeeting] = useState({});

  const apiBase = useMemo(() => getApiBase(), []);

  // -------------------------------------------------------------------------
  // API helper
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

  // -------------------------------------------------------------------------
  // Load helpers
  // -------------------------------------------------------------------------

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

  async function loadMeetings() {
    setLoading(true);
    setError("");
    try {
      await fetchProjectMeta();
      const data = await apiFetch(`/projects/${projectId}/meetings`);
      setMeetings(Array.isArray(data) ? data : data?.items || []);
    } catch (e) {
      setError(e?.message || "Error loading meetings");
    } finally {
      setLoading(false);
    }
  }

  async function loadMeetingDetail(id) {
    setLoadingDetail((prev) => ({ ...prev, [id]: true }));
    try {
      const detail = await apiFetch(`/meeting/${id}`);
      setMeetingDetails((prev) => ({ ...prev, [id]: detail }));
    } catch (e) {
      setError(e?.message || "Error loading meeting details");
    } finally {
      setLoadingDetail((prev) => ({ ...prev, [id]: false }));
    }
  }

  useEffect(() => {
    if (projectId) loadMeetings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  // -------------------------------------------------------------------------
  // Derived state
  // -------------------------------------------------------------------------

  const sortedMeetings = useMemo(
    () =>
      [...meetings].sort((a, b) => {
        const da = new Date(a.meeting_date || 0);
        const db = new Date(b.meeting_date || 0);
        return db - da; // newest first
      }),
    [meetings]
  );

  // -------------------------------------------------------------------------
  // Handlers — meetings
  // -------------------------------------------------------------------------

  async function toggleExpanded(id) {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    // Fetch detail if not already cached
    if (!meetingDetails[id]) {
      await loadMeetingDetail(id);
    }
  }

  async function handleNewMeeting(e) {
    e.preventDefault();
    setSavingMeeting(true);
    setError("");
    try {
      await apiFetch(`/projects/${projectId}/meetings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newForm),
      });
      setNewForm(EMPTY_MEETING_FORM);
      setShowNewForm(false);
      await loadMeetings();
    } catch (e2) {
      setError(e2?.message || "Error creating meeting");
    } finally {
      setSavingMeeting(false);
    }
  }

  async function handleDeleteMeeting(id) {
    if (!window.confirm("Delete this meeting and all its action items? This cannot be undone."))
      return;
    setDeletingMeeting((prev) => ({ ...prev, [id]: true }));
    setError("");
    try {
      await apiFetch(`/meeting/${id}`, { method: "DELETE" });
      setMeetings((prev) => prev.filter((m) => m.id !== id));
      if (expandedId === id) setExpandedId(null);
      setMeetingDetails((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (e2) {
      setError(e2?.message || "Error deleting meeting");
    } finally {
      setDeletingMeeting((prev) => ({ ...prev, [id]: false }));
    }
  }

  // -------------------------------------------------------------------------
  // Handlers — action items
  // -------------------------------------------------------------------------

  async function handleAddItem(e, meetingId) {
    e.preventDefault();
    setSavingItem(true);
    setError("");
    try {
      await apiFetch(`/meeting/${meetingId}/items`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itemForm),
      });
      setItemForm(EMPTY_ITEM_FORM);
      setAddItemFor(null);
      // Refresh the detail to get the new item
      await loadMeetingDetail(meetingId);
      // Also refresh the list to update the open_items count
      const data = await apiFetch(`/projects/${projectId}/meetings`);
      setMeetings(Array.isArray(data) ? data : data?.items || []);
    } catch (e2) {
      setError(e2?.message || "Error adding action item");
    } finally {
      setSavingItem(false);
    }
  }

  async function handleToggleItemStatus(item, meetingId) {
    setTogglingItem((prev) => ({ ...prev, [item.id]: true }));
    setError("");
    try {
      const newStatus = nextItemStatus(item.status);
      await apiFetch(`/meeting-item/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      // Update item in the cached detail
      setMeetingDetails((prev) => {
        const detail = prev[meetingId];
        if (!detail) return prev;
        return {
          ...prev,
          [meetingId]: {
            ...detail,
            items: (detail.items || []).map((it) =>
              it.id === item.id ? { ...it, status: newStatus } : it
            ),
          },
        };
      });
      // Update the open_items count on the meeting card
      setMeetings((prev) =>
        prev.map((m) => {
          if (m.id !== meetingId) return m;
          const prevStatus = String(item.status || "").toUpperCase();
          const wasOpen = prevStatus === "OPEN" || prevStatus === "IN_PROGRESS";
          const isNowOpen =
            newStatus === "OPEN" || newStatus === "IN_PROGRESS";
          let delta = 0;
          if (wasOpen && !isNowOpen) delta = -1;
          if (!wasOpen && isNowOpen) delta = 1;
          return { ...m, open_items: Math.max(0, (m.open_items || 0) + delta) };
        })
      );
    } catch (e2) {
      setError(e2?.message || "Error updating action item status");
    } finally {
      setTogglingItem((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  async function handleDeleteItem(itemId, meetingId) {
    if (!window.confirm("Delete this action item?")) return;
    setDeletingItem((prev) => ({ ...prev, [itemId]: true }));
    setError("");
    try {
      await apiFetch(`/meeting-item/${itemId}`, { method: "DELETE" });
      // Remove from cached detail
      setMeetingDetails((prev) => {
        const detail = prev[meetingId];
        if (!detail) return prev;
        const removedItem = (detail.items || []).find((it) => it.id === itemId);
        const removedWasOpen =
          removedItem &&
          (String(removedItem.status || "").toUpperCase() === "OPEN" ||
            String(removedItem.status || "").toUpperCase() === "IN_PROGRESS");
        // Update the meeting open count
        if (removedWasOpen) {
          setMeetings((pm) =>
            pm.map((m) =>
              m.id === meetingId
                ? { ...m, open_items: Math.max(0, (m.open_items || 0) - 1) }
                : m
            )
          );
        }
        return {
          ...prev,
          [meetingId]: {
            ...detail,
            items: (detail.items || []).filter((it) => it.id !== itemId),
          },
        };
      });
    } catch (e2) {
      setError(e2?.message || "Error deleting action item");
    } finally {
      setDeletingItem((prev) => ({ ...prev, [itemId]: false }));
    }
  }

  // -------------------------------------------------------------------------
  // Render helpers
  // -------------------------------------------------------------------------

  function renderActionItemsSection(meeting) {
    const detail = meetingDetails[meeting.id];
    const items = detail?.items || [];
    const isLoadingDetail = !!loadingDetail[meeting.id];
    const showItemForm = addItemFor === meeting.id;

    return (
      <div className="mt-4 space-y-4 border-t border-slate-100 pt-4">
        {/* Attendees */}
        {detail?.attendees && (
          <div>
            <div className={labelClass}>Attendees</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {detail.attendees}
            </p>
          </div>
        )}

        {/* Notes */}
        {detail?.notes && (
          <div>
            <div className={labelClass}>Notes</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {detail.notes}
            </p>
          </div>
        )}

        {/* Action Items */}
        <div>
          <div className="flex items-center justify-between">
            <div className={labelClass}>Action Items</div>
            <button
              type="button"
              onClick={() => {
                if (showItemForm) {
                  setAddItemFor(null);
                } else {
                  setAddItemFor(meeting.id);
                  setItemForm(EMPTY_ITEM_FORM);
                }
              }}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              {showItemForm ? "Cancel" : "+ Add Action Item"}
            </button>
          </div>

          {/* Add item mini-form */}
          {showItemForm && (
            <form
              onSubmit={(e) => handleAddItem(e, meeting.id)}
              className="mt-3 rounded-2xl border border-black/10 bg-slate-50 p-3"
            >
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelClass}>Topic *</label>
                  <input
                    value={itemForm.topic}
                    onChange={(e) =>
                      setItemForm((prev) => ({ ...prev, topic: e.target.value }))
                    }
                    required
                    placeholder="Topic"
                    className={fieldClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelClass}>Action Required</label>
                  <input
                    value={itemForm.action_required}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        action_required: e.target.value,
                      }))
                    }
                    placeholder="What needs to be done?"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Responsible Party</label>
                  <input
                    value={itemForm.responsible_party}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        responsible_party: e.target.value,
                      }))
                    }
                    placeholder="Name or company"
                    className={fieldClass}
                  />
                </div>

                <div>
                  <label className={labelClass}>Due Date</label>
                  <input
                    type="date"
                    value={itemForm.due_date}
                    onChange={(e) =>
                      setItemForm((prev) => ({
                        ...prev,
                        due_date: e.target.value,
                      }))
                    }
                    className={fieldClass}
                  />
                </div>

                <div className="sm:col-span-2">
                  <button
                    type="submit"
                    disabled={savingItem}
                    className={`${primaryButtonClass} ${savingItem ? "opacity-50 cursor-not-allowed" : ""}`}
                  >
                    {savingItem ? "Saving…" : "Add Item"}
                  </button>
                </div>
              </div>
            </form>
          )}

          {isLoadingDetail ? (
            <p className="mt-2 text-sm text-slate-400">Loading…</p>
          ) : items.length === 0 ? (
            <p className="mt-2 text-sm text-slate-400">
              No action items. Add one above.
            </p>
          ) : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Topic
                    </th>
                    <th className="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Action Required
                    </th>
                    <th className="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Responsible
                    </th>
                    <th className="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Due
                    </th>
                    <th className="pb-2 pr-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-400">
                      Status
                    </th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-slate-50 last:border-0"
                    >
                      <td className="py-2 pr-3 font-medium text-slate-900">
                        {item.topic || "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {item.action_required || "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {item.responsible_party || "—"}
                      </td>
                      <td className="py-2 pr-3 text-slate-600">
                        {formatDate(item.due_date)}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          onClick={() =>
                            handleToggleItemStatus(item, meeting.id)
                          }
                          disabled={!!togglingItem[item.id]}
                          title="Click to advance status"
                          className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition hover:opacity-80 ${itemStatusBadgeClass(
                            item.status
                          )} ${togglingItem[item.id] ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
                        >
                          {prettyItemStatus(item.status)}
                        </button>
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleDeleteItem(item.id, meeting.id)
                          }
                          disabled={!!deletingItem[item.id]}
                          className={`${dangerButtonClass} ${deletingItem[item.id] ? "opacity-50 cursor-not-allowed" : ""}`}
                          title="Delete action item"
                        >
                          <TrashIcon />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
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
          Meetings
        </h1>
        <button
          type="button"
          onClick={() => setShowNewForm((v) => !v)}
          className={primaryButtonClass}
        >
          {showNewForm ? "Cancel" : "+ New Meeting"}
        </button>
      </div>

      {/* Error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* New meeting form */}
      {showNewForm && (
        <form onSubmit={handleNewMeeting}>
          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">New Meeting</h2>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Title *</label>
                <input
                  value={newForm.title}
                  onChange={(e) =>
                    setNewForm((prev) => ({ ...prev, title: e.target.value }))
                  }
                  required
                  placeholder="Meeting title"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Type</label>
                <select
                  value={newForm.meeting_type}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      meeting_type: e.target.value,
                    }))
                  }
                  className={fieldClass}
                >
                  {MEETING_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={labelClass}>Date *</label>
                <input
                  type="date"
                  value={newForm.meeting_date}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      meeting_date: e.target.value,
                    }))
                  }
                  required
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Location</label>
                <input
                  value={newForm.location}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      location: e.target.value,
                    }))
                  }
                  placeholder="e.g. Conference Room A, Job Site"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Attendees</label>
                <textarea
                  value={newForm.attendees}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      attendees: e.target.value,
                    }))
                  }
                  rows={2}
                  placeholder="List attendees, one per line or comma-separated…"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Notes</label>
                <textarea
                  value={newForm.notes}
                  onChange={(e) =>
                    setNewForm((prev) => ({
                      ...prev,
                      notes: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Meeting notes, agenda, discussion items…"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2 flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={savingMeeting}
                  className={`${primaryButtonClass} ${savingMeeting ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  {savingMeeting ? "Saving…" : "Create Meeting"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowNewForm(false)}
                  className={secondaryButtonClass}
                >
                  Cancel
                </button>
              </div>
            </div>
          </Card>
        </form>
      )}

      {/* Meetings list — mobile cards */}
      <div className="md:hidden">
        {loading ? (
          <Card className="text-sm text-slate-500">Loading meetings…</Card>
        ) : sortedMeetings.length === 0 ? (
          <Card className="text-sm text-slate-500">
            No meetings yet. Click "+ New Meeting" to create one.
          </Card>
        ) : (
          <div className="space-y-3">
            {sortedMeetings.map((meeting) => {
              const isExpanded = expandedId === meeting.id;
              const isDeleting = !!deletingMeeting[meeting.id];
              const openCount = meeting.open_items ?? 0;

              return (
                <div
                  key={meeting.id}
                  className="rounded-[28px] border border-black/10 bg-white shadow-sm"
                >
                  {/* Card header — click to expand */}
                  <button
                    type="button"
                    onClick={() => toggleExpanded(meeting.id)}
                    className="w-full rounded-[28px] p-4 text-left transition hover:bg-slate-50 focus:outline-none sm:p-5"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* Meeting type badge */}
                          <span
                            className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${meetingTypeBadgeClass(
                              meeting.meeting_type
                            )}`}
                          >
                            {meeting.meeting_type || "Other"}
                          </span>

                          {/* Open items badge */}
                          {openCount > 0 && (
                            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                              {openCount} open {openCount === 1 ? "item" : "items"}
                            </span>
                          )}
                        </div>

                        <div className="mt-1.5 font-bold text-slate-900">
                          {meeting.title}
                        </div>

                        <div className="mt-0.5 flex flex-wrap gap-3 text-sm text-slate-500">
                          <span>{formatDate(meeting.meeting_date)}</span>
                          {meeting.location && <span>{meeting.location}</span>}
                        </div>
                      </div>

                      <ChevronDown open={isExpanded} />
                    </div>
                  </button>

                  {/* Expanded body */}
                  {isExpanded && (
                    <div className="border-t border-slate-100 px-4 pb-4 sm:px-5 sm:pb-5">
                      {renderActionItemsSection(meeting)}

                      {/* Delete meeting */}
                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleDeleteMeeting(meeting.id)}
                          disabled={isDeleting}
                          className={`inline-flex items-center gap-1.5 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100 ${isDeleting ? "opacity-50 cursor-not-allowed" : ""}`}
                        >
                          <TrashIcon />
                          {isDeleting ? "Deleting…" : "Delete Meeting"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Meetings list — desktop table */}
      <div className="hidden md:block">
        <div className="overflow-hidden rounded-2xl border border-slate-200 shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                {["Date", "Type", "Title", "Location", ""].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {loading ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">Loading meetings…</td></tr>
              ) : sortedMeetings.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">No meetings yet.</td></tr>
              ) : sortedMeetings.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setExpandedId(expandedId === m.id ? null : m.id)}>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    {m.meeting_date ? formatDate(m.meeting_date) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full border border-slate-200 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">{m.meeting_type || "—"}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-900">{m.title || "Untitled"}</td>
                  <td className="px-4 py-3 text-slate-600">{m.location || "—"}</td>
                  <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                    <button type="button" onClick={() => handleDeleteMeeting(m.id)} className="rounded-lg border border-red-100 bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-100">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
