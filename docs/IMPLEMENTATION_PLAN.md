# Implementation plan — focus on target behavior

## Phase A: decisions and contracts (Tier 1)

1. Sign off eight business choices in [DECISIONS.md](DECISIONS.md).
2. Finalize CRM campaign/recipient/master source-of-truth schema and versioned retry/eligibility API.
3. Decide one authoritative sender-budget store and atomic reservation mechanism.
4. Build acceptance fixtures for consent, mixed Lead/Contact/Account identities, Meta codes and two-campaign competition.

**Exit:** Stable BR clauses, fields, owner approvals and API contract.

## Phase B: safe dispatcher core (Tier 1)

1. Deterministic due queue with cursor, lease and per-phone deduplication.
2. Candidate-context-safe processing with scoped policy decisions and fail-closed error handling.
3. Preflight: Active/master, opt-in, suppression, associations, frequency, template, time, provider safety.
4. Global sender slot claim + hard attempt/cost guard + atomic pacing.
5. Verify Chatwoot contact-inbox recipient identity and submit exactly once.
6. Durable outbox and reconciliation for Reserved/Unknown/Submitted states.

**Exit:** T-01–T-23 pass.

## Phase C: delivery evidence and operations (Tier 2)

1. Deduplicated Meta/Chatwoot event ingestion and receipt correlation.
2. Late-event accounting by original attempt business day, sender ledger settlement.
3. Failure policy, retry review dates, emergency pause and circuit breaker.
4. Dashboard for campaign/sender performance and stalled states.
5. All remaining acceptance tests, controlled pilot, operator sign-off.

**Exit:** Measured pilot correctness, no duplicate POSTs, auditable delivered counts and clearly defined recovery.

## Deliberately excluded / later

- Graphical workflow redesign and node naming aesthetics
- AI personalization, adaptive time-of-day experiments and multi-provider routing
- Full CRM redesign, agent governance redesign and unnecessary copies of shared business knowledge
- Direct production deployment without end-to-end tests

## Dependencies

The dispatcher alone is insufficient to implement all target behavior. The EspoCRM extension, canonical Communication Sync, event ingestion/reconciliation workflows and selected atomic budget service need coordinated changes. Track each dependency separately; do **not** misrepresent the dispatcher repository as containing all of those systems.
