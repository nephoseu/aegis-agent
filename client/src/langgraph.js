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

export async function streamRun({ threadId, message, onChunk, onDone, onError }) {
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

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      // track the event type
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
        console.log('[SSE event]', currentEvent);
        continue;
      }

      if (line.startsWith('data: ')) {
        const raw = line.slice(6).trim();
        if (!raw || raw === '[DONE]') continue;

        let payload;
        try {
          payload = JSON.parse(raw);
        } catch {
          console.warn('[SSE] non-JSON line:', raw);
          continue;
        }

        console.log('[SSE data]', currentEvent, payload);

        // ── messages mode: [type, chunk] tuple ──────────────────────────────
        if (Array.isArray(payload)) {
          const [, chunk] = payload;
          if (chunk?.content) {
            // content can be a string or an array of parts
            const text = typeof chunk.content === 'string'
              ? chunk.content
              : chunk.content
                  .filter(p => p.type === 'text')
                  .map(p => p.text)
                  .join('');
            if (text) onChunk?.(text);
          }
          continue;
        }

        // ── values mode: full state snapshot ────────────────────────────────
        if (currentEvent === 'values' && payload?.messages) {
          const msgs = payload.messages;
          const last = msgs[msgs.length - 1];
          // only use values snapshot if we got no streaming chunks
          // (non-streaming models fall back to this)
          if (last?.type === 'ai' && last?.content) {
            const text = typeof last.content === 'string'
              ? last.content
              : last.content
                  .filter(p => p.type === 'text')
                  .map(p => p.text)
                  .join('');
            if (text) onChunk?.(text);
          }
        }
      }
    }
  }

  onDone?.();
}