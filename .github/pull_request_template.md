## Summary

Describe what changed and why.

<!-- Example:
Fixes a replay attack vector in the magic-link flow where tokens were not
invalidated after first use. Added a `usedAt` timestamp check in the
MagicLinkStrategy before issuing a session.
-->

## Release Impact

- Type: patch | minor | major
- User-facing change: yes/no
- Breaking change: yes/no

<!-- Example:
- Type: patch
- User-facing change: no (internal token validation logic)
- Breaking change: no
-->

## Checklist

- [ ] `npm run release:validate` passes
- [ ] docs updated if needed
- [ ] changeset added for user-facing changes
- [ ] migration notes added for breaking changes
