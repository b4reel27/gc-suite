export async function generateScheduleFromPlans({ sheets, startDate, endDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const sheetList = (sheets || [])
    .map(s => `${s.sheetNo || s.sheetId || "?"} - ${s.title || "Untitled"} (${s.discipline || "General"})`)
    .join("\n");

  const prompt = `You are a construction scheduler. Create a preliminary schedule that fits exactly between the start and target end dates.

Project: ${projectName || "Untitled"}
Start date: ${startDate}
${endDate ? `Target end date: ${endDate}. The LAST task must end on or very near this date. Scale all durations accordingly.` : ""}
Plan sheets:
${sheetList || "No sheets listed"}

Use normal sequencing: site → structure → MEP rough-in → interiors → finishes → closeout.
Infer disciplines from sheet numbers.

Return ONLY a JSON array. Each item:
- title (string)
- trade (string)
- duration_days (number)
- start_offset_days (number)
- notes (string, optional)

Include 10-16 tasks. No markdown.`;

  let items = await callGemini(prompt, enqueueAI, key);
  if (endDate) items = scaleToWindow(items, startDate, endDate);
  return items;
}

export async function generateScheduleFromContract({ contractText, startDate, endDate, projectName, enqueueAI }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("AI not configured");

  const prompt = `Create a construction schedule that fits between start and end dates.

Start: ${startDate}
${endDate ? `Target end: ${endDate}. Last task must end near this date.` : ""}
Contract:
${(contractText || "").slice(0, 5000)}

Return ONLY a JSON array of {title, trade, duration_days, start_offset_days, notes}. 8-15 tasks.`;

  let items = await callGemini(prompt, enqueueAI, key);
  if (endDate) items = scaleToWindow(items, startDate, endDate);
  return items;
}

function scaleToWindow(items, startDate, endDate) {
  if (!items?.length || !endDate) return items;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDays = Math.max(1, Math.round((end - start) / 86400000));

  // Find the natural end of the generated schedule
  let maxEnd = 0;
  for (const it of items) {
    const off = it.start_offset_days || 0;
    const dur = it.duration_days || 1;
    maxEnd = Math.max(maxEnd, off + dur);
  }
  if (maxEnd <= 0) maxEnd = 1;

  const scale = totalDays / maxEnd;

  return items.map(it => ({
    ...it,
    start_offset_days: Math.round((it.start_offset_days || 0) * scale),
    duration_days: Math.max(1, Math.round((it.duration_days || 1) * scale)),
  }));
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
