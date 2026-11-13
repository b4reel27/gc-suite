// AI schedule generation from contract text
export async function generateScheduleFromContract({ contractText, startDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const prompt = `You are a construction scheduler. Given this contract excerpt and a project start date, create a preliminary construction schedule.

Project: ${projectName || "Untitled"}
Start date: ${startDate}
Contract text:
${(contractText || "").slice(0, 6000)}

Return ONLY a JSON array of schedule items. Each item must have:
- title (string, short task name)
- trade (string, e.g. Site, Framing, Electrical, Plumbing, HVAC, Drywall, Flooring, Paint, or General)
- duration_days (number)
- start_offset_days (number, days after project start)
- notes (string, optional)

Order tasks logically (site work → structure → MEP → finishes). Include 8-15 realistic tasks. No markdown, just the JSON array.`;

  const result = await enqueueAI(async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1500 },
      }),
    });
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  });

  // Extract JSON array
  const match = result.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}
