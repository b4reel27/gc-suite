export function getToken() {
  return typeof localStorage !== "undefined" ? localStorage.getItem("token") || "" : "";
}

export function clearSession() {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }
  // Clear auth cookies
  document.cookie = "gc_auth=;path=/;max-age=0";
  document.cookie = "gc_token=;path=/;max-age=0";
}

/**
 * Fetch wrapper that attaches the Bearer token and handles 401 by
 * clearing the session and redirecting to /login.
 */
export async function apiFetch(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401) {
    clearSession();
    // Redirect to login preserving the current path
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    // Throw so callers don't process the response
    throw new Error("Session expired — please sign in again");
  }

  return res;
}
