export async function levelQuotes({ quotes, division, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const quoteText = (quotes || []).map((q, i) => 
    `Quote ${i+1} (${q.company || "Unknown"}): $${q.amount || 0}\nInclusions: ${q.inclusions || "none"}\nExclusions: ${q.exclusions || "none"}\nNotes: ${q.notes || ""}`
  ).join("\n\n");

  const prompt = `You are a construction estimator. Compare these subcontractor quotes for ${division || "this division"} and produce a bid leveling summary.

${quoteText}

Return ONLY a JSON object:
{
  "division": "${division || ""}",
  "quotes": [ { "company": "", "amount": 0, "scopeGaps": ["..."], "adjustedAmount": 0 } ],
  "lowComplete": 0,
  "notes": "summary of gaps and recommendation"
}

Flag scope gaps like missing lime stabilization, no asphalt, tax not included, etc. Suggest an adjusted low complete number. No markdown.`;

  const result = await enqueueAI(async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
      }),
    });
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
  });

  const match = result.match(/\{[\s\S]*\}/);
  if (!match) return { quotes: [], lowComplete: 0, notes: "Could not parse" };
  try { return JSON.parse(match[0]); } catch { return { quotes: [], lowComplete: 0, notes: "Parse error" }; }
}
