# ADR 0005: Passkeys plus OAuth Authentication

## Status

Accepted

## Context

Tuvu needs secure personal accounts without introducing password storage in v1.
The app will also need convenient login for a small personal deployment.

## Decision

Use passkeys as the preferred authentication flow and OAuth as a convenience
option. Store sessions in D1 and issue secure, HTTP-only cookies.

## Consequences

- No email/password flow is planned for v1.
- Phase 2 must add CSRF protection, rate limits, session expiry, and mocked tests
  for WebAuthn/OAuth flows.
- OAuth provider selection can start with one provider while keeping the model
  extensible.
