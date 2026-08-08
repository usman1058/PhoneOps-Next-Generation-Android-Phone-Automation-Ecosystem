import "dotenv/config";

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4001),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL", process.env.DATABASE_URL),
  jwtSecret: required("JWT_SECRET", process.env.JWT_SECRET),
  relayInternalSecret: required(
    "RELAY_INTERNAL_SECRET",
    process.env.RELAY_INTERNAL_SECRET,
  ),
  fcmServiceAccountJson: process.env.FCM_SERVICE_ACCOUNT_JSON,
  // Public reachable base URL (e.g. https://phoneops-relay.onrender.com).
  // Advertised to the web panel so pairing QRs work over the internet;
  // falls back to LAN addresses when unset.
  publicRelayUrl: (process.env.PUBLIC_RELAY_URL ?? "").replace(/\/+$/, ""),
};
