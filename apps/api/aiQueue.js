// Rate-limited AI queue for free-tier Gemini
// Prevents 429s by spacing requests ~4.5s apart

const queue = [];
let processing = false;
const DELAY_MS = 4500;

async function processQueue() {
  if (processing || queue.length === 0) return;
  processing = true;
  while (queue.length) {
    const { fn, resolve, reject } = queue.shift();
    try {
      const result = await fn();
      resolve(result);
    } catch (err) {
      reject(err);
    }
    if (queue.length) await new Promise(r => setTimeout(r, DELAY_MS));
  }
  processing = false;
}

export function enqueueAI(fn) {
  return new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    processQueue();
  });
}

export default { enqueueAI };
