# Dependency security exceptions

Gate: zero **unexplained** critical/high production advisories (`pnpm audit --prod`).
Everything patchable in-place is pinned via `pnpm.overrides` in the root
`package.json` (see the "hermetic gateway build + pnpm security overrides"
commit): fast-jwt ≥6.2.4 (closed 3 criticals in the auth stack), axios ≥1.16,
@grpc/grpc-js, basic-ftp, fast-uri, fast-xml-builder, form-data,
nodemailer ≥7.0.11, protobufjs, ws, and xlsx pinned to the SheetJS CDN
0.20.3 tarball (the npm registry line stopped at 0.18.5 with no patch).

The remaining flagged advisories, each with its justification and exit plan:

| Advisory | Severity | Why it is accepted for the pilot | Exit plan |
|---|---|---|---|
| vitest UI arbitrary file read | critical | Dev-only test runner; never installed in production images; the UI server is never run in CI | Bump with the vitest 3 migration |
| vite `server.fs.deny` bypass | high | Dev server only; not in production images | Rides along with the vitest/vite dev-tool bump |
| Next.js ×5 (SSRF, middleware bypass, DoS) | high | Patched only in Next 15 — a breaking major for apps/web. Mitigations: app uses the App Router (the middleware bypass advisory targets Pages Router flows); the web middleware is defense-in-depth only — every backend service independently verifies the JWT, so bypassing the middleware does not bypass auth; the app is fronted by Caddy on a single origin | Scheduled Next 14→15 migration before commercial launch |
| Fastify content-type tab-char validation bypass | high | Patched only in fastify 5 — a breaking major across ~37 services. Mitigation: request bodies are validated by zod schemas in route handlers regardless of content-type parsing | Scheduled fastify 4→5 migration before commercial launch |
| @opentelemetry/sdk-node Prometheus exporter crash | high | Patched only in the OTel 2.x API line (breaking for @nexus/observability). Mitigation: the Prometheus/OTLP ports are loopback-bound on the host — not reachable externally | Bundle with the OTel 2.x upgrade |

Review cadence: re-run `pnpm audit --prod` in CI (security job) — any NEW
critical/high not in this table blocks the pipeline.
