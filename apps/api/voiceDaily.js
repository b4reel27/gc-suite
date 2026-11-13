export async function draftDailyFromText({ text, weather, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const prompt = `Draft a construction daily log from this voice/text note. Extract:
- work_done (string)
- manpower (array of {trade, count})
- deliveries (array of strings)
- delays (array of strings)
- safety (string)
- weather_note (string, or use provided weather)

Note: ${text || ""}
Weather: ${weather || "unknown"}

Return ONLY a JSON object with those fields. No markdown.`;

  const result = await enqueueAI(async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 600 },
      }),
    });
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  });

  const match = result.match(/\{[\s\S]*\}/);
  if (!match) return {};
  try { return JSON.parse(match[0]); } catch { return {}; }
}
