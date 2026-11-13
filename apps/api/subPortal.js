import crypto from "crypto";

export function createSubToken(projectId, days = 7) {
  const exp = Date.now() + days * 86400000;
  const payload = Buffer.from(JSON.stringify({ projectId, exp })).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.JWT_SECRET || "dev").update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifySubToken(token) {
  try {
    const [payload, sig] = token.split(".");
    const expected = crypto.createHmac("sha256", process.env.JWT_SECRET || "dev").update(payload).digest("base64url");
    if (sig !== expected) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.exp < Date.now()) return null;
    return data;
  } catch { return null; }
}
