# Remote Phone Automation System — Project Specification

> **Purpose of this file:** This is a build spec for an AI coding agent (or a human developer).
> It defines the architecture, exact tech stack, data models, API contracts, and build order for
> a personal Android automation system. Follow it section by section, in order. Where a decision
> could go multiple ways, one concrete choice has been made below — do not introduce alternate
> stacks unless explicitly asked.

## Framework decision (read this first)

**Stack: Next.js + a small dedicated Node/Socket.io relay service. No Django.**

Reasoning, so this doesn't get re-litigated mid-build: the one piece of this system with a hard
technical requirement is the **persistent WebSocket connection to the phone** — that connection
needs a long-running process, not a request/response framework. Neither Django nor Next.js
handles that natively on its own:

- Django needs **Django Channels + an ASGI server + Redis** bolted on for WebSockets — and it
  would add a second language/runtime (Python) alongside the Kotlin Android app, the
  TypeScript frontend, and whatever the relay ends up being. Two backend ecosystems for one
  small single-user app is the "advanced/combined" case the project doesn't need — it adds
  deployment surface and duplicate auth logic without a real security or capability benefit.
- Next.js API routes are great for normal CRUD (tasks, devices, auth) but, like Django, don't
  natively hold a persistent socket if deployed on serverless infrastructure (e.g. Vercel).

**Resolution — single language, two small services:**
1. **Next.js** — the Web Panel UI *and* all normal REST endpoints (tasks, devices, auth) via its
   built-in API routes. This is the app the user actually looks at.
2. **Relay Service** (Node + Express + Socket.io + node-cron) — a small, separate, always-on
   process that does only three things: holds phone WebSocket connections, runs the cron
   scheduler, and sends FCM wake-up pushes. It shares the same PostgreSQL database (via the same
   Prisma schema) as Next.js.

This keeps everything in **TypeScript end-to-end** (one language, one Prisma schema, one auth
scheme shared via a JWT both services can verify) instead of splitting the backend across Python
and JS for no functional gain. If a future requirement genuinely needs Django-specific strengths
(e.g. heavy data-science tooling, an admin-heavy internal tool), reconsider then — not now.

---

## 1. Project Overview

Build a system with four components that let a user define automation "tasks" (e.g. open an app
and tap a specific labeled button, or check off a to-do item) and have them execute on their own
Android phone — either on a schedule, or triggered manually — even when the phone is away from
the user's laptop and only has mobile data.

**Components:**
1. **Web Panel + API** — Next.js app. Create/edit/schedule/run tasks, view devices and run
   history, plus the REST API backing it.
2. **Relay Service** — Node/Express + Socket.io + PostgreSQL (shared DB). Schedules tasks, relays
   commands to the phone over a persistent WebSocket, logs run history.
3. **Companion App** — Android/Kotlin app. Maintains a persistent connection to the Relay
   Service, executes task steps using an Accessibility Service, supports a live-mirror recording
   mode.
4. **Desktop Wrapper** — Electron shell around the Next.js Web Panel, packaged as a Windows
   `.exe`.

This is a **single-user, single-account system** for personal use — do not build multi-tenant
auth complexity unless asked. Still implement real authentication (Section 8) since both services
are internet-facing.

### Non-goals (do not build unless explicitly requested)
- No support for iOS.
- No multi-user org/team features.
- No in-app purchase, billing, or marketplace features.
- No support for rooted/jailbroken-only capabilities — assume a stock, non-rooted Android phone.
- No Django, no Python backend — see the framework decision above.

---

## 2. System Architecture

```mermaid
flowchart LR
    A[Web Panel + API<br/>Next.js] -- shares DB --> G[(PostgreSQL)]
    D[Desktop .exe<br/>Electron wraps Next.js panel] -- HTTPS --> A
    A -- creates/updates tasks --> G
    B[Relay Service<br/>Node + Express + Socket.io] --- G
    B <-- wss:// WebSocket --> E[Companion App<br/>Android / Kotlin]
    B -- FCM push wake-up --> E
    E -- Accessibility Service taps --> F[Phone Screen / Target Apps]
```

**Data flow for a task run:**
1. Trigger fires (cron schedule inside the Relay Service, or a "Run Now" call from the Next.js
   panel — the panel writes a `run_requested` row / calls a small internal endpoint on the Relay
   Service to kick it off immediately).
2. Relay Service looks up the task's step list from PostgreSQL, sends a `run_task` message down
   the phone's open WebSocket connection (if connected); if not connected, sends an FCM push to
   wake the Companion App, which then reconnects and pulls the pending task.
3. Companion App executes each step via the Accessibility Service, reporting step-level status
   back over the WebSocket as it goes.
4. Relay Service persists the run result (`success` / `failed` / `partial`, plus a failure reason
   if any) to the `task_runs` table.
5. Next.js panel polls or subscribes (via a lightweight WebSocket connection to the Relay
   Service's `/panel` namespace) to show live/updated run status.

---

## 3. Repository Structure

Monorepo, four packages:

```
/repo
  /web                  # Next.js app — UI + REST API routes + auth
    /app
      /(dashboard)        # Dashboard, TaskList, RunHistory pages
      /task-builder        # Manual builder + Live Recording UI
      /api
        /auth/route.ts
        /devices/route.ts
        /tasks/route.ts
        /tasks/[id]/route.ts
        /tasks/[id]/run/route.ts
        /tasks/[id]/runs/route.ts
    /lib
      prisma.ts
      auth.ts
      relay-client.ts     # small HTTP client to tell the Relay Service "run this now"
    package.json

  /relay-service         # Node + Express + Socket.io + node-cron
    /src
      /sockets             # WebSocket event handlers (device + panel namespaces)
      /scheduler           # cron-based task scheduler
      /fcm                 # push wake-up
      /internal-api        # small internal endpoint the Next.js app calls for "Run Now"
      index.ts
    package.json
    Dockerfile

  /android-app            # Kotlin, Android Studio project
    /app/src/main
      /java/.../accessibility   # AccessibilityService implementation
      /java/.../network         # WebSocket client, FCM handling
      /java/.../recording       # MediaProjection live-mirror mode

  /desktop-app            # Electron wrapper around the Next.js panel
    main.js
    package.json

  /shared                 # Shared TypeScript: Task schema, WS message schema, Prisma schema
    /prisma
      schema.prisma         # single source of truth, used by both /web and /relay-service
    task-schema.ts
    ws-messages.ts

  docker-compose.yml       # web + relay-service + postgres for local dev
  README.md
```

Both `/web` and `/relay-service` import the same `/shared/prisma/schema.prisma` and the same
`task-schema.ts` / `ws-messages.ts` — never redefine these types independently in either package.

---

## 4. Tech Stack (concrete — use exactly this)

| Layer | Technology |
|---|---|
| Web Panel + REST API | **Next.js 14 (App Router)**, TypeScript |
| Relay Service | **Node.js 20 LTS + Express + Socket.io**, TypeScript |
| Database | PostgreSQL 15 |
| ORM / query layer | Prisma (shared schema, used by both services) |
| Scheduler | `node-cron` (runs inside the Relay Service only) |
| Auth | JWT (`jsonwebtoken`), `bcrypt` for password hashing — issued by Next.js, verified by both services |
| Push wake-up | Firebase Cloud Messaging (`firebase-admin` in the Relay Service) |
| Styling | Tailwind CSS |
| Desktop wrapper | Electron + `electron-builder` for packaging, `electron-updater` for updates |
| Android app | Kotlin, minSdk 26+ |
| Android networking | OkHttp (WebSocket client) |
| Android background | Foreground Service + `AccessibilityService` |
| Android live mirror | `MediaProjection` API |
| Error tracking | Sentry (both services + Android) |
| Containerization | Docker + Docker Compose (local dev); separate Dockerfiles for `/web` and `/relay-service` in production |

**Explicitly not used:** Django, any Python web framework, Vite/plain React (superseded by
Next.js).

---

## 5. Data Models (PostgreSQL via Prisma — lives in `/shared/prisma/schema.prisma`)

```prisma
model User {
  id           String   @id @default(uuid())
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  devices      Device[]
  tasks        Task[]
}

model Device {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  name         String              // e.g. "Pixel 8"
  apiKeyHash   String   @unique    // hashed, given to the Companion App at registration
  fcmToken     String?             // for wake-up push
  lastSeenAt   DateTime?
  isOnline     Boolean  @default(false)
  createdAt    DateTime @default(now())
  taskRuns     TaskRun[]
}

model Task {
  id          String   @id @default(uuid())
  userId      String
  user        User     @relation(fields: [userId], references: [id])
  deviceId    String
  name        String
  steps       Json                // array of Step objects — see Section 6
  schedule    String?             // cron expression, null = manual-only
  isEnabled   Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  taskRuns    TaskRun[]
}

model TaskRun {
  id          String   @id @default(uuid())
  taskId      String
  task        Task     @relation(fields: [taskId], references: [id])
  deviceId    String
  device      Device   @relation(fields: [deviceId], references: [id])
  triggeredBy String              // "schedule" | "manual"
  status      String              // "running" | "success" | "failed" | "partial"
  stepResults Json                // array of { stepIndex, status, error? }
  startedAt   DateTime @default(now())
  finishedAt  DateTime?
}
```

---

## 6. Task Step Schema (shared between Next.js, the Relay Service, and the Android app)

Define this once in `/shared/task-schema.ts` and import it everywhere — never redefine it
per-package.

```typescript
type Step =
  | { action: "open_app"; package: string }
  | { action: "tap_by_text"; text: string; timeoutMs?: number }
  | { action: "tap_by_coordinates"; x: number; y: number }  // fallback only, avoid if possible
  | { action: "swipe"; fromX: number; fromY: number; toX: number; toY: number; durationMs?: number }
  | { action: "wait"; ms: number }
  | { action: "back" }
  | { action: "home" };

interface Task {
  id: string;
  name: string;
  steps: Step[];
}
```

Example task JSON (claim daily bundle):
```json
{
  "name": "Claim Daily Bundle",
  "steps": [
    { "action": "open_app", "package": "com.telecom.myapp" },
    { "action": "wait", "ms": 2000 },
    { "action": "tap_by_text", "text": "Daily Bundle" },
    { "action": "wait", "ms": 1000 },
    { "action": "tap_by_text", "text": "Activate" }
  ]
}
```

`tap_by_coordinates` exists only as a fallback for elements the Accessibility Service can't match
by text (e.g. icon-only buttons) — prefer `tap_by_text` everywhere possible since it survives
minor UI changes.

---

## 7. REST API Specification (Next.js API routes)

Base URL: `https://<web-host>/api`. All routes except `/api/auth/*` require
`Authorization: Bearer <JWT>`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Create the (single) user account |
| POST | `/api/auth/login` | Returns JWT |
| POST | `/api/devices` | Register a new phone, returns a generated `apiKey` (shown once) for the Companion App |
| GET | `/api/devices` | List devices + online status (proxies live status from the Relay Service) |
| DELETE | `/api/devices/:id` | Remove a device |
| POST | `/api/tasks` | Create a task (name, deviceId, steps, optional cron schedule) |
| GET | `/api/tasks` | List tasks |
| GET | `/api/tasks/:id` | Task detail |
| PATCH | `/api/tasks/:id` | Update steps/schedule/enabled state |
| DELETE | `/api/tasks/:id` | Delete a task |
| POST | `/api/tasks/:id/run` | Triggers an immediate run — internally calls the Relay Service's internal endpoint |
| GET | `/api/tasks/:id/runs` | Run history for a task |
| POST | `/api/recordings/start` | Start a live-mirror recording session (proxies to Relay Service) |
| POST | `/api/recordings/:id/stop` | Stop recording, returns captured steps for review/edit |

**Relay Service — internal endpoints (not public, called only by the Next.js server, never the browser):**

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/run-task` | Next.js calls this to trigger an immediate run |
| POST | `/internal/start-recording` | Next.js calls this to begin a live-mirror session |

**Relay Service — device-facing endpoint:**

| Method | Path | Purpose |
|---|---|---|
| POST | `/device-auth/handshake` | Companion App exchanges its `apiKey` for a short-lived WS auth token |

---

## 8. WebSocket Protocol (hosted by the Relay Service)

Namespace: `/device` for phones, `/panel` for the Next.js server to subscribe to live updates
(server-to-server, not the browser directly, to keep one auth boundary).

**Device → Relay Service**
```json
{ "type": "hello", "deviceId": "...", "authToken": "..." }
{ "type": "step_result", "runId": "...", "stepIndex": 2, "status": "success" }
{ "type": "run_complete", "runId": "...", "status": "success" }
{ "type": "run_complete", "runId": "...", "status": "failed", "error": "Element not found: 'Activate'" }
```

**Relay Service → Device**
```json
{ "type": "run_task", "runId": "...", "steps": [ /* Step[] */ ] }
{ "type": "start_recording", "sessionId": "..." }
{ "type": "stop_recording", "sessionId": "..." }
```

**Relay Service → Next.js (`/panel` namespace)**
```json
{ "type": "run_update", "runId": "...", "status": "running", "stepIndex": 1 }
{ "type": "device_status", "deviceId": "...", "isOnline": true }
```
Next.js forwards these to the browser via its own lightweight WebSocket/SSE endpoint, or the
browser can connect to the Relay Service's `/panel` namespace directly with the user's JWT if
simpler — either is acceptable, but pick one and be consistent.

Connection auth: device connects with `authToken` obtained from `/device-auth/handshake`;
server-to-server `/panel` connection authenticates with a shared internal secret (not the user's
JWT). Reject any socket that doesn't authenticate within 5 seconds of connecting.

---

## 9. Android Companion App — Implementation Notes

- **Permissions required:** `BIND_ACCESSIBILITY_SERVICE`, foreground service permission,
  `POST_NOTIFICATIONS` (Android 13+), internet.
- **AccessibilityService**: implement `onAccessibilityEvent` minimally (this app doesn't need to
  react to arbitrary events) — the core logic is a `findNodeByText(text: String): AccessibilityNodeInfo?`
  helper that walks the current window's node tree, plus `tapNode(node)` using
  `performAction(ACTION_CLICK)` or a dispatched gesture if the node isn't directly clickable.
- **Foreground Service**: started on app launch, shows a persistent low-priority notification
  ("Automation running"), owns the OkHttp WebSocket connection to the Relay Service with
  reconnect/exponential backoff.
- **FCM**: on receiving a wake-up push from the Relay Service, start the Foreground Service if
  not already running, then reconnect the WebSocket and check for any pending run.
- **Live recording mode** (`MediaProjection` + Accessibility event capture): while a recording
  session is active, capture the text/bounds of whatever node the user taps and append a
  `tap_by_text` step; stream the screen to the Relay Service (which forwards to the Next.js panel)
  for the live mirror view — use WebRTC if comfortable, otherwise periodic JPEG frames over the
  WebSocket is an acceptable simpler fallback.
- **Battery optimization**: on first run, prompt the user to disable battery optimization for the
  app (`ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).

---

## 10. Web Panel (Next.js) — Pages/Components

- `/dashboard` — device list with online/offline status, recent run summaries.
- `/task-builder` — dual mode:
  - *Manual builder*: form to add/reorder `Step` objects (dropdown per action type).
  - *Live recording*: opens a view that connects (via the panel's live-status channel) to the
    device's mirror stream and shows tapped steps accumulating in real time; on stop, steps are
    editable before saving.
- `/tasks` — all tasks, enable/disable toggle, edit, delete, "Run Now" button, schedule display.
- `/tasks/:id/runs` — table of past runs per task, with per-step status and error detail on failure.
- `/devices` — register a new device (shows a pairing code/QR the Companion App scans to
  self-configure its `apiKey`), remove devices.

State/data fetching: React Query for calls to Next.js's own API routes; a small hook
(`useLiveStatus()`) wrapping whichever live-update mechanism was chosen in Section 8.

---

## 11. Security Requirements

- All traffic over HTTPS/WSS — no plaintext HTTP anywhere, including local dev via self-signed
  certs if needed.
- JWT expiry: short-lived access token (15 min) + refresh token flow, or a longer-lived token
  (7 days) is acceptable given this is single-user — pick the simpler option unless asked for more.
- Device `apiKey`: generate with `crypto.randomBytes(32).toString('hex')`, show it once at
  registration, store only its hash (`apiKeyHash`) in the DB — treat it like a password, never
  log the raw value.
- The Relay Service's `/internal/*` endpoints must only accept requests from the Next.js server
  (shared internal secret or network-level restriction) — never expose them publicly.
- Rate-limit `/api/auth/login` and `/device-auth/handshake` to prevent brute forcing.
- Validate every incoming `Step[]` against the shared schema before persisting or forwarding to a
  device — reject unknown `action` types rather than passing them through.

---

## 12. Environment Variables

```
# /web/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/automation
JWT_SECRET=<random 64-byte hex>
RELAY_SERVICE_URL=http://localhost:4001
RELAY_INTERNAL_SECRET=<random 64-byte hex, shared with relay-service>

# /relay-service/.env
DATABASE_URL=postgresql://user:pass@localhost:5432/automation
JWT_SECRET=<same as above, to verify panel-issued tokens if needed>
RELAY_INTERNAL_SECRET=<same as above>
FCM_SERVICE_ACCOUNT_JSON=<path or inline JSON>
PORT=4001
NODE_ENV=development
```

---

## 13. Build Order (implement in this sequence)

1. **Shared schema first**: set up `/shared/prisma/schema.prisma` and `task-schema.ts`, run the
   initial migration. Both `/web` and `/relay-service` will depend on this from day one.
2. **Next.js auth**: `/api/auth/register`, `/api/auth/login`, JWT issuance/verification. Verify
   end-to-end with a REST client before moving on.
3. **Relay Service skeleton + device handshake**: Express app, `/device-auth/handshake`, and the
   `/device` Socket.io namespace with `hello` auth. Test with a throwaway WebSocket client (e.g.
   `wscat`) before writing any Android code.
4. **Device registration (Next.js) + online status**: `/api/devices` endpoints in Next.js; Relay
   Service reports online/offline into the DB (or an in-memory map exposed via an internal
   status endpoint Next.js polls).
5. **Task CRUD (Next.js) + manual run**: `/api/tasks` endpoints; `POST /api/tasks/:id/run` calls
   the Relay Service's `/internal/run-task`, which sends `run_task` to a connected (test) socket
   and logs a `TaskRun` row.
6. **Scheduler**: `node-cron` inside the Relay Service so tasks with a `schedule` field
   auto-trigger the same run path as step 5.
7. **Android app — connection layer only**: Foreground Service + OkHttp WebSocket client that
   connects, authenticates, and can receive/log a `run_task` message (no tapping yet).
8. **Android app — Accessibility execution**: implement `findNodeByText`/`tapNode` and execute
   real `Step[]` sequences against a real app, reporting `step_result`/`run_complete` back.
9. **Next.js panel — read-only views first**: `/dashboard`, `/tasks`, `/tasks/:id/runs` wired to
   the API routes plus live status, before building the editors.
10. **Next.js panel — Manual Builder**, then **Live Recording mode** (most complex UI piece —
    build it last).
11. **Electron wrapper**: package the finished Next.js panel; add `electron-updater` last.
12. **Hardening pass**: rate limiting, Sentry wiring (both services), battery-optimization
    prompt, reconnect/backoff tuning, input validation audit against Section 6's schema.

Do not skip ahead to later steps before the step before it is functionally testable — each step
should be independently verifiable (e.g. via curl/wscat/Postman) before the next one builds on it.

---

## 14. Acceptance Checklist (use to verify "done")

- [ ] A user can register, log in, and receive a working JWT from the Next.js API.
- [ ] A phone running the Companion App shows as "online" on the Dashboard within seconds of
      opening the app.
- [ ] A manually-built task with `open_app` + `tap_by_text` steps runs successfully via "Run Now"
      against a real test app on the phone.
- [ ] A scheduled task fires automatically at its cron time without any manual trigger.
- [ ] Killing the Companion App and then triggering a run wakes it via FCM and the run still
      completes.
- [ ] A failed step (element not found) is reported back with a clear error and shown in Run
      History, not silently swallowed.
- [ ] Live Recording Mode produces a step list that matches what was actually tapped on the phone.
- [ ] The Electron `.exe` opens the same panel and functions identically to the browser version.
- [ ] The Relay Service's `/internal/*` endpoints reject requests that don't carry the shared
      internal secret.
