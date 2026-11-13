export async function generateScheduleFromContract({ contractText, startDate, endDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const prompt = `You are a construction scheduler. Given this contract excerpt and a project start date${endDate ? " and target end date" : ""}, create a preliminary construction schedule.

Project: ${projectName || "Untitled"}
Start date: ${startDate}
${endDate ? `Target end date: ${endDate}` : ""}
Contract text:
${(contractText || "").slice(0, 6000)}

Return ONLY a JSON array of schedule items. Each item must have:
- title (string)
- trade (string)
- duration_days (number)
- start_offset_days (number, days after project start)
- notes (string, optional)

${endDate ? "Scale durations and offsets so the last task ends on or before the target end date." : "Order tasks logically."}
Include 8-15 realistic tasks. No markdown, just the JSON array.`;

  return callGemini(prompt, enqueueAI, key);
}

export async function generateScheduleFromPlans({ sheets, startDate, endDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const sheetList = (sheets || [])
    .map(s => `${s.sheetNo || s.sheetId || "?"} - ${s.title || "Untitled"} (${s.discipline || "General"})`)
    .join("\n");

  const prompt = `You are a construction scheduler. Given this list of plan sheets and a start date${endDate ? " and target end date" : ""}, create a preliminary construction schedule.

Project: ${projectName || "Untitled"}
Start date: ${startDate}
${endDate ? `Target end date: ${endDate} — the project must finish on or before this date.` : ""}
Plan sheets:
${sheetList || "No sheets listed"}

Use normal construction sequencing (site → structure → MEP rough-in → interiors → finishes → closeout).
Infer disciplines from sheet numbers (A=Arch, S=Struct, M=Mech, E=Elec, P=Plumb, C=Civil).

${endDate ? "IMPORTANT: Scale all durations and start offsets so the final task completes on or before the target end date. Do not exceed it." : ""}

Return ONLY a JSON array of schedule items. Each item must have:
- title (string)
- trade (string)
- duration_days (number)
- start_offset_days (number)
- notes (string, optional)

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
