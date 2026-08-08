const RELAY_SERVICE_URL = process.env.RELAY_SERVICE_URL;
const RELAY_INTERNAL_SECRET = process.env.RELAY_INTERNAL_SECRET;

export async function relayRequest(
  path: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(`${RELAY_SERVICE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": RELAY_INTERNAL_SECRET ?? "",
      ...(init?.headers ?? {}),
    },
  });
}
