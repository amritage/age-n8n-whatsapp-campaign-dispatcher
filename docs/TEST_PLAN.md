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
| T-29 | Native Chatwoot campaign mode with legacy 45-second pacing disabled | No per-message n8n pacing required; portfolio cycle gap enforced instead |
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

## New native-Chatwoot acceptance tests (blocking for LIVE)

| Test | Scenario | Pass |
|---|---|---|
| T-35 | 4,200 eligible, portfolio cap conservatively 2,000 | Exactly 2,000 or fewer reserved for Chatwoot, remainder stays UNSENT EspoCRM |
| T-36 | Remove 50 previously UNSENT before following cycle | 50 excluded; no stale Chatwoot label reintroduces them |
| T-37 | 350 newly eligible leads next cycle | Only eligible new + old UNSENT + due retry recipients selected; no mass resend |
| T-38 | 3 campaigns share one portfolio cycle | One atomic portfolio cap across batches, unique canonical phone, deterministic priority/fairness |
| T-39 | Global previous cycle batch completed 25h ago | No new Chatwoot campaign created |
| T-40 | One of prior cycle batches still processing/Unknown | No new cycle even if other batch ended >26h ago |
| T-41 | 26h passed but campaign's date/window/weekday disallows sends | Campaign deferred; no out-of-window launch |
| T-42 | Chatwoot campaign create timeout after potential success | Unknown; no blind duplicate create; operator/reconciler resolution |
| T-43 | 26h gap passed, other portfolio sender used capacity | Limit reservation reduces or blocks batch; no guessed 2,000 free |
| T-44 | Chatwoot reports 26 pages of recipients (25/page) | Every page fetched; status/errors attributed exactly and idempotently |
| T-45 | Analytics endpoint 403, not entitled or incomplete | No falsely marked delivered/failed; block next cycle where reconciliation required |
| T-46 | 131049 initial failure; existing policy due at +8, then +18 from preceding retry failure, then +28 from preceding retry failure | No early retries on D0+18 or +28; enforce CRM retry-policy API and stop on delivery/opt-out |
| T-47 | 131026/130472 held 180 days, then review date arrives | Review eligibility; never auto-override provider restriction/consent |
| T-48 | Change segment or master OFF after label sync but before campaign create | No Chatwoot campaign POST; audit/defer safely |
| T-49 | Two overlapping schedule triggers at 60-minute interval | One global portfolio cycle reservation, no duplicate batches |
| T-50 | New workflows imported without live adapter | No Chatwoot/CRM writes, no message sent |

## Interim compatibility and probe checks

| Test | Scenario | Pass criterion |
|---|---|---|
| T-51 | CRM existing 131049 policy, initial failure D0 | First retry earliest D0+8; if it fails immediately, later retries earliest D0+26 and D0+54; stale original-offset logic must not schedule earlier |
| T-52 | CRM retry-policy missing, wrong recipient, or DENY | New dispatcher refuses send and logs reason; never bypasses old extension |
| T-53 | Manual read-only API readiness workflow imported with placeholders | Cannot make network request until hosts/IDs and credentials configured; zero send/mutation endpoints |
| T-54 | Authorized read-only health probe returns 403 from Chatwoot analytics | Fails readiness; no CRM/customer state changed |
