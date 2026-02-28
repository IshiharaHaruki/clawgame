# ClawGame Design Document

## Overview

ClawGame is an open-source tool that visualizes OpenClaw AI agents as pixel art characters in a virtual office. Each agent becomes a game character whose behavior reflects its real-time status: working at a desk when active, relaxing at the coffee bar when idle, and displaying cron job schedules as in-game calendars.

The product follows the same architectural pattern as Happy Coder (slopus/happy): a CLI wrapper + persistent daemon + relay server + cross-platform native app. The MVP-Lite phase focuses on just the daemon + web frontend; server, auth, E2E, and native apps come in later phases.

## Product Architecture (Full Vision)

```
packages/
  clawgame-cli/       -- CLI wrapper, wraps openclaw, daemon
  clawgame-app/       -- Expo (React Native) app: iOS, Android, Web, macOS (Tauri)
  clawgame-server/    -- Relay server with E2E encryption
  clawgame-wire/      -- Shared Zod schemas and wire protocol types
```

### System Diagram

```
┌──────────────┐     ┌──────────────┐     ┌──────────────────────────┐
│  Phone App   │     │  Web Browser │     │  macOS App (Tauri)       │
│  (Expo RN)   │     │  (SPA)       │     │                          │
│              │     │              │     │                          │
│  ┌────────┐  │     │  ┌────────┐  │     │  ┌────────┐             │
│  │WebView │  │     │  │ Phaser │  │     │  │ Phaser │             │
│  │+Phaser │  │     │  │ Canvas │  │     │  │ Canvas │             │
│  └────────┘  │     │  └────────┘  │     │  └────────┘             │
└──────┬───────┘     └──────┬───────┘     └──────────┬──────────────┘
       │                    │                         │
       │           Socket.IO (encrypted)              │
       │                    │                         │
       └────────────────────┼─────────────────────────┘
                            │
                 ┌──────────┴──────────┐
                 │  clawgame-server    │
                 │  (Relay + E2E)      │
                 │  Fastify + Prisma   │
                 │  PostgreSQL/PGlite  │
                 └──────────┬──────────┘
                            │
                   Socket.IO (encrypted)
                            │
                 ┌──────────┴──────────┐
                 │  clawgame-cli       │
                 │  (Daemon)           │
                 │                     │
                 │  ┌────────────────┐ │
                 │  │ OpenClaw WS    │ │
                 │  │ RPC Client     │ │
                 │  │                │ │
                 │  │ - cron.list    │ │
                 │  │ - sessions.list│ │
                 │  │ - presence     │ │
                 │  │ - agent events │ │
                 │  └────────────────┘ │
                 └──────────┬──────────┘
                            │
                   WebSocket RPC
                            │
                 ┌──────────┴──────────┐
                 │  OpenClaw Gateway   │
                 │  (127.0.0.1:18789)  │
                 └─────────────────────┘
```

## Package Details

### 1. clawgame-wire

Shared Zod schemas consumed by all other packages.

**Key types:**
- `AgentState`: Agent identity, status (active/idle/error), current model, workspace
- `CronJob`: Job ID, name, schedule (at/every/cron), timezone, last run, next run
- `CronRun`: Run ID, job ID, start/end time, status, output summary
- `GameState`: Complete snapshot of all agents and their cron jobs for rendering
- `SessionMessage`: Encrypted message envelope (same pattern as happy-wire)
- `PresenceEvent`: Agent online/offline transitions

**Wire protocol events (daemon → server → app):**

| Event | Payload | Description |
|-------|---------|-------------|
| `agent:state` | `AgentState` | Agent status changed (active ↔ idle) |
| `cron:list` | `CronJob[]` | Full cron job list for an agent |
| `cron:run:start` | `CronRun` | A cron job started executing |
| `cron:run:end` | `CronRun` | A cron job finished |
| `game:snapshot` | `GameState` | Full state snapshot (on connect / resync) |

### 2. clawgame-cli

CLI entry point and background daemon.

**CLI commands:**

| Command | Description |
|---------|-------------|
| `clawgame` | Default: start daemon + open browser |
| `clawgame start` | Start the daemon |
| `clawgame stop` | Stop the daemon |
| `clawgame status` | Show daemon and agent status |
| `clawgame open` | Open the game in default browser |
| `clawgame auth` | Login / logout / token management |
| `clawgame daemon install` | Install as system service (launchd/systemd) |
| `clawgame daemon uninstall` | Remove system service |

**Daemon responsibilities:**
1. Acquire filesystem lock (single instance)
2. Connect to OpenClaw Gateway via WebSocket RPC
3. Poll/subscribe to agent state: `sessions.list`, `cron.list`, `presence` events
4. Connect to clawgame-server via Socket.IO (encrypted)
5. Relay agent state updates to server
6. Write `daemon.state.json` (PID, port, version)
7. Auto-restart on version change (same as Happy)

**OpenClaw Gateway integration:**

The daemon acts as a bridge between OpenClaw's WebSocket RPC API and the ClawGame relay server. It subscribes to:
- `sessions.list` — discover all agents
- `cron.list` / `cron.listPage` — get each agent's scheduled jobs
- `cron.runs.page` — recent run history
- `agent` events — real-time agent activity (streaming tool calls, replies)
- `presence` events — agent online/offline
- `tick` events — periodic heartbeat

State mapping logic:
```
OpenClaw agent event with streaming output  →  Agent is "working" (at desk)
OpenClaw presence: connected, no activity   →  Agent is "idle" (at coffee bar)
OpenClaw cron run starts                    →  Agent walks to desk, starts working
OpenClaw cron run ends                      →  Agent finishes, returns to coffee bar
OpenClaw agent error                        →  Agent shows error state (red indicator)
```

### 3. clawgame-server

Relay server enabling remote access with E2E encryption.

**Tech stack:** Fastify + Prisma + PostgreSQL (production) / PGlite (standalone Docker)

**Core features:**
- Socket.IO relay between daemon and app clients
- E2E encryption (NaCl/AES, same model as Happy)
- Account management and authentication
- Session persistence
- Push notification delivery (APNs / FCM)
- Standalone Docker deployment with PGlite (zero external deps)

**Database schema (Prisma):**

```prisma
model Account {
  id        String   @id @default(uuid())
  email     String   @unique
  publicKey String
  machines  Machine[]
  sessions  Session[]
}

model Machine {
  id        String   @id @default(uuid())
  name      String
  accountId String
  account   Account  @relation(fields: [accountId], references: [id])
  lastSeen  DateTime
  agents    AgentSnapshot[]
}

model AgentSnapshot {
  id        String   @id @default(uuid())
  agentId   String
  machineId String
  machine   Machine  @relation(fields: [machineId], references: [id])
  state     String   // encrypted JSON blob
  updatedAt DateTime @updatedAt
}

model Session {
  id        String   @id @default(uuid())
  accountId String
  account   Account  @relation(fields: [accountId], references: [id])
  metadata  String   // encrypted
}
```

**Deployment options:**
- `Dockerfile` — Standalone (PGlite, single container)
- `Dockerfile.server` — Production (external Postgres + Redis)
- `Dockerfile.webapp` — Web app (Expo web export + Nginx)

### 4. clawgame-app

Cross-platform application built with Expo (React Native).

**Platforms:**
- iOS (App Store)
- Android (Google Play)
- Web (Expo web export, static SPA served by Nginx)
- macOS (Tauri v2 wrapping web export)

**App structure:**

```
sources/
  app/                  -- Expo Router pages
    (tabs)/
      game.tsx          -- Main game view (Phaser canvas)
      schedule.tsx      -- Cron schedule list view
      settings.tsx      -- Configuration
  game/                 -- Phaser game source
    scenes/
      OfficeScene.ts    -- Main office scene (tilemap, furniture)
    entities/
      AgentCharacter.ts -- Agent sprite with state machine
    assets/
      sprites/          -- Character sprite sheets (16x16 pixel art)
      tilemaps/          -- Office tilemap (Tiled JSON)
      ui/               -- UI sprites (speech bubbles, status icons)
    GameBridge.ts       -- React ↔ Phaser communication layer
  sync/                 -- Socket.IO + encryption sync engine
  encryption/           -- E2E crypto (libsodium / NaCl)
  auth/                 -- Token storage, authentication
  components/           -- Shared React Native UI components
  hooks/                -- React hooks
```

**Game view embedding:**
- Web: Phaser canvas renders directly in a `<div>` — no WebView needed
- iOS/Android: `react-native-webview` hosts the Phaser game bundle
- macOS (Tauri): Same as web, Phaser renders directly

**React ↔ Phaser communication (GameBridge):**
- Web: Direct JavaScript calls via shared event emitter
- Native (WebView): `postMessage` / `onMessage` bridge
- GameBridge abstracts this difference — React side calls `gameBridge.updateAgentState(agentId, state)`, Phaser side receives it regardless of platform

## Game Design

### Office Layout

Single room, pixel art, top-down or 3/4 view. Built with Tiled map editor.

```
+--------------------------------------------------+
|                  ClawGame Office                  |
|                                                   |
|  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         |
|  │ Desk │  │ Desk │  │ Desk │  │ Desk │         |
|  │ [A1] │  │ [A2] │  │ [A3] │  │ [A4] │         |
|  └──────┘  └──────┘  └──────┘  └──────┘         |
|                                                   |
|  ┌──────┐  ┌──────┐  ┌──────┐  ┌──────┐         |
|  │ Desk │  │ Desk │  │ Desk │  │ Desk │         |
|  │ [A5] │  │ [A6] │  │ [A7] │  │ [A8] │         |
|  └──────┘  └──────┘  └──────┘  └──────┘         |
|                                                   |
|  ┌─────────────────┐  ┌───────────────────────┐  |
|  │   Coffee Bar    │  │   Schedule Board      │  |
|  │   ☕ ☕ ☕       │  │   (click to expand)   │  |
|  └─────────────────┘  └───────────────────────┘  |
+--------------------------------------------------+
```

The office auto-scales based on agent count. With 1-4 agents, only the top row of desks appears. Furniture fills in as more agents are added.

### Agent Character States

Each agent is a 16x16 pixel sprite with the following states and animations:

| State | Visual | Trigger |
|-------|--------|---------|
| **Working** | Sitting at desk, typing animation (2-3 frames) | `agent` event with streaming output |
| **Idle** | Standing at coffee bar, sipping animation | No activity for configurable idle threshold |
| **Walking** | Walk cycle (4 frames, 4 directions) | Transitioning between desk and coffee bar |
| **Cron Running** | At desk with clock icon overlay | `cron:run:start` event |
| **Error** | At desk with red exclamation mark | Agent error event |
| **Offline** | Ghost/transparent sprite at desk | Agent presence: disconnected |

### Interaction

- **Click/tap an agent** → Opens detail panel showing:
  - Agent name and ID
  - Current model (e.g., claude-sonnet-4-5)
  - Workspace path
  - Status and uptime
  - Cron job schedule table (next run times, last results)
- **Click/tap the Schedule Board** → Full-screen cron schedule view for all agents
- **Pinch to zoom** on mobile, scroll wheel on desktop

### Sprite Assets (MVP)

For MVP, use a single generic character sprite sheet with color palette swaps to differentiate agents. Each agent gets a deterministic color based on a hash of its agent ID. Later iterations can add unique character designs.

Character sprite sheet spec:
- 16x16 pixels per frame
- 4 directions (down, left, right, up)
- Animations: idle (2 frames), walk (4 frames), sit-work (3 frames), sit-idle (2 frames), sip-coffee (3 frames)
- Total: ~60 frames per palette variant

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Language | TypeScript (all packages) |
| Runtime | Node.js >= 22 |
| Package Manager | pnpm or Yarn workspaces |
| CLI Framework | Hand-rolled (same pattern as Happy) |
| Daemon HTTP | Fastify |
| Server | Fastify + Prisma + PostgreSQL/PGlite |
| Real-time | Socket.IO v4 |
| Schema Validation | Zod (shared via clawgame-wire) |
| Mobile/Web App | Expo (React Native) + Expo Router |
| Game Engine | Phaser 3 |
| Tilemap Editor | Tiled (JSON export) |
| Desktop | Tauri v2 (macOS) |
| Encryption | TweetNaCl (CLI), libsodium (app) |
| Testing | Vitest |
| Build | tsdown (CLI/server), Vite (web), EAS (mobile) |
| Docker | Multi-stage builds (standalone + production + webapp) |

## E2E Encryption Model

Same model as Happy Coder:

1. Each account generates a NaCl Ed25519 key pair on registration
2. Private key stored locally: `~/.clawgame/access.key` (CLI), Secure Storage (mobile)
3. Per-session data encryption keys (AES) stored encrypted on the server
4. All `SessionMessage.content` fields are `{ c: string, t: 'encrypted' }` ciphertext
5. The relay server never sees plaintext agent data

## Data Flow

### MVP-Lite Data Flow (daemon → browser, local only)

#### Agent state update (working/idle)

```
1. OpenClaw Gateway emits `agent` event (agent is processing)
2. Daemon receives event, updates in-memory agent state
3. Daemon applies state priority rules: agent A1 → "working"
4. Daemon sends state update via local WebSocket to browser
5. React receives, calls GameBridge.updateAgentState("A1", "working")
6. Phaser scene: A1 character walks from coffee bar to desk, starts typing animation
```

#### Cron job fires

```
1. OpenClaw Gateway emits cron run start
2. Daemon receives, maps: agent A2 → "cron_running", job = "Morning Status"
3. Daemon sends via local WebSocket to browser
4. Phaser: A2 walks to desk, clock icon appears, speech bubble shows job name
5. When cron run ends: daemon re-fetches cron.list, A2 returns to idle
```

#### User clicks agent character

```
1. Phaser registers click on A1 sprite
2. GameBridge emits "agent:selected" with agentId
3. React receives event, opens detail panel (HTML overlay on canvas)
4. Panel reads agent details + cron schedule from local state
5. Displays: name, model, status, cron table with next/last runs
```

### Full Data Flow (Phase 1+, with relay server)

Same as above but steps 3-4 go through the encrypted relay:
```
3. Daemon encrypts state update
4. Daemon sends via Socket.IO to clawgame-server
5. Server relays to all connected app clients
6. App decrypts, updates game state
```

## State Resolution Rules

### State Priority (highest → lowest)

When multiple signals arrive simultaneously, the highest-priority state wins:

```
error > offline > cron_running > working > idle
```

- **error**: Agent emitted an error event. Overrides everything.
- **offline**: Agent presence disconnected. Cannot be working if not connected.
- **cron_running**: A cron job is actively executing. Treated as a specific kind of "working" but visually distinct (clock icon).
- **working**: Agent is processing a turn (streaming output detected).
- **idle**: Default state. No activity detected.

### Idle Detection

An agent transitions from `working` → `idle` when **no `agent` event with streaming output has been received for the idle threshold**.

- Default idle threshold: **120 seconds** (matches OpenClaw's default `idleMinutes`)
- Configurable via `~/.clawgame/config.json` → `idleThresholdSeconds`
- The daemon maintains a per-agent `lastActivityAt` timestamp, updated on every `agent` event
- A periodic timer (every 10s) checks all agents: if `now - lastActivityAt > idleThreshold`, emit state transition to `idle`

### Cron Timezone and Next-Run Calculation

All cron schedule times are sourced **exclusively from OpenClaw Gateway** via `cron.list` RPC response. The daemon and frontend never independently calculate next-run times.

- `cron.list` returns each job's `nextRunAt` (ISO 8601, UTC) and `timezone` (IANA string)
- The daemon passes these values through unchanged
- The frontend displays times converted to the user's local timezone using `Intl.DateTimeFormat`
- The daemon re-fetches `cron.list` on a 60-second interval and on every `cron:run:end` event to keep next-run times fresh

### Disconnect and Resync

When the WebSocket connection between the daemon and OpenClaw Gateway drops:

1. **Immediate**: All agents transition to `offline` state in the game
2. **Reconnect**: Daemon uses exponential backoff (1s, 2s, 4s, 8s, max 30s)
3. **Full resync on reconnect**:
   - Call `sessions.list` → rebuild agent roster (handles agents added/removed while disconnected)
   - Call `cron.list` for each agent → refresh all schedules
   - Emit `game:snapshot` with complete state to all connected frontends
   - Frontends replace their entire local state (not merge) to prevent stale data
4. **Sequence counter**: Each `game:snapshot` includes a monotonically increasing `seq` number. Frontends ignore snapshots with `seq` <= their current value (prevents out-of-order delivery issues).

When the frontend WebSocket to the daemon drops:
1. Game shows a "Reconnecting..." overlay
2. On reconnect, frontend requests a `game:snapshot` from the daemon
3. Full state replacement (same as above)

## Phased Delivery

### MVP-Lite (Phase 0)

Only two components, no network layer:

```
┌──────────────────────────────────────────┐
│  Browser (localhost)                     │
│  ┌────────────────────────────────────┐  │
│  │ Phaser Pixel Office + React UI    │  │
│  └──────────────┬─────────────────────┘  │
│                 │ WebSocket              │
│  ┌──────────────┴─────────────────────┐  │
│  │ clawgame daemon (local HTTP+WS)   │  │
│  └──────────────┬─────────────────────┘  │
│                 │ WebSocket RPC          │
│  ┌──────────────┴─────────────────────┐  │
│  │ OpenClaw Gateway (127.0.0.1:18789)│  │
│  └────────────────────────────────────┘  │
└──────────────────────────────────────────┘
```

**In scope:**
- `clawgame-cli`: daemon connects to local OpenClaw Gateway, serves static game assets, exposes WebSocket for frontend
- Web frontend: Phaser office scene + React schedule panel, connects to daemon's local WebSocket
- State resolution, idle detection, resync — all the rules above
- `clawgame start` / `clawgame stop` / `clawgame open` commands

**Explicitly out of scope:**
- clawgame-server (relay, auth, E2E encryption)
- Mobile apps (Expo, iOS, Android)
- Desktop app (Tauri)
- Push notifications
- Multi-machine support

### Phase 1: Remote Access

- clawgame-server: relay server with E2E encryption, PGlite standalone Docker
- Auth (account registration, key exchange)
- clawgame-wire: shared schemas extracted from MVP-Lite inline types

### Phase 2: Native Apps

- Expo app (iOS, Android, Web)
- Push notifications (APNs / FCM)
- macOS app (Tauri)

### Phase 3: Polish

- Custom character sprites per agent
- Agent interaction animations
- Sound effects
- Dark mode / theme support
- Multi-machine support
