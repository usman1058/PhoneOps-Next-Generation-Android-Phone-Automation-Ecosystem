import { requireAuth } from "@/lib/auth";
import { io } from "socket.io-client";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await requireAuth(req);
  if (!auth.ok) return auth.response;

  const relayUrl = process.env.RELAY_SERVICE_URL;
  const secret = process.env.RELAY_INTERNAL_SECRET;
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const socket = io(`${relayUrl}/panel`, {
        path: "/socket.io",
        transports: ["websocket"],
        forceNew: true,
        reconnection: true,
        extraHeaders: { "x-internal-secret": secret ?? "" },
      });

      socket.on("connect", () => {
        controller.enqueue(
          encoder.encode(
            `event: ready\ndata: ${JSON.stringify({ ok: true })}\n\n`,
          ),
        );
      });

      socket.on("message", (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      });

      socket.on("connect_error", (err: Error) => {
        controller.enqueue(
          encoder.encode(
            `event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`,
          ),
        );
      });

      const heartbeat = setInterval(() => {
        controller.enqueue(encoder.encode(": keepalive\n\n"));
      }, 25_000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        socket.close();
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
