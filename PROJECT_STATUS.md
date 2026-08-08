# Project Status

## What has been built

- Next.js web panel with authentication, dashboard, devices, tasks, task detail, and task builder flows.
- Relay service with device WebSocket handling, internal run/recording endpoints, scheduling, and run reconciliation.
- Android companion app with persistent foreground socket service, accessibility-based step execution, and local recording capture.
- Home page download button that serves the Android debug APK from the web app.
- Wireless-first UI copy and setup guidance across the web and Android surfaces.

## How it works

1. A user logs in to the web panel.
2. The user registers the Android device and copies the device API key.
3. The Android app saves the relay URL and API key, then starts the foreground socket service.
4. The relay authenticates the phone, marks it online, and stores its status in the database.
5. The web panel can create tasks manually or by recording clicks from the device.
6. Manual runs and scheduled runs both go through the relay service, which sends `run_task` to the connected phone.
7. The phone executes the step list through Accessibility and reports step status back.

## What is still missing

- True push-based wake-up with a completed Android FCM receive path.
- Live screen mirror / live recording stream, beyond step capture.
- A real packaged Windows desktop `.exe` release pipeline with installer/update flow.
- A production release APK signing and distribution flow.
- Enterprise hardening such as full observability, retries, and release-grade deployment automation.

## What still needs to be completed next

- Add the Android FCM messaging receiver so the app can wake and reconnect when killed.
- Add the live screen-sharing / mirror transport for recording mode.
- Package the Electron desktop wrapper into a distributable Windows app.
- Build a signed release APK and point the download button to that artifact.
- Tighten monitoring, error reporting, and deployment steps for production use.

## Current verification

- Web production build passes.
- Relay service typecheck passes.
- Core manual task execution path is wired.
- Scheduled task path is wired.
- Device online/offline tracking is wired.

## Notes

- The current APK download is for the debug build only.
- The current system is functional for local testing, but it is not yet fully enterprise-ready.