"use client";

import { useEffect } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export default function SwRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .then(async (reg) => {
        // ── Push subscription ───────────────────────────────────────
        const token = localStorage.getItem("token");
        if (!token || !("PushManager" in window)) return;

        // Fetch VAPID public key from API
        let vapidKey = "";
        try {
          const r = await fetch(`${API_URL}/push/vapid-key`);
          if (r.ok) {
            const d = await r.json();
            vapidKey = d.key || d.publicKey || "";
          }
        } catch {}
        if (!vapidKey) return;

        // Request permission (silently skip if denied)
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        // Subscribe if not already
        let sub = await reg.pushManager.getSubscription();
        if (!sub) {
          try {
            sub = await reg.pushManager.subscribe({
              userVisibleOnly:      true,
              applicationServerKey: urlBase64ToUint8Array(vapidKey),
            });
          } catch {
            return;
          }
        }

        // Send subscription to server
        const subJson = sub.toJSON();
        await fetch(`${API_URL}/push/subscribe`, {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            endpoint: subJson.endpoint,
            p256dh:   subJson.keys?.p256dh,
            auth:     subJson.keys?.auth,
          }),
        }).catch(() => {});
      })
      .catch(() => {});
  }, []);

  return null;
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64  = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw     = atob(base64);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}
