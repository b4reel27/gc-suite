export function getToken() {
  // Prefer cookie (set by /api/login)
  if (typeof document !== "undefined") {
    const cookieToken =
      document.cookie
        .split("; ")
        .find((c) => c.startsWith("gc_token="))
        ?.split("=")[1] || "";

    if (cookieToken) return decodeURIComponent(cookieToken);

    // fallback (older code)
    const ls = localStorage.getItem("token") || "";
    if (ls) return ls;
  }

  return "";
}