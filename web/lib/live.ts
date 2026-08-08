import { getToken } from "./client-api";

export function subscribeLive(
  onEvent: (data: Record<string, unknown>) => void,
  onError?: (message: string) => void,
): () => void {
  const token = getToken();
  if (!token) return () => undefined;

  const controller = new AbortController();

  (async () => {
    try {
      const res = await fetch("/api/live", {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        onError?.(`live connection failed (HTTP ${res.status})`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let idx: number;
        while ((idx = buffer.indexOf("\n\n")) >= 0) {
          const block = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          for (const line of block.split("\n")) {
            if (line.startsWith("data: ")) {
              try {
                onEvent(JSON.parse(line.slice(6)));
              } catch {
                // ignore malformed events
              }
            }
          }
        }
      }
    } catch (e) {
      onError?.(String(e));
    }
  })();

  return () => controller.abort();
}
