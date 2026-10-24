# Proposed integration contract — v1 (NOT existing verified EspoCRM endpoints)

Do not assume endpoint names in this document exist in the installed AGE Campaign Management extension. They are **proposed adapter operations**; implement or map them only after inspecting the installed extension/API. Prefer existing APIs where they satisfy the transactional guarantees. A normal GET followed by POST is not an atomic sender-wide claim.

## Cross-platform outcome reconciliation acceptance (24 October 2026)

The [approved delivery and analytics requirement](WHATSAPP_CAMPAIGN_DELIVERY_RECONCILIATION_REQUIREMENTS.md) is **mandatory** for implementation of ingestRecipientOutcome and analytics rollups. Treat a confirmed **Read** of a validated Meta message as proof that message was **Delivered**. Count delivered-inclusive as the **union** of distinct Delivered and Read messages; Read is not added as another delivery. Preserve Read when a delayed Delivered arrives. Support status deduplication, out-of-order delivery, provider error codes, source evidence and independently verified mapping to EspoCRM campaign/recipient/attempt IDs. Missing Read is UNKNOWN rather than confirmed unread; do not add a paid dependency solely for Read.

An accepted Chatwoot native campaign POST is **not** automatically a Submitted or Delivered message event; observe the deployed AGE extension's validation rules for /AGECampaign/attempt and /AGECampaign/event and never fake wamid/timestamps. Recipient statuses may be reconciled from existing provider webhooks, entitled analytics or authorized read-only evidence, with a documented fallback on endpoint denial.

## APIs/operations n8n needs
| Logical adapter operation | Input | Output / invariant |
|---|---|---|
| `listCampaigns` | timestamp, version | All Active/configured campaigns; sender, inbox, template, parameters, segment IDs, start/end dates, permitted weekdays/windows/TZ, category, min recipient gap, priority, cap, version |
| `getCurrentEligibleRecipients` | campaignId, audienceVersion, cursor | Live candidate snapshots: canonical phoneMasterId, normalized destination, Lead/Contact/Account attribution, recipientId, eligibility verdict/expiry, retry due date, consent proof & suppressions. Paginate; never use stale/future membership |
| `getPortfolioGate` | portfolioId | Master switch, Meta verified tier+age, external usage evidence, reservations/unique recipients last rolling 24h, last cycle completed, active/unknown cycle; capacity status (known/unknown) |
| `reserveCycle` (atomic) | unique requestId, selected candidate ids, campaign config versions, tier snapshot, reserved usage | Exclusive portfolio lock; hard attempts/spend controls; one reservation per phone and campaign; returns durable cycleId + batchIds + claim tokens. Idempotent for repeated requestId |
| `verifyBeforeCreate` | cycleId, batchId, latest policy version, selected recipient IDs | ALLOW or DENY per recipient, template/sender/campaign/window/suppression/label readiness and master gate; changes revoke unreleased recipients |
| `recordChatwootBatch` | cycleId, batchId, labelId, Chatwoot displayId, create idempotency key, creation result | Persist durable mapping; repeated writes idempotent; uncertain response remains UNKNOWN |
| `ingestRecipientOutcome` | batchId, Chatwoot contactId, canonical phoneMasterId, status, code/message, evidence timestamp/source | Idempotently write outcome and retry eligibility; read>delivered>sent; never turn Unknown into Unsent by assumption |
| `finalizeCycle` | all batch outcomes + completion evidence | Atomic close and `lastBatchCompletedAt`. Only then start 26h countdown; unresolved batches hold |
| `getReconcileTargets` | cursor/since | Recent/active/completed Chatwoot campaigns requiring status polling, all page cursors and mappings |
| `emergencyStop` | operator + reason | Stop all new batch preparation/create globally, audit change |

Additional guarantees: UTC provider timestamps stored; campaign windows evaluated in the campaign timezone; global cycle scope is **Meta business portfolio**, not merely individual Chatwoot inbox. Client timeout never proves failed create. Dynamic new/removed members must not overwrite previous attempt history.

## Chatwoot API (v4.19.0 source inspected; verify installed tenancy)
- Labels: `/api/v1/accounts/:account_id/labels`; contact create/search/update and `/api/v1/accounts/:account_id/contacts/:contact_id/labels`. Merge with **existing** labels; avoid removing unrelated tags.
- Campaign create: `POST /api/v1/accounts/:account_id/campaigns` with nested `campaign` JSON containing `title, inbox_id, scheduled_at, audience: [{type:'Label',id:<labelId>}], template_params`, plus required `message`/provider data. Validate actual template JSON and response fields on staging.
- Campaign show/index: same `campaigns` resource for status + displayId.
- Enterprise analytics: `GET .../campaigns/:campaign_id/analytics/metrics`; `GET .../campaigns/:campaign_id/analytics/contacts?page=N`. Requires feature `campaign_analytics`, pages of 25; schema has `meta.current_page/total_pages/total_count` and per-contact `status, error_code/title/message`.
- No verified native API for **exact remaining rolling 24h Meta capacity**. Read Meta tier through authorized supported Meta endpoint if available; calculate a **conservative local ledger estimate**, including all portfolio senders and external traffic. Fail closed on missing evidence.

## Template and audience safety
- One Chatwoot batch corresponds to one template/language/inbox and one unique label. Do **not** use a reused campaign-wide label to let newly added members join an already started batch.
- Sync labels only for recipients confirmed selected by the durable reservation, and verify all contacts are mapped to intended normalized destination.
- Chatwoot campaign POST payload must be pre-tested using a real approved template; no “guess” of parameter JSON.
- Do not schedule dispatch long in advance. If the selected window is no longer open, release/defer before writing Chatwoot; after creation, status may require operator intervention.

## Required durable tables (may be in EspoCRM MariaDB or n8n Postgres; one owner for each)
- `portfolio_cycle`: cycleId, portfolioId, state [PLANNED,RESERVED,PREPARING,LAUNCHED,RECONCILING,COMPLETED,UNKNOWN,ABORTED], lock token, startedAt, lastBatchCompletedAt, nextAllowedAt, limitEvidence.
- `cycle_batch`: batchId, cycleId, espocrmCampaignId, recipientCount, labelId, chatwootCampaignDisplayId, templateVersion, status, createdAt, completedAt.
- `cycle_recipient`: unique batch+phoneMaster, EspoCRM recipientId, Chatwoot contactId, original send and retry times, outcomes, evidence, *never delete historical failed/sent records*.
- `portfolio_usage`: rolling-24h unique outbound marketing recipient reservations per Meta portfolio, with source and settlement. Need all-sender reconciliation and hard max attempts/spend guards.

## Error handling
- 401/403 or missing Chatwoot analytics entitlement: **block LIVE and alert**, never mark recipients processed.
- 409 duplicate reservation or duplicate cycle create: reconcile by stable requestId, do not launch second batch.
- 429/5xx/timeout: preserve `UNKNOWN`, rescan Chatwoot by known mapping before any new create; no blind retries.
- CRM/META/Chatwoot unavailable; stale master or ledger; contradictory consent; invalid number; template mismatch: defer/fail-closed with reason.
- Large analytics collections: fetch every page, checkpoint last successful page, and re-poll recent completed campaigns for late status updates.

## Deployment checklist
1. Compare these logical operations with actual installed EspoCRM campaign extension API; document adapter implementation and field mapping.
2. Confirm Chatwoot v4.19.0 instance, feature availability and approved template example in UI and API.
3. Confirm Meta tier API availability and **who else can send** on any number in same portfolio. Missing evidence means reserve no volume.
4. Verify read-only plan, atomic reserve, label merge, creation and analytics paging, unknown recovery, report writing.
5. Only after passing tests enable n8n workflows and manually authorize LIVE; ensure old message-by-message dispatcher cannot send the same recipients.
