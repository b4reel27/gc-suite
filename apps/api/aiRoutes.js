import express from 'express';
import { enqueueAI } from './aiQueue.js';

const router = express.Router();

// Core parse endpoint (voice/text -> structured data)
router.post('/parse', async (req, res) => {
  try {
    const { text, type = 'issue' } = req.body;
    const result = await enqueueAI(async () => {
      // Placeholder for Gemini call - wire your free-tier key here
      return { parsed: { type, text, confidence: 0.85 }, raw: text };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Daily log summarizer
router.post('/summarize-daily', async (req, res) => {
  try {
    const { entries } = req.body;
    const summary = await enqueueAI(async () => {
      return { summary: `Summarized ${entries?.length || 0} entries`, entries };
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// RFI draft helper
router.post('/draft-rfi', async (req, res) => {
  try {
    const { context } = req.body;
    const draft = await enqueueAI(async () => {
      return { draft: `RFI draft based on: ${context?.slice(0, 100) || 'no context'}`, context };
    });
    res.json(draft);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Natural language search
router.post('/search', async (req, res) => {
  try {
    const { query } = req.body;
    const results = await enqueueAI(async () => {
      return { query, matches: [] };
    });
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
