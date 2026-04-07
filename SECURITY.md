# Security Policy

This is an authentication library. Security bugs here can affect every application built on top of it, so we take reports seriously and move fast on them.

**Do not open a public issue for a vulnerability.**

## Supported Versions

We apply security fixes to the current stable release (`latest`). Backports are case-by-case — severe issues may get one, minor ones won't.

If you're on the `next` prerelease channel (from `staging`), include the exact prerelease version in your report.

## Reporting a Vulnerability

Contact the maintainers directly through a private channel. Keep details off public threads until we've had a chance to assess and patch.

When you reach out, include:

- What the issue is and where you found it
- Which version(s) are affected
- Your environment (Node.js version, which database adapter, runtime)
- Steps to reproduce, or a proof of concept if you have one
- What you think the impact is — auth bypass, credential leak, token reuse, etc.
- Any fix ideas, if you have them (optional but appreciated)

## Response Times

We aim for:

| Severity | Acknowledgement | Triage   | Fix Target                   |
| -------- | --------------- | -------- | ---------------------------- |
| Critical | 24 hours        | 72 hours | Out-of-band patch ASAP       |
| High     | 2 business days | 5 days   | Next patch release or sooner |
| Medium   | 3 business days | 10 days  | Next scheduled release       |
| Low      | 5 business days | 15 days  | Best-effort, normal roadmap  |

These are targets, not SLAs. We'll keep you updated if something takes longer.

## What Happens After You Report

1. We confirm the issue and assess impact.
2. We prepare and test a fix privately.
3. We ship a patched release.
4. We publish a disclosure with remediation steps.

Critical auth issues — bypass, token forgery, credential exposure — may get an emergency out-of-band release rather than waiting for the next cycle.

## Scope

Things we want to hear about:

- Authentication bypass or privilege escalation
- Token replay, forgery, or validation flaws
- Credentials leaking into logs or API responses
- Bypasses in the password or magic-link flows

Things that are generally out of scope:

- Bugs in unsupported or end-of-life versions
- Issues in the consuming application that the library has no control over
- Non-security bugs with no exploitable impact
