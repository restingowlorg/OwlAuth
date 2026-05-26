# @restingowlorg/owlauth

## 1.2.0

### Minor Changes

- 3d1ab81: - **Password Security Hardening**: Integrated password strength checks and breach verification (fail-closed pwned password checks) during signup and change password actions.
  - **Enhanced Audit Logging & Request Tracing**: Introduced a secure audit logging layer and added comprehensive Correlation ID propagation for end-to-end request tracing.
  - **Security-First Token Invalidation**: Implemented automatic invalidation of active magic link tokens immediately upon a successful password change.
  - **Magic Link Architecture Hardening**: Refactored the magic link verification and consumption flows to use robust DB-backed validation, preventing race conditions.
  - **Database Schema Validation**: Enhanced database adapter initialization with strict PostgreSQL schema validation, MongoDB field alignment, and improved repository type-safety.
  - **Testing & Quality Gates**: Added a comprehensive unit test suite covering new security guards, breach checking, and Correlation ID tracing.

## 1.1.1

### Patch Changes

- c0ab4b3: Fix the published README logo by switching the image source to a stable GitHub-hosted asset that renders correctly on npm.

## 1.1.0

### Minor Changes

- 2c5e7c6: Initial public release of owlauth with credential auth, magic link auth, MongoDB/PostgreSQL adapters, and OWASP-aligned security hardening.
