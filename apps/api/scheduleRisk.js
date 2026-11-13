export async function checkScheduleRisk({ submittals, rfis, scheduleItems, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { alerts: [] };

  const prompt = `You are a construction scheduler. Given these open items and schedule activities, identify risks.

Open submittals: ${JSON.stringify((submittals || []).slice(0, 10))}
Open RFIs: ${JSON.stringify((rfis || []).slice(0, 10))}
Schedule: ${JSON.stringify((scheduleItems || []).slice(0, 15))}

Return ONLY a JSON array of alerts. Each:
- severity ("high" | "medium" | "low")
- message (string, e.g. "Storefront submittal late -> dry-in 12/18 at risk")
- related (string, optional)

Only include real risks. No markdown.`;

  try {
    const result = await enqueueAI(async () => {
      const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 800 },
        }),
      });
      const data = await r.json();
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
    });
    const match = result.match(/\[[\s\S]*\]/);
    return { alerts: match ? JSON.parse(match[0]) : [] };
  } catch {
    return { alerts: [] };
  }
}
