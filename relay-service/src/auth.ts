import jwt from "jsonwebtoken";
import { sha256Hex } from "@automation/shared";
import { config } from "./config";

export { sha256Hex };

export function signDeviceWsToken(deviceId: string): string {
  return jwt.sign({ sub: deviceId, scope: "device-ws" }, config.jwtSecret, {
    expiresIn: "5m",
  });
}

export function verifyDeviceWsToken(
  token: string,
): { deviceId: string } | null {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    if (decoded.scope !== "device-ws" || typeof decoded.sub !== "string") {
      return null;
    }
    return { deviceId: decoded.sub };
  } catch {
    return null;
  }
}

export function signPanelToken(): string {
  return jwt.sign({ scope: "panel-ws" }, config.jwtSecret, {
    expiresIn: "30m",
  });
}

export function verifyPanelToken(token: string): boolean {
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as jwt.JwtPayload;
    return decoded.scope === "panel-ws";
  } catch {
    return false;
  }
}

export function verifyInternalSecret(secret: string | null): boolean {
  return secret !== null && secret === config.relayInternalSecret;
}
