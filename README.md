# PhoneOps — Next-Generation Android Phone Automation Ecosystem

[![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Express](https://img.shields.io/badge/Express-4.21-000000?style=for-the-badge&logo=express)](https://expressjs.com/)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.8-white?style=for-the-badge&logo=socket.io)](https://socket.io/)
[![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)
[![Kotlin](https://img.shields.io/badge/Kotlin-Android-7F52FF?style=for-the-badge&logo=kotlin)](https://kotlinlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-4169E1?style=for-the-badge&logo=postgresql)](https://www.postgresql.org/)


## 💎 The Vision


**PhoneOps** is a self-hosted, wireless-first platform for remote Android device automation. It is a comprehensive orchestration layer connecting a **Web Command Center**, a **Realtime Relay Service**, and **Android Companion Apps** — enabling task scheduling, tap recording/playback, and device management over Wi-Fi or mobile data, no cables required.


Built with a "Performance-First" philosophy, the system leverages modern React and Kotlin ecosystems to deliver a responsive, real-time experience while maintaining rigorous data integrity and operational transparency.


---


## 🚀 Sophisticated Tech Stack


The architecture is built on a modern, scalable foundation:


*   **Framework**: [Next.js 14 (App Router)](https://nextjs.org/) — Server-side rendering with a type-safe REST API layer and token-based session management.
*   **Language**: [TypeScript](https://www.typescriptlang.org/) — Strict type-safety across the monorepo, from shared Prisma models and WebSocket message schemas to web UI components.
*   **Realtime Layer**: [Express](https://expressjs.com/) + [Socket.io](https://socket.io/) — A dedicated relay service that maintains persistent, low-latency connections to phones and streams live task/run state.
*   **Mobile Client**: [Kotlin](https://kotlinlang.org/) — A native Android companion app backed by an Accessibility Service for task execution, click recording, and playback.
*   **Database & ORM**: [PostgreSQL](https://www.postgresql.org/) orchestrated by [Prisma ORM](https://www.prisma.io/) — A single source-of-truth schema shared across all services.
*   **Authentication**: JWT (via `jsonwebtoken`) with `bcrypt` password hashing — role-gated web API with per-device cryptographic API keys.
*   **Design Language**: Custom CSS design system (dark, high-contrast, accent-driven) with responsive layouts across dashboard, devices, and task pages.
*   **Devices**: A companion Android app that supports **Wi-Fi + Ethernet LAN discovery**, QR-based cable-free pairing, and accessibility-driven task automation.


---


## 🌟 Advanced Engineering Features


### 📡 Wireless-First Pairing Matrix
Devices pair over the network via scannable QR codes that encode the relay URL and a one-time API key. The app's **Find Relay** feature auto-discovers the relay on both Wi-Fi and Ethernet subnets, with graceful fallback — no USB cables, no manual typing.

### 🔑 Ephemeral Key Rotation
Registered devices are protected by hashed API keys (`sha256Hex`). The web panel supports in-place **key rotation** from the Devices page — invalidating the old key instantly and re-issuing a fresh one for a new pairing QR, enabling secure reconnection without deleting the device.

### 🔄 Resilient Reconnection Engine
The Android client maintains a guarded reconnect loop (`Job`-based) that prevents duplicate connections, survives network blips, and automatically re-establishes the relay socket — with an accessibility service that handles key-event routing correctly across the task lifecycle.

### 📅 Task & Run Orchestration
A structured task-builder lets you author repeatable phone workflows. Every run is persisted with history and status, giving you a full audit trail of what executed, when, and how it ended.

### 📡 Live Operational Monitoring
A relay status API and connected-device counters give operators a real-time view of the fleet — which phones are online, which relay URLs are reachable, and overall system health.

### 🌓 Adaptive Command Center UI
A modern dark-first web panel with a cohesive design system: hero stats, status badges, empty states, and a dedicated Settings page for relay override and troubleshooting — designed to be clear under both desktop and mobile use.


---


## 🏗️ Architectural Overview


```mermaid
graph TD
    Web[Web Command Center] -->|REST API| API[Next.js API Layer]
    API -->|ORM| Prisma[Prisma Engine]
    Prisma -->|Storage| DB[(PostgreSQL)]
    API -->|Device Register / Key Rotation| API
    Relay[Relay Service] -->|WebSocket| API
    Phone[Android Companion App] -->|WS Handshake| Relay
    Phone -->|QR Pairing / LAN Discovery| Relay
    Relay -->|Run / Record Tasks| Phone
    API -->|Auth| JWT[JWT + bcrypt]
```


---


## 🛠️ Installation & Setup


### Prerequisites
- Node.js 20+ (tested on 25.8.2)
- PostgreSQL 15 (local or via Docker)
- Android Studio / SDK for the companion app
- JDK 17+ for the Android build


### Setup Steps
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-org/phoneops.git
   cd phoneops
   ```


2. **Install dependencies:**
   ```bash
   npm install
   ```


3. **Start PostgreSQL (Docker):**
   ```bash
   npm run compose:db
   ```
   > Port is configurable via `POSTGRES_PORT` (default `5433`).


4. **Configure environment variables:**
   Copy `web/.env.example`, `shared/.env.example` and `relay-service/.env.example` to `.env` files and fill them in:
   ```env
   # web/.env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/automation"
   JWT_SECRET="<random 64-byte hex>"
   RELAY_SERVICE_URL="http://localhost:4001"
   RELAY_INTERNAL_SECRET="<random 64-byte hex, shared with relay-service>"

   # relay-service/.env
   PORT=4001
   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/automation"
   RELAY_INTERNAL_SECRET="<same 64-byte hex as web>"
   ```


5. **Initialize Database:**
   ```bash
   npm run db:generate
   npm run db:migrate
   ```


6. **Launch the stack:**
   ```bash
   npm run dev:relay      # terminal 1 — relay on :4001
   npm run dev:web        # terminal 2 — web panel on :3000
   ```


7. **Build & run the Android app:**
   ```bash
   cd android
   ./gradlew :app:assembleDebug
   ```
   Install the APK, grant Accessibility + Internet permissions, then open the web panel → **Devices** → register a device → scan the pairing QR from the app.


---


## 📄 License
Copyright © 2026 PhoneOps. All rights reserved.


---

**Engineered with precision for wireless, cable-free Android automation.**
