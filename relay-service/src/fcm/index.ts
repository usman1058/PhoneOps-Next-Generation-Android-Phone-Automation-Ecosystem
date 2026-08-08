import { config } from "../config";

type FirebaseAdmin = {
  messaging: () => {
    send: (message: unknown) => Promise<string>;
  };
};

let admin: FirebaseAdmin | null = null;

if (config.fcmServiceAccountJson) {
  try {
    const mod = require("firebase-admin");
    const serviceAccount = JSON.parse(config.fcmServiceAccountJson);
    mod.initializeApp({ credential: mod.credential.cert(serviceAccount) });
    admin = mod;
    console.log("[fcm] initialized");
  } catch (err) {
    console.warn("[fcm] initialization failed, push wake-ups disabled:", err);
  }
} else {
  console.log("[fcm] FCM_SERVICE_ACCOUNT_JSON not set, push wake-ups disabled");
}

export async function sendFcmWakeup(
  deviceId: string,
  fcmToken: string | null | undefined,
): Promise<boolean> {
  if (!admin || !fcmToken) {
    return false;
  }
  try {
    await admin.messaging().send({
      token: fcmToken,
      data: { type: "wakeup", deviceId },
    });
    return true;
  } catch (err) {
    console.warn("[fcm] send failed:", err);
    return false;
  }
}
