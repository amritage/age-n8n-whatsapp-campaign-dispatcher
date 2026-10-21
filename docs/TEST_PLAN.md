# Acceptance tests and failure simulations

These scenarios are the minimal standard for approving the target design. Run with mock provider responses and anonymized IDs, then a tightly controlled real-number pilot only after operator approval.

| Test | Setup / action | Pass criterion |
|---|---|---|
| T-01 | Campaign inactive; master ON | DRY RUN; no reservation or Chatwoot write |
| T-02 | Campaign Active; master OFF | DRY RUN; no reservation or Chatwoot write |
| T-03 | Active + master ON but outside configured window or Sunday | No provider POST |
| T-04 | Master OFF toggled after queue selection / after reservation | No send; reservation released or marked CancelledBeforeSend |
| T-05 | Five mixed candidate records in same page | Each candidate uses its own CRM phone master, policy, association and history; no run-0 cross-contamination |
| T-06 | Same number sourced from Lead+Contact+Account | Exactly one recipient per campaign, provenance retained |
| T-07 | Inactive association with no other active/approved link | No send |
| T-08 | Active association with opt-out on phone master or association | No send, including after late opt-out |
| T-09 | Missing/contradictory consent | No send, reason logged |
| T-10 | Existing Chatwoot open conversation tied to stale/old contact-inbox identity | No send to old number; route repaired or held |
| T-11 | Template missing, language wrong, unapproved, or variables mismatch | No send |
| T-12 | Two scheduled workers claim same recipient at once | Exactly one reservation and one provider submission |
| T-13 | Two campaigns claim last sender budget slot at once | Only one atomic claim succeeds |
| T-14 | Delivered target 200, 199 delivered, one pending | No new claim until capacity is genuinely free |
| T-15 | Verified failed attempt releases pending slot | Delivered target still unfulfilled; hard attempt cost cap remains enforced |
| T-16 | 131026 observed | Preserve code; mark undeliverable/unknown, not Not Registered |
| T-17 | 131049 observed | No accelerated retry or provider restriction evasion |
| T-18 | 130472 observed | Retry only via authoritative policy |
| T-19 | Six-month review date arrives but opted-out customer | No send or automated override |
| T-20 | Retry policy API missing, stale, mismatched recipient ID or DENY | No further send |
| T-21 | Chatwoot POST returns 2xx | State Submitted, NOT Delivered until valid provider event |
| T-22 | Chatwoot POST times out after possible acceptance | State Unknown; do not blind resend |
| T-23 | Crash after reservation, before POST | Durable reconciliation avoids stranded attempts and duplicate submission |
| T-24 | Duplicate delivery/read webhook | Counts and status updated exactly once |
| T-25 | Read arrives, then older Failed event | Keep evidence and protect confirmed Read |
| T-26 | A late delivery arrives on following business day | Credit original attempt business day; do not incorrectly fill new day's target |
| T-27 | Sender budget cache/checkpoint absent, stale or inconsistent | Halt new send, emit alert; no invented capacity |
| T-28 | Cursor advanced then execution fails | Durable progress/replay is deterministic and does not starve a segment |
| T-29 | Pacing across two campaigns sharing a sender | Never less than configured min gap between provider POSTs |
| T-30 | Recipient removed at zero attempts | No future send; refresh does not silently re-enroll |
| T-31 | Historical unsubscribe outside recent-history page | Canonical opt-out still blocks |
| T-32 | Emergency pause / policy change during preparation | Final pre-POST enforcement blocks |
| T-33 | Unauthorized requests or replayed webhook signature | Rejected or idempotently ignored |
| T-34 | Masked logs for failed/blocked phone | No credentials, full customer PII or raw marketing payload exposed |

## Required metrics to demonstrate

- Unique submitted attempts vs delivered events per sender/day; exact conservation of quota slots
- At-least-once event receipt + effectively-once outcome settlement
- Zero cross-recipient attribution in mixed candidate batches
- Zero duplicate sends in concurrency, timeout and replay simulations
- Identifiable stop reason on every no-send path
- Backlog age, unknown-outcome count and stale reservation count
- Clear hand-off from DRY RUN to approved LIVE pilot

## Deployment exit criteria

All T-01–T-34 cases relevant to a release must pass, including T-05, T-08, T-10, T-12, T-13, T-22 and T-32. Any failed safety test blocks live deployment. Measure throughput only after correctness and compliance gates.
