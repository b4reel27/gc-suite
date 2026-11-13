export async function extractBidDeadlines({ text, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const prompt = `Extract every pre-bid deadline from this ITB / general conditions / Division 00-01 text.

Text:
${(text || "").slice(0, 6000)}

Return ONLY a JSON array. Each item:
- title (string, e.g. "Bid Date", "Pre-bid Meeting", "RFI Cutoff", "Substitution Cutoff", "Bid Bond Due", "Sample Bond Due", "COI Due", "Addenda Cutoff")
- due_date (YYYY-MM-DD or null if not found)
- due_time (string or null)
- owner (string, who is responsible, or "GC")
- notes (string, optional)

Include bid date, pre-bid meeting, RFI cutoff, substitution cutoff, addenda, bonds, COIs, qualifications, affidavits, permits if mentioned. No markdown.`;

  const result = await enqueueAI(async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1200 },
      }),
    });
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  });

  const match = result.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try { return JSON.parse(match[0]); } catch { return []; }
}
