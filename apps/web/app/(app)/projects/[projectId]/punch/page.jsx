"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ProjectHeader from "../../../../../components/ProjectHeader";
import PhotoMarkup from "../../../../../components/PhotoMarkup";

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

function isGcRole(role) {
  return String(role || "").toUpperCase().startsWith("GC");
}

function statusUpper(s) {
  return String(s || "").toUpperCase();
}

function prettyStatus(status) {
  return statusUpper(status).replaceAll("_", " ");
}

function statusBadgeClass(status) {
  const s = statusUpper(status);

  if (s === "OPEN") return "border-amber-200 bg-amber-50 text-amber-700";
  if (s === "IN_PROGRESS") return "border-blue-200 bg-blue-50 text-blue-700";
  if (s === "DONE") return "border-violet-200 bg-violet-50 text-violet-700";
  if (s === "VERIFIED") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (s === "CLOSED") return "border-slate-200 bg-slate-100 text-slate-700";

  return "border-slate-200 bg-slate-50 text-slate-700";
}

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
    <div className={`rounded-[28px] border border-black/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {children}
    </div>
  );
}

function getApiBase() {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;

  if (typeof window !== "undefined" && window?.location?.hostname) {
    return `http://${window.location.hostname}:3005`;
  }

  return "http://localhost:3005";
}

function cleanSpaces(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function titleCase(text) {
  return cleanSpaces(text)
    .split(" ")
    .map((w) => (w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

function detectTrade(note) {
  const lower = String(note || "").toLowerCase();

  const tradeMatchers = [
    { trade: "Paint", patterns: ["paint", "painting", "touch up", "touch-up"] },
    { trade: "Electrical", patterns: ["electrical", "electric", "outlet", "switch", "light", "fixture", "panel"] },
    { trade: "Plumbing", patterns: ["plumbing", "sink", "toilet", "faucet", "drain", "water line"] },
    { trade: "HVAC", patterns: ["hvac", "air", "thermostat", "diffuser", "duct", "vent", "rtu"] },
    { trade: "Drywall", patterns: ["drywall", "sheetrock", "mud", "tape", "texture"] },
    { trade: "Ceiling", patterns: ["ceiling", "grid", "tile"] },
    { trade: "Doors/Hardware", patterns: ["door", "frame", "hardware", "closer", "lockset", "panic"] },
    { trade: "Concrete", patterns: ["concrete", "slab", "sidewalk", "curb"] },
    { trade: "Flooring", patterns: ["floor", "tile floor", "lvt", "carpet", "base"] },
    { trade: "Glazing", patterns: ["glass", "glazing", "storefront", "window"] },
    { trade: "Millwork", patterns: ["cabinet", "millwork", "countertop"] },
    { trade: "Roofing", patterns: ["roof", "flashing", "coping"] },
    { trade: "Site", patterns: ["site", "grading", "striping", "sidewalk", "parking lot"] },
  ];

  for (const entry of tradeMatchers) {
    if (entry.patterns.some((p) => lower.includes(p))) {
      return entry.trade;
    }
  }

  return "";
}

function detectLocation(note) {
  const original = cleanSpaces(note);

  const directionalWall =
    /(north wall|south wall|east wall|west wall|front wall|rear wall|back wall)/i.exec(original);
  const roomMatch =
    /(room\s*[a-z0-9\-]+)/i.exec(original) ||
    /(rm\s*[a-z0-9\-]+)/i.exec(original);
  const knownAreaMatch =
    /(sales floor|entry|front entry|rear entry|corridor|hallway|restroom|office|break room|mechanical room|electrical room|vestibule|stock room)/i.exec(
      original
    );
  const elevationMatch =
    /(north elevation|south elevation|east elevation|west elevation|rear elevation|front elevation)/i.exec(
      original
    );

  const parts = [];
  if (roomMatch) parts.push(roomMatch[0]);
  if (knownAreaMatch) parts.push(knownAreaMatch[0]);
  if (directionalWall) parts.push(directionalWall[0]);
  if (elevationMatch) parts.push(elevationMatch[0]);

  if (parts.length) {
    return titleCase(parts.join(" - "));
  }

  return "";
}

function detectTitle(note, trade, location) {
  let text = cleanSpaces(note);
  if (!text) return "";

  let lowered = text.toLowerCase();

  const removable = [
    "room",
    "rm",
    "north wall",
    "south wall",
    "east wall",
    "west wall",
    "front wall",
    "rear wall",
    "back wall",
    "sales floor",
    "entry",
    "front entry",
    "rear entry",
    "corridor",
    "hallway",
    "restroom",
    "office",
    "break room",
    "mechanical room",
    "electrical room",
    "vestibule",
    "stock room",
    "north elevation",
    "south elevation",
    "east elevation",
    "west elevation",
    "rear elevation",
    "front elevation",
  ];

  if (trade) {
    lowered = lowered.replace(trade.toLowerCase(), "").trim();
  }

  for (const token of removable) {
    lowered = lowered.replace(token, " ").trim();
  }

  lowered = lowered.replace(/\broom\s*[a-z0-9\-]+\b/gi, " ").trim();
  lowered = lowered.replace(/\brm\s*[a-z0-9\-]+\b/gi, " ").trim();
  lowered = lowered.replace(/\s+/g, " ").trim();

  let title = lowered || text;
  title = title.replace(/^-+/, "").replace(/^-/, "").trim();

  if (!title) {
    title = trade ? `${trade} issue` : text;
  }

  if (trade && !title.toLowerCase().includes(trade.toLowerCase())) {
    title = `${trade} ${title}`.trim();
  }

  if (location && title.toLowerCase() === location.toLowerCase()) {
    title = trade ? `${trade} issue` : text;
  }

  return titleCase(title);
}

function parseQuickIssueNote(note) {
  const cleaned = cleanSpaces(note);
  const trade = detectTrade(cleaned);
  const location = detectLocation(cleaned);
  const title = detectTitle(cleaned, trade, location);

  return {
    title,
    trade,
    location,
  };
}

const fieldClass =
  "mt-1 w-full rounded-2xl border border-black/10 bg-white px-3 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 focus:ring-blue-100";

const labelClass = "text-xs font-semibold uppercase tracking-wide text-slate-500";

const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-50";

const primaryButtonClass =
  "inline-flex items-center justify-center rounded-2xl bg-[#0b1220] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#162033]";

export default function PunchPage() {
  const { projectId } = useParams();

  const [items, setItems] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [me, setMe] = useState(null);
  const [error, setError] = useState("");

  const [projectName, setProjectName] = useState("");
  const [projectLocation, setProjectLocation] = useState("");

  const [filter, setFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState("");

  const [newTitle, setNewTitle] = useState("");
  const [newTrade, setNewTrade] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [newCompanyId, setNewCompanyId] = useState("");

  const [quickNote, setQuickNote] = useState("");
  const [quickPhotoFile, setQuickPhotoFile] = useState(null);
  const [quickPhotoName, setQuickPhotoName] = useState("");

  // Photo markup state
  const [markupSrc, setMarkupSrc]         = useState(null); // data URL for markup
  const [markupTarget, setMarkupTarget]   = useState(null); // { issueId, inputEl } or "quick"
  const [quickParsingResult, setQuickParsingResult] = useState({
    title: "",
    trade: "",
    location: "",
  });
  const [quickAddBusy, setQuickAddBusy] = useState(false);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [uploading, setUploading] = useState({});
  const [savingStatus, setSavingStatus] = useState({});

  const [photoViewerOpen, setPhotoViewerOpen] = useState(false);
  const [photoViewerTitle, setPhotoViewerTitle] = useState("");
  const [photoViewerPhotos, setPhotoViewerPhotos] = useState([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);

  const [isMobile, setIsMobile] = useState(false);
  const [mobileEntryMode, setMobileEntryMode] = useState("quick");

  const apiBase = useMemo(() => getApiBase(), []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported =
      !!window.SpeechRecognition || !!window.webkitSpeechRecognition;
    setSpeechSupported(supported);

    const onResize = () => setIsMobile(window.innerWidth < 768);
    onResize();
    window.addEventListener("resize", onResize);

    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    setQuickParsingResult(parseQuickIssueNote(quickNote));
  }, [quickNote]);

  function fileUrl(filePath) {
    if (!filePath) return "";
    if (String(filePath).startsWith("http")) return filePath;
    return `${apiBase}${String(filePath).startsWith("/") ? "" : "/"}${filePath}`;
  }

  function getAssignedCompanyName(issue) {
    if (issue?.assigned_company_name) return issue.assigned_company_name;
    if (!issue?.assigned_company_id) return "";
    const match = companies.find((c) => c.id === issue.assigned_company_id);
    return match?.name || "";
  }

  async function apiFetch(path, opts = {}) {
    const token = getToken();

    if (!token) {
      throw new Error("Not logged in");
    }

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
        // ignore
      }

      throw new Error(msg);
    }

    if (ct.includes("application/json")) return res.json();
    return null;
  }

  async function refreshIssues() {
    const res = await apiFetch(`/projects/${projectId}/punch`);
    setItems(Array.isArray(res) ? res : res?.items || []);
  }

  async function loadProjectMeta() {
    try {
      const projects = await apiFetch(`/projects`);
      const p = Array.isArray(projects) ? projects.find((x) => x.id === projectId) : null;

      if (p) {
        setProjectName(p.name || "");
        setProjectLocation(p.location || "");
      }
    } catch {
      // non-fatal
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setError("");

      try {
        await loadProjectMeta();

        const [meRes, compRes] = await Promise.all([
          apiFetch(`/projects/${projectId}/me`),
          apiFetch(`/projects/${projectId}/companies`),
        ]);

        if (cancelled) return;

        setMe(meRes);
        setCompanies(Array.isArray(compRes) ? compRes : compRes?.items || []);

        await refreshIssues();
      } catch (e) {
        if (cancelled) return;
        setError(e?.message || "Error loading issues");
      }
    }

    if (projectId) load();

    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return (items || []).filter((it) => {
      const status = statusUpper(it.status);

      const statusOk = filter === "ALL" ? true : status === filter;
      const tradeOk = trade
        ? String(it.trade || "").toUpperCase() === trade.toUpperCase()
        : true;

      const qOk = q
        ? `${it.title || ""} ${it.location || ""} ${it.trade || ""} ${
            it.created_by_name || ""
          } ${it.assigned_company_name || ""}`
            .toLowerCase()
            .includes(q)
        : true;

      return statusOk && tradeOk && qOk;
    });
  }, [items, filter, query, trade]);

  const stats = useMemo(() => {
    const list = items || [];

    return {
      total: list.length,
      open: list.filter((it) => statusUpper(it.status) === "OPEN").length,
      inProgress: list.filter((it) => statusUpper(it.status) === "IN_PROGRESS").length,
      done: list.filter((it) => statusUpper(it.status) === "DONE").length,
      verified: list.filter((it) => statusUpper(it.status) === "VERIFIED").length,
      photos: list.reduce((sum, it) => sum + Number(it.photo_count || 0), 0),
    };
  }, [items]);

  const tradeOptions = useMemo(() => {
    const set = new Set();

    (items || []).forEach((it) => {
      if (it.trade) set.add(String(it.trade));
    });

    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  function applyQuickParseToForm() {
    setNewTitle(quickParsingResult.title || "");
    setNewTrade(quickParsingResult.trade || "");
    setNewLocation(quickParsingResult.location || "");
    if (isMobile) setMobileEntryMode("full");
  }

  async function startSpeechToText() {
    try {
      const SpeechRecognition =
        typeof window !== "undefined" &&
        (window.SpeechRecognition || window.webkitSpeechRecognition);

      if (!SpeechRecognition) {
        setError("Speech recognition is not supported on this device/browser.");
        return;
      }

      setError("");
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);

      recognition.onerror = (event) => {
        setIsListening(false);
        setError(event?.error ? `Speech error: ${event.error}` : "Speech recognition failed");
      };

      recognition.onresult = (event) => {
        const transcript = event?.results?.[0]?.[0]?.transcript || "";
        setQuickNote((prev) => cleanSpaces([prev, transcript].filter(Boolean).join(" ")));
      };

      recognition.start();
    } catch (e) {
      setIsListening(false);
      setError(e?.message || "Speech recognition failed");
    }
  }

  async function addIssue(e) {
    e.preventDefault();
    setError("");

    try {
      const payload = {
        title: newTitle,
        trade: newTrade || null,
        location: newLocation || null,
        assigned_company_id: newCompanyId || null,
      };

      const created = await apiFetch(`/projects/${projectId}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (created?.id) {
        setItems((prev) => [created, ...(prev || [])]);
        await refreshIssues();
      } else {
        await refreshIssues();
      }

      setNewTitle("");
      setNewTrade("");
      setNewLocation("");
      setNewCompanyId("");
    } catch (e2) {
      setError(e2?.message || "Error creating issue");
    }
  }

  async function quickCreateIssue() {
    setError("");

    const derivedTitle = quickParsingResult.title || cleanSpaces(quickNote);
    const derivedTrade = quickParsingResult.trade || "";
    const derivedLocation = quickParsingResult.location || "";

    if (!derivedTitle) {
      setError("Enter or speak a quick note first.");
      return;
    }

    setQuickAddBusy(true);

    try {
      const payload = {
        title: derivedTitle,
        trade: derivedTrade || null,
        location: derivedLocation || null,
        assigned_company_id: newCompanyId || null,
      };

      const created = await apiFetch(`/projects/${projectId}/punch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (created?.id && quickPhotoFile) {
        const fd = new FormData();
        fd.append("photo", quickPhotoFile);

        await apiFetch(`/punch/${created.id}/photo`, {
          method: "POST",
          body: fd,
        });
      }

      setQuickNote("");
      setQuickPhotoFile(null);
      setQuickPhotoName("");
      setQuickParsingResult({ title: "", trade: "", location: "" });

      await refreshIssues();
    } catch (e) {
      setError(e?.message || "Error creating quick issue");
    } finally {
      setQuickAddBusy(false);
    }
  }

  async function setStatus(issueId, actionPath) {
    setError("");
    setSavingStatus((m) => ({ ...(m || {}), [issueId]: true }));

    try {
      const updated = await apiFetch(`/punch/${issueId}/${actionPath}`, {
        method: "POST",
      });

      if (updated?.id) {
        setItems((prev) => prev.map((p) => (p.id === issueId ? updated : p)));
        await refreshIssues();
      } else {
        await refreshIssues();
      }
    } catch (e) {
      setError(e?.message || "Error updating status");
    } finally {
      setSavingStatus((m) => ({ ...(m || {}), [issueId]: false }));
    }
  }

  async function deleteIssue(issueId) {
    const ok = window.confirm("Delete this issue? This cannot be undone.");
    if (!ok) return;

    setError("");

    try {
      await apiFetch(`/punch/${issueId}`, { method: "DELETE" });
      setItems((prev) => (prev || []).filter((p) => p.id !== issueId));
    } catch (e) {
      setError(e?.message || "Error deleting issue");
    }
  }

  async function uploadPhotoBlob(issueId, blob, inputEl) {
    setError("");
    setUploading((m) => ({ ...(m || {}), [issueId]: true }));
    try {
      const fd = new FormData();
      fd.append("photo", blob, "photo.jpg");
      await apiFetch(`/punch/${issueId}/photo`, { method: "POST", body: fd });
      if (inputEl) inputEl.value = "";
      await refreshIssues();
    } catch (e) {
      setError(e?.message || "Error uploading photo");
    } finally {
      setUploading((m) => ({ ...(m || {}), [issueId]: false }));
    }
  }

  function uploadPhoto(issueId, file, inputEl) {
    if (!file) return;
    // Show markup tool first
    const reader = new FileReader();
    reader.onload = (ev) => {
      setMarkupSrc(ev.target.result);
      setMarkupTarget({ issueId, inputEl });
    };
    reader.readAsDataURL(file);
  }

  function onMarkupDone(blob) {
    const target = markupTarget;
    setMarkupSrc(null);
    setMarkupTarget(null);
    if (!target) return;
    if (target === "quick") {
      setQuickPhotoFile(blob);
    } else {
      uploadPhotoBlob(target.issueId, blob, target.inputEl);
    }
  }

  function onMarkupCancel() {
    // Upload original without markup — convert markupSrc data URL back to blob
    const target = markupTarget;
    const src    = markupSrc;
    setMarkupSrc(null);
    setMarkupTarget(null);
    if (!target || !src) return;
    fetch(src).then((r) => r.blob()).then((blob) => {
      if (target === "quick") {
        setQuickPhotoFile(blob);
      } else {
        uploadPhotoBlob(target.issueId, blob, target.inputEl);
      }
    });
  }

  async function openPhotoViewer(issueId, title) {
    setError("");
    setLoadingPhotos(true);
    setPhotoViewerOpen(true);
    setPhotoViewerTitle(title || "Issue Photos");
    setPhotoViewerPhotos([]);

    try {
      const photos = await apiFetch(`/punch/${issueId}/photos`);
      setPhotoViewerPhotos(Array.isArray(photos) ? photos : []);
    } catch (e) {
      setError(e?.message || "Error loading photos");
      setPhotoViewerPhotos([]);
    } finally {
      setLoadingPhotos(false);
    }
  }

  const iAmGC = isGcRole(me?.role);

  function canStart(status) {
    const s = statusUpper(status);
    return s === "OPEN";
  }

  function canDone(status) {
    const s = statusUpper(status);
    return s === "OPEN" || s === "IN_PROGRESS";
  }

  function canVerify(status) {
    const s = statusUpper(status);
    return s === "DONE";
  }

  function canClose(status) {
    const s = statusUpper(status);
    return s === "VERIFIED";
  }

  const showQuickAdd = iAmGC && (!isMobile || mobileEntryMode === "quick");
  const showFullForm = iAmGC && (!isMobile || mobileEntryMode === "full");

  // Photo markup overlay
  if (markupSrc) {
    return (
      <div className="space-y-4 p-1">
        <div className="text-base font-bold text-slate-900">Annotate Photo</div>
        <PhotoMarkup src={markupSrc} onDone={onMarkupDone} onCancel={onMarkupCancel} />
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-4 overflow-x-hidden">
      <ProjectHeader
        projectName={projectName || "Project"}
        location={projectLocation || ""}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-2xl">
            Field Issues
          </h1>
          {me?.role ? (
            <p className="mt-1 text-sm text-slate-500">
              Role: <span className="font-semibold text-slate-900">{me.role}</span>
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400">
              API: <span className="font-mono">{apiBase}</span>
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={refreshIssues}
          className={`${secondaryButtonClass} w-full sm:w-auto`}
        >
          Refresh
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        <StatCard title="Total" value={stats.total} />
        <StatCard title="Open" value={stats.open} />
        <StatCard title="In Progress" value={stats.inProgress} />
        <StatCard title="Done" value={stats.done} />
        <StatCard title="Verified" value={stats.verified} />
        <StatCard title="Photos" value={stats.photos} />
      </div>

      {iAmGC && isMobile ? (
        <Card className="p-3">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setMobileEntryMode("quick")}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mobileEntryMode === "quick"
                  ? "bg-[#0b1220] text-white"
                  : "border border-black/10 bg-white text-slate-700"
              }`}
            >
              Quick Add
            </button>

            <button
              type="button"
              onClick={() => setMobileEntryMode("full")}
              className={`rounded-2xl px-4 py-3 text-sm font-semibold transition ${
                mobileEntryMode === "full"
                  ? "bg-[#0b1220] text-white"
                  : "border border-black/10 bg-white text-slate-700"
              }`}
            >
              Full Form
            </button>
          </div>
        </Card>
      ) : null}

      {showQuickAdd ? (
        <Card>
          <div className="mb-4">
            <h2 className="text-lg font-bold text-slate-900">Quick Add Issue</h2>
            <p className="mt-1 text-sm text-slate-500">
              Speak or type a field note and let GC Suite prefill the issue.
            </p>
          </div>

          <div className="grid gap-3">
            <div>
              <label className={labelClass}>Quick Note</label>
              <textarea
                value={quickNote}
                onChange={(e) => setQuickNote(e.target.value)}
                rows={3}
                placeholder='Example: "Paint touch up north wall room 103"'
                className={fieldClass}
              />
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <label className={`${secondaryButtonClass} cursor-pointer`}>
                <span className="truncate">
                  {quickPhotoName ? `Photo: ${quickPhotoName}` : "Take / Add Photo"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setQuickPhotoFile(file);
                    setQuickPhotoName(file?.name || "");
                  }}
                />
              </label>

              <button
                type="button"
                onClick={startSpeechToText}
                disabled={!speechSupported || isListening}
                className={`${secondaryButtonClass} ${
                  !speechSupported || isListening ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {isListening ? "Listening..." : "🎤 Speak Issue"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setQuickNote("");
                  setQuickPhotoFile(null);
                  setQuickPhotoName("");
                  setQuickParsingResult({ title: "", trade: "", location: "" });
                }}
                className={secondaryButtonClass}
              >
                Clear
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-black/10 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Detected Title
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {quickParsingResult.title || "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Detected Trade
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {quickParsingResult.trade || "—"}
                </div>
              </div>

              <div className="rounded-2xl border border-black/10 bg-slate-50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Detected Location
                </div>
                <div className="mt-2 text-sm font-semibold text-slate-900">
                  {quickParsingResult.location || "—"}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={applyQuickParseToForm}
                className={`${secondaryButtonClass} w-full sm:w-auto`}
              >
                Apply to Full Form
              </button>

              <button
                type="button"
                onClick={quickCreateIssue}
                disabled={quickAddBusy}
                className={`${primaryButtonClass} w-full sm:w-auto ${
                  quickAddBusy ? "cursor-not-allowed opacity-50" : ""
                }`}
              >
                {quickAddBusy ? "Saving..." : "Save Quick Issue"}
              </button>
            </div>
          </div>
        </Card>
      ) : null}

      {showFullForm ? (
        <form onSubmit={addIssue}>
          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-bold text-slate-900">Add Field Issue</h2>
              <p className="mt-1 text-sm text-slate-500">
                Fast entry for supers and PMs in the field.
              </p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className={labelClass}>Title</label>
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Example: Caulk around windows at rear elevation"
                  required
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Trade</label>
                <input
                  value={newTrade}
                  onChange={(e) => setNewTrade(e.target.value)}
                  placeholder="Example: Finish / Glazing / Electrical"
                  className={fieldClass}
                />
              </div>

              <div>
                <label className={labelClass}>Location</label>
                <input
                  value={newLocation}
                  onChange={(e) => setNewLocation(e.target.value)}
                  placeholder="Example: Sales floor, north wall"
                  className={fieldClass}
                />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Assigned Company (optional)</label>
                <select
                  value={newCompanyId}
                  onChange={(e) => setNewCompanyId(e.target.value)}
                  className={fieldClass}
                >
                  <option value="">Unassigned</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex">
                <button type="submit" className={`${primaryButtonClass} w-full sm:w-auto`}>
                  + Add Issue
                </button>
              </div>
            </div>
          </Card>
        </form>
      ) : null}

      {!iAmGC ? (
        <Card className="text-sm text-slate-600">
          Field issues can be updated here, but only GC users can create new issues.
        </Card>
      ) : null}

      <Card>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900">Filter Issues</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className={labelClass}>Status</label>
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className={fieldClass}
            >
              <option value="ALL">ALL</option>
              <option value="OPEN">OPEN</option>
              <option value="IN_PROGRESS">IN PROGRESS</option>
              <option value="DONE">DONE</option>
              <option value="VERIFIED">VERIFIED</option>
              <option value="CLOSED">CLOSED</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Search</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search title, trade, location, creator..."
              className={fieldClass}
            />
          </div>

          <div>
            <label className={labelClass}>Trade Filter</label>
            <select
              value={trade}
              onChange={(e) => setTrade(e.target.value)}
              className={fieldClass}
            >
              <option value="">All Trades</option>
              {tradeOptions.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {filtered.map((it) => {
          const s = statusUpper(it.status);
          const photoCount = Number(it.photo_count || 0);
          const latestPhotoUrl = it.latest_photo_path ? fileUrl(it.latest_photo_path) : "";
          const assignedCompanyName = getAssignedCompanyName(it);

          return (
            <Card key={it.id}>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-bold text-slate-900">{it.title}</h3>
                      <span
                        className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClass(
                          s
                        )}`}
                      >
                        {prettyStatus(s)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-3">
                      <span>
                        Trade: <span className="font-semibold text-slate-900">{it.trade || "—"}</span>
                      </span>
                      <span>
                        Location:{" "}
                        <span className="font-semibold text-slate-900">{it.location || "—"}</span>
                      </span>
                      <span>
                        Created By:{" "}
                        <span className="font-semibold text-slate-900">
                          {it.created_by_name || "—"}
                        </span>
                      </span>
                      <span>
                        Photos: <span className="font-semibold text-slate-900">{photoCount}</span>
                      </span>
                      {assignedCompanyName ? (
                        <span>
                          Assigned:{" "}
                          <span className="font-semibold text-slate-900">{assignedCompanyName}</span>
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {iAmGC ? (
                    <div className="flex shrink-0">
                      <button
                        onClick={() => deleteIssue(it.id)}
                        className="inline-flex items-center justify-center rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                        type="button"
                      >
                        Delete
                      </button>
                    </div>
                  ) : null}
                </div>

                {latestPhotoUrl ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        window.open(latestPhotoUrl, "_blank", "noopener,noreferrer")
                      }
                      className="overflow-hidden rounded-2xl border border-black/10"
                      title="Open latest photo"
                    >
                      <img
                        src={latestPhotoUrl}
                        alt="Latest issue photo"
                        className="h-24 w-24 object-cover"
                      />
                    </button>

                    <button
                      type="button"
                      onClick={() => openPhotoViewer(it.id, it.title)}
                      className={secondaryButtonClass}
                    >
                      View Photos
                    </button>
                  </div>
                ) : photoCount > 0 ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => openPhotoViewer(it.id, it.title)}
                      className={secondaryButtonClass}
                    >
                      View Photos
                    </button>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-2">
                  <label className={`${secondaryButtonClass} cursor-pointer`}>
                    <span>{uploading[it.id] ? "Uploading..." : "Add Photo"}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={!!uploading[it.id]}
                      onChange={(e) =>
                        uploadPhoto(it.id, e.target.files?.[0], e.target)
                      }
                    />
                  </label>
                </div>

                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <button
                    onClick={() => setStatus(it.id, "start")}
                    disabled={!canStart(s) || !!savingStatus[it.id]}
                    className={`${secondaryButtonClass} ${
                      !canStart(s) || savingStatus[it.id] ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Start
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "complete")}
                    disabled={!canDone(s) || !!savingStatus[it.id]}
                    className={`${secondaryButtonClass} ${
                      !canDone(s) || savingStatus[it.id] ? "cursor-not-allowed opacity-40" : ""
                    }`}
                    type="button"
                  >
                    Done
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "verify")}
                    disabled={!iAmGC || !canVerify(s) || !!savingStatus[it.id]}
                    className={`${secondaryButtonClass} ${
                      !iAmGC || !canVerify(s) || savingStatus[it.id]
                        ? "cursor-not-allowed opacity-40"
                        : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Verify
                  </button>

                  <button
                    onClick={() => setStatus(it.id, "close")}
                    disabled={!iAmGC || !canClose(s) || !!savingStatus[it.id]}
                    className={`${primaryButtonClass} ${
                      !iAmGC || !canClose(s) || savingStatus[it.id]
                        ? "cursor-not-allowed opacity-40"
                        : ""
                    }`}
                    type="button"
                    title={!iAmGC ? "GC only" : ""}
                  >
                    Close
                  </button>
                </div>
              </div>
            </Card>
          );
        })}

        {!filtered.length ? (
          <Card className="text-sm text-slate-500">No issues match your filters.</Card>
        ) : null}
      </div>

      {photoViewerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-base font-bold text-slate-900">{photoViewerTitle}</div>
                <div className="text-xs text-slate-500">
                  {loadingPhotos ? "Loading photos..." : `${photoViewerPhotos.length} photo(s)`}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setPhotoViewerOpen(false)}
                className={secondaryButtonClass}
              >
                Close
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-4">
              {loadingPhotos ? (
                <div className="text-sm text-slate-600">Loading photos...</div>
              ) : photoViewerPhotos.length ? (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {photoViewerPhotos.map((photo) => {
                    const url = fileUrl(photo.file_path);

                    return (
                      <a
                        key={photo.id}
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="block overflow-hidden rounded-[24px] border border-black/10 bg-white transition hover:border-blue-300"
                      >
                        <img
                          src={url}
                          alt={photo.original_name || "Issue photo"}
                          className="h-48 w-full object-cover"
                        />
                        <div className="p-3">
                          <div className="truncate text-sm font-semibold text-slate-900">
                            {photo.original_name || "Photo"}
                          </div>
                          <div className="mt-1 text-xs text-slate-500">
                            {photo.created_at
                              ? new Date(photo.created_at).toLocaleString()
                              : ""}
                          </div>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                <div className="text-sm text-slate-600">No photos found for this issue.</div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}