# CLAUDE.md

Project guardrails for contributors working on ClawGame.

## 1) Core rules (non-negotiable)

1. OpenClaw source is the protocol truth.
2. Test-first for behavior changes: write a failing test before implementation.
3. Never invent Gateway RPC/event names. Verify in OpenClaw source first.
4. Keep changes minimal and scoped; avoid drive-by refactors.
5. Prefer compatibility over novelty when Gateway behavior is unclear.

## 2) OpenClaw reference policy

Before implementing any gateway integration, confirm against OpenClaw source:

- `src/gateway/server-methods-list.ts` (available RPC methods and events)
- `src/gateway/protocol/schema/*.ts` (request/response/event payload schemas)
- `src/gateway/server-chat.ts` (agent/chat event dispatch behavior)
- `src/gateway/server-cron.ts` (cron event shape and broadcast)
- `src/gateway/server/presence-events.ts` (presence semantics)
- `src/gateway/method-scopes.ts` (method scope and privilege model)

If docs and source differ, follow source code behavior and add a note in code comments/tests.

## 3) Test-first workflow

For bug fixes:

1. Add/extend a test that reproduces the bug.
2. Confirm it fails.
3. Implement the smallest fix.
4. Confirm tests pass.

For new features:

1. Add contract tests for message shape/state transitions.
2. Add unit tests for core logic.
3. Add integration tests where gateway flow is involved.
4. Implement feature incrementally until tests pass.

Do not merge behavior changes without tests unless explicitly approved.

## 4) Protocol and state management rules

1. Treat gateway payloads as untrusted: validate and normalize.
2. On reconnect, always resync from source-of-truth RPCs.
3. Use stable state precedence rules and document them in tests.
4. Avoid unnecessary full snapshots; prefer fine-grained events when safe.
5. Include sequence or timestamp handling to prevent stale state regressions.

## 5) Security and safety rules

1. Any RPC proxy must use an explicit allowlist.
2. Default to least-privilege method access.
3. Do not expose sensitive local data to frontend by default.
4. Avoid destructive filesystem or git actions unless explicitly requested.
5. Never bypass auth or scope checks in "temporary" debug code.

## 6) Code quality rules

1. Keep TypeScript strict and types close to protocol schemas.
2. Prefer small modules with single responsibility.
3. Keep logs actionable: include runId/sessionKey/agentId when relevant.
4. Avoid hidden magic constants; centralize thresholds and limits.
5. Document non-obvious tradeoffs with brief comments.

## 7) Performance and reliability rules

1. Use bounded buffers/ring buffers for in-memory event history.
2. Avoid unbounded maps/queues; add TTL or max-size policies.
3. Throttle/debounce high-frequency UI updates where needed.
4. Ensure cleanup of timers/listeners on shutdown and reconnect.
5. Treat mock behavior as a contract test target; keep it close to real gateway.

## 8) Definition of done

A task is done only when all are true:

1. Relevant tests added/updated and passing.
2. `pnpm test` passes.
3. `pnpm build` passes.
4. Manual smoke test works with `--mock`.
5. Critical path is sanity-checked against a real OpenClaw gateway.
6. Docs/types updated for any protocol or behavior change.

## 9) Recommended commands

- Run tests: `pnpm test`
- Build all: `pnpm build`
- Run daemon (mock): `pnpm dev:daemon -- --mock`
- Run web: `pnpm dev:web`

## 10) Decision priority

When tradeoffs conflict, prioritize in this order:

1. Correctness and protocol compatibility
2. Testability and debuggability
3. Security and least privilege
4. Simplicity
5. Feature speed
