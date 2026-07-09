# Phase 5 - Commercial Domain Boundary

## Goal

Move CPQ and commercial business decisions out of finance route handlers and into a reusable commercial use-case layer. The route layer should validate transport payloads, enforce permissions, and shape HTTP responses only.

## Scope

- [x] Introduce a commercial domain use-case for quotes, DRQs, RFQs, quote templates, and orders.
- [x] Keep CPQ pricing, discount approval, DRQ hierarchy, RFQ conversion, quote expiry, template validation, and quote-to-order conversion wired through one boundary.
- [x] Refactor quote routes to delegate create/update/lifecycle actions to the commercial use-case.
- [x] Refactor DRQ routes to delegate list/create/reason options to the commercial use-case.
- [x] Refactor RFQ routes to delegate list/create/read/send/convert to the commercial use-case.
- [x] Refactor order routes to delegate list/create/quote conversion to the commercial use-case.
- [x] Refactor quote template routes to delegate list/create/update/template validation to the commercial use-case.
- [x] Run targeted commercial tests and finance typecheck.
- [x] Run web typecheck and diff check.

## Notes

Quote document rendering and e-sign routes already enforce tenant, expiry, status, revision, and event rules in one route file. They remain in the finance service for this phase, while the core commercial record workflow is centralized first.
