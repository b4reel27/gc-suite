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
- trade (string)
- duration_days (number)
- start_offset_days (number, days after project start)
- notes (string, optional)

Order tasks logically. Include 8-15 realistic tasks. No markdown, just the JSON array.`;

  return callGemini(prompt, enqueueAI, key);
}

export async function generateScheduleFromPlans({ sheets, startDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const sheetList = (sheets || [])
    .map(s => `${s.sheetNo || s.sheetId || "?"} - ${s.title || "Untitled"} (${s.discipline || "General"})`)
    .join("\n");

  const prompt = `You are a construction scheduler. Given this list of plan sheets for a project and a start date, create a preliminary construction schedule based on normal construction sequencing.

Project: ${projectName || "Untitled"}
Start date: ${startDate}
Plan sheets:
${sheetList || "No sheets listed"}

Use standard construction knowledge:
- Site work / demolition / foundations first
- Structure (steel, framing) next
- MEP rough-in (electrical, plumbing, HVAC)
- Insulation, drywall, interiors
- Finishes, fixtures, trim
- Final inspections and closeout

Infer disciplines from sheet numbers (A=Architectural, S=Structural, M=Mechanical, E=Electrical, P=Plumbing, C=Civil, etc.) and titles.

Return ONLY a JSON array of schedule items. Each item must have:
- title (string)
- trade (string)
- duration_days (number)
- start_offset_days (number)
- notes (string, optional, mention related sheets if relevant)

Include 10-18 realistic tasks. No markdown, just the JSON array.`;

  return callGemini(prompt, enqueueAI, key);
}

async function callGemini(prompt, enqueueAI, key) {
  const result = await enqueueAI(async () => {
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1800 },
      }),
    });
    const data = await r.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "[]";
  });

  const match = result.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    return JSON.parse(match[0]);
  } catch {
    return [];
  }
}
