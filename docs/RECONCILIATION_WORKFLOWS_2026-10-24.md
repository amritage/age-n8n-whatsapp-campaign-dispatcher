# Delivery / Read reconciliation workflow handoff (24 October 2026)

> **IMPORTANT — 24 October 2026 source change:** This handoff's AGE 07 native campaign `getMetrics/getRecipients` description and associated tests refer to its **superseded Enterprise-API implementation**. The current file `workflows/age-07-delivery-read-analytics-native.json` was subsequently **replaced** by an inactive, SELECT-only PostgreSQL summary (account 2; `campaigns` + `campaign_recipients` + `inboxes`). It does NOT call paid analytics endpoints, collect mobile-level rows, persist Data Tables, or write EspoCRM. Follow [the current installation guide](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md) and [field-level verification](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md). SQL-path usage requires database permissions and licensing review. Historical sections below are retained for context only.


**Stack:** Chatwoot v4.19.0; n8n 2.37.9 queue mode; EspoCRM + AGE Campaign Management.  
**Status:** WORKING SOURCE-CONTRACT IMPLEMENTATION FOR SAFE DIAGNOSTICS, NOT YET AN END-TO-END LIVE ESPoCRM RECONCILER.  
**Safety:** All workflow JSON files import inactive, no production sends, no Chatwoot/EspoCRM writes, no credential values.

## What can actually be imported and tested now

1. **[AGE 07 — Chatwoot WhatsApp Analytics Reconciliation](../workflows/age-07-delivery-read-analytics-native.json)** — Native Chatwoot community-node GET campaign inventory, GET campaign metrics and GET **failed** recipients (bounded to 501 rows per selected campaign; above 500 a report is explicitly BLOCKED as incomplete). Auto-discovers WhatsApp one-off campaigns without manual IDs; processes up to five campaigns per run; handles feature-gated analytics as BLOCKED; validates the v4.19.0 delivered-includes-read contract; produces failure counts by exact Meta error code and an explicit unmatched/CRM-not-verified result. Manual Trigger or every-six-hour schedule, inactive by default.
2. **[AGE 08 — Verified Message Evidence Reducer](../workflows/age-08-verified-message-evidence-reducer.json)** — callable n8n subworkflow using the built-in Execute Workflow Trigger v1.2. Caller must supply **independently verified** per-message provider records with actual wamid, status, provider event timestamp, account/inbox and trusted-source validation. Outputs canonical read/delivered/failed evidence and duplicate/conflict statistics **for that input batch only**. There is **no** webhook, database write, EspoCRM POST, message send or persisted cross-execution idempotency. Never expose as a public unauthenticated endpoint.
3. The existing **[six-hour unified health monitor](../workflows/age-unified-six-hour-health-readonly.json)** is still the combined account/CRM/portfolio HOLD-only check. Importing AGE 07 is optional until Chatwoot analytics permissions are confirmed. The new AGE 07 is a **richer successor to the old daily capability probe and earlier recipient report**; do not activate both recurring analytics checks unnecessarily.

### Exact meaning of Chatwoot v4.19 analytics metrics

**Official v4.19.0 source:** `enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb`:

- `audience` = total campaign recipients.
- `sent` = recipients with a non-null `source_id` (provider message identity assigned; **not** proof of delivery).
- `delivered` = **status delivered + status read**. This already includes Read.
- `read` = status read. **Do not add this to `delivered`**.
- `failed` = failed recipients; `skipped` = skipped recipients.
- `status_counts` includes queued / skipped / sent / delivered / read / failed.
- API getRecipients can filter `status=failed` (25 records per provider page). Our installed community node v0.9.0 can paginate and supplies paired item identity. To avoid unexpectedly expensive scans, this workflow fetches **at most 501 failed recipients per campaign**; **more than 500 blocks full error-code reconciliation**, while aggregate Chatwoot metrics remain available.

AGE 07 checks that:
- `delivered >= read`; `delivered <= audience`; optional `status_counts.delivered + status_counts.read == delivered`.
- Errors are counted from failed-only recipient pages, checking each campaign's returned failed count matches the provider metrics' failed count. Missing pages and API failures block the affected report.
- `deliveredWithoutRead = delivered - read`, while `deliveredIncludingRead = delivered`. No duplicate Read delivery.
- **No personal phone, contact name or WhatsApp content** appears in output.
- A `campaign_status=completed` does not prove that all message receipts are terminal.

**Important coverage caveat:** AGE 07 rotates among all completed/processing native WhatsApp campaigns, at most five per six-hour scan. It explicitly reports partial scans. This is a bounded **reporting diagnostic**, not a durable full historical reconciliation queue or a source of truth for a campaign-specific daily delivered KPI. A later LIVE reconciler must maintain outstanding and late-status watermarks per batch (and handle all sender accounts).

### Why we cannot safely auto-write to EspoCRM yet

1. The official Chatwoot **campaign analytics API does not include Meta `wamid` or provider event timestamp** for each recipient. It includes Chatwoot contact ID and per-recipient status/error; consequently, **it cannot by itself prove which historical Meta message/AGE attempt a result belongs to**.
2. Chatwoot v4.19.0's **account message_updated webhook** uses `Message#webhook_data` (see `app/listeners/webhook_listener.rb` and `app/models/message.rb`). The latter does not include `status` in its returned top-level fields. Do NOT implement a webhook-only status sync that silently assumes `message_updated.status` exists; verify any richer payload in the live installation before reliance.
3. In AGE's source-reviewed `/AGECampaign/event` endpoint, **`attemptId`, `recipientId`, `eventId`, `source`, `messageId`, `type` and `occurredAt`** are required for standard events. If `messageId` is absent, submitting fake IDs creates unreliable history. Do not do this.
4. Chatwoot v4.19.0's `campaign_recipients` table **may** contain source_id, sent_at, delivered_at, read_at, failed_at and exact error code, but it is an enterprise feature/edition table, may be absent or unavailable in Community; to access it would require **separately approved, read-only** database credentials. Do not bypass licensing or modify Chatwoot.
5. There is **no currently verified durable link** `AGE attempt -> Chatwoot campaign display ID/internal ID -> Chatwoot contact ID -> Meta message ID`. The future sending workflow must persist this mapping at campaign creation and reconcile provider ID after sending; existing historical batches with no stable link must remain UNMATCHED.
6. AGE Campaign Management's `Ledger::summary()` currently ranks a Read as status Read, while `hasDelivered` reflects explicit Delivered events. Future rollups need **delivered-inclusive-of-Read** by union even when `hasDelivered` remains false. If EspoCRM's own stored delivered flag must change semantics, that would require a separately authorized extension update; **do not alter the old extension in this GitHub repo**.
7. No reliable exactly-once CRM write follows solely from Data Table upserts in n8n queue-mode. The source-side AGE event endpoint does deduplicate event ID/source within an attempt, but the correct authenticated attempt and provider identity must first be proven.

**Consequences:** All new workflow outputs explicitly say `espocrmWrites=0` / `crmEventWrites=0` / `canSend=false`. These are real functioning read-only diagnostics and pure status logic; **not** a claim that automatic CRM synchronization already works.

## Minimum follow-up before live deployment

- Import AGE 07, bind the existing Chatwoot community-node credential and **run once manually**. If the account has no `campaign_analytics` entitlement, output must be BLOCKED; decide whether authorized existing read-only Chatwoot DB status evidence is available, or reuse already-authorized provider events.
- Inspect whether a real Chatwoot campaign/Meta message ID can be reliably traced to the AGE attempt via the deployed source, *without guessing by number or campaign title*. Record a redacted sample event with `wamid`, status and provider time (no recipient phone numbers or tokens).
- Only after verified mappings: implement and test a **durable** event ledger and idempotent EspoCRM event posting with strict source/message identity, late receipt handling and retry recovery. Do not turn on LIVE just because static n8n JSON import passes.
- Add read-only end-to-end comparison against one opted-in test campaign after user approval. Verify 2-message example: SENT→READ, and SENT→DELIVERED→READ, the CRM delivered-inclusive count is **2**, Read count is **2**, no duplicate events or invented Delivered timestamps.

## Regression tests

- `tests/delivery-evidence-core.test.js` — standalone deterministic Read/delivered/failure reducer.
- `tests/native-delivery-analytics.test.js` — executes actual n8n Code nodes with mock Chatwoot 4.19 provider responses, missing pages, 403s, duplicates, mismatch and read-without-delivered.
- `tests/delivery-evidence-subworkflow.test.js` — validates n8n Execute Workflow Trigger v1.2 shape and executes status reducer with provider fixtures.
- GitHub Actions `n8n-import-compatibility` imports all workflow JSON files into a disposable **n8n 2.37.9** container, but does not execute the provider APIs.

### Source contracts

- Chatwoot metrics and per-recipient fields: https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb
- Recipient status precedence and Meta evidence: https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/models/campaign_recipient.rb
- Standard account webhook fields: https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/models/message.rb
- Chatwoot account listener: https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/listeners/webhook_listener.rb
- AGE CRM event endpoint: https://github.com/amritage/age-campaign-management/blob/main/files/custom/Espo/Modules/AGECampaignManagement/Api/Event.php
- AGE CRM identity, event dedup and status summary: https://github.com/amritage/age-campaign-management/blob/main/files/custom/Espo/Modules/AGECampaignManagement/Domain/Ledger.php
