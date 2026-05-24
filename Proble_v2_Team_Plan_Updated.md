# PROBLE v2: Secure Assessment Infrastructure
## Full Team Execution Plan & Portable Architecture (8-Person Assignment)

**Pilot Institution:** SRM University  
**Target:** 8 Weeks  
**Budget:** $0 (Free Tier Maximized for 1,000+ Concurrent Users)

---

## SECTION 1 — TEAM OVERVIEW & TIERS

The 8-person team is structured into 3 tiers based on skill level. Tier 1 leads own core decisions and architecture. Tier 2 executors implement assigned tasks. Tier 3 support handles testing, documentation, and small polish items.

| Person | Tier | Role | Primary Domain |
| :--- | :--- | :--- | :--- |
| **Tharun (You)** | **Tier 1 (Lead)** | **Tech Lead + Backend Lead** | NestJS • PostgreSQL • API Handshakes & Cryptographic Validation |
| **Nithil** | **Tier 1 (Lead)** | **Realtime Systems Lead** | Socket.IO • Upstash Redis • Live Telemetry & Server-Only Sync Timers |
| **Surjith** | **Tier 1 (Lead)** | **Mobile Lead** | Flutter Android App • Mobile Device Security & Anti-Cheat |
| **Sundar** | **Tier 2 (Executor)** | **Teacher Portal & PC Browser Shell** | React (Teacher Portal) • Electron Shell (Kiosk Windowing) |
| **Aarya** | **Tier 2 (Executor)** | **Admin Portal & PC Browser Security** | React (Admin Portal) • Electron OS Hooks (Keyboard Interceptors, Process Scans) |
| **Madan** | **Tier 2 (Executor)** | **DevOps + Infrastructure** | Vercel Deployment • GitHub Actions • k6 Load Testing |
| **Bharath** | **Tier 3 (Support)** | **QA + Manual Testing** | 50+ Test Cases • E2E Quiz Lifecycles • Mobile & PC VM Testing |
| **Pugal** | **Tier 3 (Support)** | **UI Polish + Documentation + Seeding** | Readme Docs • Seed Data (SRM Pilot Accounts) • Secure Installer Guides |

---

## SECTION 2 — PORTABLE $0-BUDGET SCALING ARCHITECTURE

To support **200+ active concurrent users** (scaling easily to **1,000+** during exam spikes) on **$0 budget** without crashing the free-tier servers, the system implements three core defensive optimizations:

```
[React Frontend / Electron] ──( Staggered Quiz Start: 0-5s Jitter )──> [Vercel CDN / Edge]
                                                                                │
                                                                   (Only Dynamic API Requests)
                                                                                │
                                                                                ▼
[React Frontend / Electron] <───( Stateless HTTP POST Requests )─── [NestJS Serverless API]
                                                                                │
                                                                       (Connection Pooling)
                                                                                ▼
                                                                        [Supabase Database]
```

### 1. Zero Cloud Lock-in (Vercel to AWS Portability)
* **Standard Monolithic NestJS App:** The entire backend is built as a standard monolithic NestJS API. It is completely decoupled from any cloud provider.
* **Serverless Wrapper:** During the SRM Pilot, the backend is deployed as **Vercel Serverless Functions** (using `@vendia/serverless-express`) to get **$0 hosting with infinite auto-scaling** (Vercel handles the scaling automatically when 1,000 users connect).
* **Future AWS Migration:** When funding is secured, the exact same codebase can be containerized using Docker and run on **AWS EC2** or deployed as **AWS Lambda** serverless functions with **zero code modifications**.
* **Database Agnosticism:** PostgreSQL is standard. Using **TypeORM** in NestJS means the backend connects to database URLs. Moving from Supabase to **AWS RDS (Postgres)** only requires changing the environment variable connection string.

### 2. Client-Side Staggering (Jitter)
* **The Problem:** 1,000 students clicking "Start Exam" at exactly 10:00:00 AM will create a massive thundering herd spike that crashes free databases.
* **The Fix:** The React/Mobile/Electron client introduces a **random delay of 0 to 5 seconds** before making the fetch call:
  ```javascript
  const randomDelay = Math.random() * 5000;
  setTimeout(() => {
    fetchQuizQuestions();
  }, randomDelay);
  ```
* **Result:** Spreads the 1,000 requests smoothly over 5 seconds (~200 reqs/sec), keeping the database running smoothly.

### 3. Telemetry Buffering (Batching Anti-Cheat Events)
* **The Problem:** Students generate cheat events (tab switching, focus loss) continuously. Sending a database write on every single keystroke or focus loss from 1,000 students generates tens of thousands of requests per minute, locking the DB.
* **The Fix:** The client buffers all anti-cheat events locally in memory and flushes them to the server **once every 60 seconds** (or when the exam is submitted), reducing hits on the backend by 95%.

### 4. Hybrid Real-Time Model
* Stateful WebSockets are resource-heavy and will crash a 512MB RAM server. 
* The system uses WebSockets **only during the exam lobby phase** (presence grid) and **automatically disconnects** them when the exam begins. 
* All answer autosaving is performed over standard stateless **HTTP POST requests**, which are opened and closed instantly to release resources.

---

## SECTION 3 — LEAD ROLE CARDS

### 🔴 THARUN — Tech Lead + Backend Lead
* **Owns:** Overall architecture, NestJS backend, Database schema (TypeORM), API contracts, Cryptographic handshake validation, final merge authority.
* **Primary Responsibilities:**
  * Scaffold monolithic portable NestJS backend (12 modules).
  * Supabase JWT → NestJS Passport strategy (authentication layer).
  * SECURE API endpoints: Quiz questions delivery (filtering out correct answers), Server-side attempts grading, and batch telemetry logging.
  * Secure Handshake Guard: Verifying cryptographic custom headers injected by Android & Electron clients to block standard browser access.
  * Anti-cheat evaluation: Telemetry batch threshold checks and auto-flagging.
  * Swagger API documentation at `/api/docs`.

### 🔴 NITHIL — Realtime Systems Lead
* **Owns:** Socket.IO gateway, Redis pub/sub, Timer synchronization, Reconnect logic.
* **Primary Responsibilities:**
  * Socket.IO gateway in NestJS (`@nestjs/websockets`).
  * Server-driven timer tick broadcasts (zero client clock trust).
  * Room lifecycle states: create → join → start → disconnect Socket.IO.
  * Guaranteed delivery via event acknowledgment (ACK) system.
  * Sync telemetry notifications to the Teacher Portal.

### 🔴 SURJITH — Mobile Lead (Flutter Android)
* **Owns:** Flutter Android Application, Mobile device anti-cheat enforcement.
* **Primary Responsibilities:**
  * Riverpod state management & GoRouter navigation.
  * Cryptographic handshake injection into client requests.
  * Android secure overlay detection, immersive fullscreen lock, and screenshot blocking (`FLAG_SECURE`).
  * AppLifecycle backgrounding telemetry batching.

---

## SECTION 4 — EXECUTOR ROLE CARDS (TIER 2)

### 🟡 SUNDAR — Teacher Portal & PC Browser Shell
* **Owns:** proble-teacher React app, Custom PC Secure Browser Electron wrapper.
* **Primary Responsibilities:**
  * Electron Windowing: Fullscreen kiosk mode configuration, Alt+F4 interceptors, always-on-top windowing.
  * Integrate Axios client to communicate with Tharun's NestJS API.
  * Live monitoring panel for teachers (Answer distribution, real-time flagged alert feed).

### 🟡 AARYA — Admin Portal & PC Browser Security
* **Owns:** proble-admin React app, Electron PC Security Modules.
* **Primary Responsibilities:**
  * Electron Process Scanner: Scan active Windows/macOS background processes for screen recorders (OBS, Zoom) and remote desktop tools (AnyDesk).
  * Electron VM Shield: Intercept BIOS/motherboard identifiers to completely block running inside Virtual Machines.
  * Shared UI Component library.

### 🟡 MADAN — DevOps + Infrastructure
* **Owns:** Vercel serverless configurations, GitHub Actions CI/CD pipelines, k6 load testing scripts.
* **Primary Responsibilities:**
  * Configure NestJS serverless deployment on Vercel.
  * Set up Rate Limiter (`nestjs/throttler`), CORS whitelist, and security headers.
  * Execute k6 load tests to simulate 1,000 staggered users.

---

## SECTION 5 — SPRINT BREAKDOWN

```
Weeks 1-2 ──> Foundation: NestJS Scaffold, Supabase Auth Integration, Handshake Spec
Weeks 3-4 ──> Core Flow: Attempts API, Excel SheetJS Import, Kiosk Windowing, FEATURE FREEZE
Weeks 5-6 ──> Security: Telemetry Batching Ingestion, OS Keyboard Hooking, VM Shield
Week 7    ──> Integration: 50-student load test, 8-hour WS stress test, API Hardening
Week 8    ──> SRM Pilot Launch: Deploy to 30 students, On-Call support
```

---

## SECTION 6 — COORDINATION & COMPLIANCE

* **Standups:** 15 minutes daily (Yesterday, Today, Blockers).
* **PR Process:** All features must go through a PR. No pushing directly to `main`.
* **Feature Freeze:** Strictly enforced after Week 4. Weeks 5–8 are strictly for security testing, stress testing, and hardening what is already built.
