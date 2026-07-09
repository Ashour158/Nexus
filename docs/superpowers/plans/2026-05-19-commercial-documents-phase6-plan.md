# Phase 6 - Commercial Documents and E-Sign Boundary

## Goal

Complete the commercial domain extraction by moving quote document rendering, revision/document reads, downloads, and e-sign lifecycle decisions out of route handlers.

## Scope

- [x] Add commercial use-case methods for quote revisions and rendered documents.
- [x] Add commercial use-case rendering logic for HTML, PDF, and DOCX quote packages.
- [x] Add commercial use-case download policy for embedded binary, HTML, and tracked external storage exports.
- [x] Add commercial use-case methods for e-sign envelope list, send, and status updates.
- [x] Update quote document routes to act only as HTTP adapters.
- [x] Add/extend tests for rendering, download, and signature lifecycle.
- [x] Run finance commercial regression tests, finance typecheck, web typecheck, and diff check.

## Business Rules Preserved

- Expired quotes cannot be rendered or sent for signature.
- Signature workflows can only start after the quote has been sent/viewed/accepted.
- Signed envelopes accept the quote and increment quote version.
- All document and e-sign reads/writes remain tenant-scoped.
- Rendering publishes `quote.document.rendered`.
- E-sign send/update publishes `quote.esign.*`.
