# Mandatory development requirement — WhatsApp campaign outcomes and analytics

**Approved business requirement:** 24 October 2026  
**Applies to:** All WhatsApp campaigns sent through Chatwoot using the official Meta WhatsApp Business API, including campaigns mapped to EspoCRM, all their Chatwoot one-off batches, recipients and retries.

> **Original requested instruction**
>
> For all WhatsApp campaigns sent via Chatwoot using Meta WhatsApp Business API, reliably track and reconcile delivery, failure, Meta error codes, and all other critical campaign analytics in n8n and EspoCRM; collect Read status wherever available without additional complexity or cost, and treat a confirmed Read as proof of delivery without double-counting.

## 1. Mandatory outcomes

- Automatically discover relevant Chatwoot native WhatsApp campaigns and reconcile them against the authoritative EspoCRM campaign and recipient records. No manual campaign ID entry on every run. A Chatwoot campaign with no **verified** EspoCRM batch mapping stays UNMATCHED; never join solely by name or unverified phone.
- Capture, when actually evidenced: audience, suppressed/skipped, queued, submitted, sent, delivered, read, failed, unknown and unmatched; the Meta error code, description, status source and source timestamp; time observed by n8n; source message ID, sender/inbox and campaign/batch/recipient identity.
- Keep authoritative provider outcomes and audit history consistent across n8n and EspoCRM. No fabricated Meta IDs, delivery dates, consent, retry eligibility, success counts or zero failures.
- Chatwoot campaign COMPLETE means its own job/processing completed; **not** proof that all Meta deliveries or read receipts are final.
- Incrementally recheck outstanding/recently completed batches for late, missing, conflicting and out-of-order outcomes; avoid full repeated historical scans.
- Do not modify existing installed EspoCRM extensions, older n8n workflows or Chatwoot source without separate authorization. The current 3-workflow diagnostics pack remains read-only.

## 2. Read status: exact rule

**A confirmed READ event for a specific Meta message proves that same message was delivered. A separate DELIVERED event is not required.**

For each uniquely identified message or attempt:
- SENT then DELIVERED then READ => delivered-confirmed **1**, read-confirmed **1**.
- SENT then READ only => delivered-confirmed **1**, read-confirmed **1**. Keep the actual delivered-at timestamp unknown unless separately observed; read-at is not necessarily the exact delivery time.
- READ arrives before a delayed DELIVERED, or a READ/DELIVERED event is duplicated => delivered-confirmed remains **1**.
- Status ordering for trusted positive progression is SENT → DELIVERED → READ. A stale event must not downgrade READ to DELIVERED or SENT.
- A contradictory FAILED event after trusted success must be retained as evidence and flagged for investigation; do not silently overwrite success with an unrelated or lower-confidence failure.
- Missing READ is **unknown/unavailable**, not proof that a message was unread. READ must be collected only wherever existing standard events or authorized APIs already expose it; **no new paid subscription, provider add-on, duplicate sending, extra per-recipient API calls or complex machinery solely to obtain Read**.

### Distinct counting, without double-counting

Define all rates at a **documented grain** (message attempt, unique campaign recipient, campaign batch, or local business day).

- **Delivered-inclusive-of-Read = distinct message IDs with trusted DELIVERED OR trusted READ.** This is a union. Never Delivered + Read.
- **Read confirmed = distinct message IDs with trusted READ**, a subset of delivered-inclusive.
- **Delivered but not Read = Delivered-inclusive minus Read-confirmed**, if a mutually exclusive status breakdown is required.
- **Failed = provider-confirmed failed message attempts**, separately tracked and reconciled against later contradictory statuses.
- A campaign having 85 Delivered and 30 Read statuses referring to the *same 85 messages* has **85 delivered-confirmed**, **30 read-confirmed**, NOT 115 delivered.
- A message observed only as READ must count once as delivered. The AGE daily delivered KPI must **never increment a second time** when a later DELIVERED or duplicate READ event arrives.
- Distinct messages/retries to a single recipient remain separate message attempts. If computing unique recipient totals or Meta portfolio 24h capacity, **deduplicate by the correct verified recipient identity**, not by message-attempt count.
- Use canonical per-message deduplication keys and explicit aggregation rules for retries and late updates, rather than summing webhook events.

## 3. Evidence sources, chosen for minimum recurring cost

Use existing capabilities only after confirming actual deployed behavior, in priority order:

1. **Existing Meta status callbacks and Chatwoot message status/webhook events**, when they carry trustworthy message IDs, statuses and timestamps; reuse existing webhook infrastructure, never assume a Chatwoot message-update event includes all Meta fields until verified.
2. **Existing Chatwoot campaign analytics**, if the account already has access. Its GET metrics/recipients may be paid-feature gated, and aggregate analytics may lack provider message identity/time. A 401/403/404 is BLOCKED, not proof of no failures.
3. If separately authorized and needed, **read-only Chatwoot v4.19 database evidence** with a restricted account, validating that an underlying source/message ID actually corresponds to Meta's message ID. Do not alter Chatwoot tables or licensing controls.
4. **Bounded incremental reconciliation** of unresolved batches/late statuses when no reliable webhook event is available. Paginate correctly, checkpoint progress and provide coverage/discrepancy reporting. Avoid fetching every historical recipient every six hours.

Native n8n nodes are preferred where they expose reliable data. n8n Data Tables suit **small configuration and reporting checkpoints**; they do not guarantee atomic multi-worker reservations or replace a durable high-volume per-message event audit store. Do not force a new paid analytics dependency solely to see Read.

## 4. Required linkage and fields

**Verified mapping:** EspoCRM campaign ID -> EspoCRM recipient and attempt IDs -> n8n cycle/batch ID -> Chatwoot account/inbox/campaign display ID and contact ID -> independent Meta message ID, where available and validated.

For each event/attempt retain (when present):
- Canonical recipient/attempt/message identity, status, previous status and verified source.
- Provider message ID, provider event timestamp in UTC, n8n observed-at timestamp.
- Submitted/sent/delivered/read/failed timestamps **only when independently evidenced**.
- Exact Meta error code, error title, description, failure category, suppression/retry decision and appropriate review date.
- Reconciling state: MATCHED, UNMATCHED, UNKNOWN, PARTIAL, BLOCKED or RECONCILED; coverage and last successful cursor.

EspoCRM is the authoritative business record. Its existing AGE Campaign Management source-reviewed attempt endpoint may record Submitted immediately; **do not claim a submission solely because Chatwoot accepted a batch-creation request**. Use the actual deployed extension's event contract; never fabricate a message ID to pass API validation. Preserve existing 131049 retry scheduling, 131050 marketing suppression, and the rule that 131026 does not prove Not Registered.

## 5. Minimum analytics required

For each EspoCRM campaign and Chatwoot batch show:
- intended audience, excluded/suppressed, queued, submitted, sent;
- **delivered confirmed including Read**, Read confirmed (where available), failed, pending/unknown and unmatched;
- per-Meta-error-code failure counts and failure percentage with its correct denominator;
- reconciliation coverage, missing/ambiguous message IDs, duplicate events suppressed, contradictory status events, late status changes, last successful sync and data freshness;
- separate business-day delivered target, actual attempt/submit count, Meta rolling-24h unique-recipient capacity estimates and spend as available — never conflate them.

## 6. Acceptance tests for future development

Future reconciliation workflow or code changes MUST include automated tests for:

1. SENT→DELIVERED→READ: **one** delivered, one Read.
2. SENT→READ without Delivered: **one** delivered, one Read; no invented deliveredAt.
3. READ→DELIVERED and duplicate events: no downgrades, no duplicate counts.
4. Same Meta event through webhook, polling and n8n retry: idempotent outcome and EspoCRM write.
5. Multiple message attempts/retries for one person: correct message and unique-recipient counting.
6. Error 131049, ambiguous 131026, marketing opt-out 131050: raw evidence and correct independent policies.
7. Missing Meta ID, unmapped campaign, 403 analytics, missing Read, incomplete pages or API downtime: honest UNKNOWN/BLOCKED/PARTIAL reporting, never invented success.
8. Late READ after batch completion: existing delivered count remains stable if it was already delivered, while Read coverage increases.
9. Failed/Delivered/Read contradictions: preserve raw evidence, flag conflicts, do not silently count twice.
10. Complete campaign reconciliation includes ALL related batches and preserves verified associations to their EspoCRM campaign and recipient IDs.

All production event-sync and sending integration requires an authorized, limited pilot; this document is **a development requirement**, not proof implementation is ready or permission to send.

## Related project documents

- [Chatwoot v4.19 campaign orchestration](CHATWOOT_CAMPAIGN_ORCHESTRATION.md)
- [EspoCRM–Chatwoot API contract](ESPOCRM_CHATWOOT_API_CONTRACT.md)
- [AGE extension compatibility](ACTUAL_EXTENSION_COMPATIBILITY.md)
- [Data Tables architecture decision](DATA_TABLE_STORAGE_DECISION.md)
