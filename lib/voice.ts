export type Voice = { id: string; model: string; description: string };
export function voiceIntent(text: string): 'confirm' | 'design' | 'chat' {
  if (/^(确认使用|就用这个|使用这个声|确定用|确认这个)/.test(text.trim())) return 'confirm';
  if (/(声音|声线|音色|男声|女声)/.test(text) && /(创建|设计|生成|换|改|想要|希望|调|变|可以.*[吗么]|能.*[吗么])/.test(text)) return 'design';
  return 'chat';
}
// Keep every data event, including multiple events in a single transport chunk.
export async function* jsonEvents(stream: ReadableStream<Uint8Array>) {
  const reader = stream.getReader(); const decoder = new TextDecoder(); let buffer = '';
  const parse = (line: string) => {
    const value = line.replace(/\r$/, '').trim();
    if (!value.startsWith('data:')) return null;
    const raw = value.slice(5).trim();
    if (!raw || raw === '[DONE]') return null;
    try { return JSON.parse(raw); } catch { return null; }
  };
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split('\n'); buffer = lines.pop() || '';
      for (const line of lines) { const event = parse(line); if (event) yield event; }
      if (done) { const event = parse(buffer); if (event) yield event; break; }
      if (buffer.length > 12_000_000) throw new Error('音频响应过大');
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
