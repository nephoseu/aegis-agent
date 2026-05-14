/**
 * Thin wrapper around the LangGraph HTTP Streaming API.
 * The Vite proxy forwards /api/* → http://localhost:2024/*
 */

const BASE = '/api';
const GRAPH_ID = 'lumina_agent';

export async function createThread() {
  const res = await fetch(`${BASE}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Failed to create thread: ${res.status}`);
  const data = await res.json();
  return data.thread_id;
}

export async function streamRun({ threadId, message, onText, onDone, onError }) {
  const res = await fetch(`${BASE}/threads/${threadId}/runs/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      assistant_id: GRAPH_ID,
      input: { messages: [{ role: 'human', content: message }] },
      stream_mode: ['messages', 'values'],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    onError?.(new Error(`Run failed (${res.status}): ${text}`));
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let currentEvent = null;

  // Accumulate the full response text here; always send the whole string so
  // the caller can replace (not append) — this prevents any double-send from
  // values events or cumulative chunks arriving out of order.
  let accumulated = '';
  let usedValuesSnapshot = false;

  const extractText = (content) => {
    if (!content) return '';
    if (typeof content === 'string') return content;
    return content.filter(p => p.type === 'text').map(p => p.text).join('');
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        continue;
      }

      if (!line.startsWith('data: ')) continue;

      const raw = line.slice(6).trim();
      if (!raw || raw === '[DONE]') continue;

      let payload;
      try { payload = JSON.parse(raw); } catch { continue; }

      // ── messages mode: [AIMessageChunk, metadata] ────────────────────────
      if (currentEvent === 'messages' && Array.isArray(payload)) {
        const [chunk] = payload;
        // Only process actual AI message chunks, not human/tool messages
        if (chunk?.type === 'AIMessageChunk') {
          const delta = extractText(chunk.content);
          if (delta) {
            accumulated += delta;
            usedValuesSnapshot = false;
            onText?.(accumulated);
          }
        }
        continue;
      }

      // ── values mode: full state snapshot ─────────────────────────────────
      // Only use this if messages mode produced nothing (non-streaming models).
      // If messages chunks already built up content, skip to avoid duplication.
      if (currentEvent === 'values' && payload?.messages && accumulated === '') {
        const last = payload.messages[payload.messages.length - 1];
        if (last?.type === 'ai') {
          const text = extractText(last.content);
          if (text && text !== accumulated) {
            accumulated = text;
            usedValuesSnapshot = true;
            onText?.(accumulated);
          }
        }
      }
    }
  }

  onDone?.();
}
