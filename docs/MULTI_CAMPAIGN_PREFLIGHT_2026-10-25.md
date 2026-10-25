# Multi-campaign dispatcher — first executable source-backed preflight (25 October 2026)

**Status: DEVELOPMENT ONLY · DRY RUN / HOLD · no sends / CRM or database mutations.**

The file [`workflows/age-multi-campaign-cycle-controller.json`](../workflows/age-multi-campaign-cycle-controller.json) replaces its previous inert design-only shell on the feature branch. It is now a **functional preflight**, **not a live sending workflow**. It uses the tested n8n 2.44.6 node families already included in AGE's environment:

1. `@traien/n8n-nodes-espocrm.espoCrm` — Custom Entity `Campaign` `getAll`; reads real installed AGE metadata field names (as verified against the extension repository).
2. `@renatoascencio/n8n-nodes-chatwoot.chatwoot` — Campaign `getAll`; native Chatwoot one-off campaign overview.
3. Built-in Data Table row `get` — reads at most 51 rows from existing `AGE_Portfolio_Control`, for **observation only**.
4. A JavaScript **Design Gate - Never Sends** combines the above, checks campaigns and recorded global controls, outputs explicit blockers, and never authorizes action.
5. Manual Trigger for safe inspection; hourly Schedule Trigger is present for the future but **must not be published/activated** during development.

**No new infrastructure, Data Tables, database role, extensions, or Chatwoot customizations.** This does not modify the two existing usable diagnostics (unified 6h and AGE 07), the private AGE 03 page or previous sender workflows. The feature branch/PR is a code proposal, not an n8n deployment.

## What is actually checked

| Source | Implemented check | Important limitation |
|---|---|---|
| EspoCRM Campaign records | Active and tracking enabled, WhatsApp/Chatwoot provider, inbox, template fields, daily target, minimum gap, campaign start/end dates, timezone, configured HH:MM window, Sunday exclusion | Does **not** establish template approval, contact consent, live audience membership or retry eligibility |
| Chatwoot Campaign `getAll` | Counts native one-off WhatsApp campaigns currently classified as processing or completed | Does **not** prove all past batches are included or that an EspoCRM campaign maps to any particular Chatwoot campaign |
| n8n `AGE_Portfolio_Control` | Master state observation, historical cycle flag, unresolved cycle, time elapsed since last **recorded** verified batch completion | Data Tables are **not** a transactional reservation engine; these values alone cannot prove global Meta capacity or last real submission |
| Controller | Distinct per-campaign reasons and portfolio holds, source-read errors, detects duplicate IDs, caps portfolio scan at 51 | **Always** `decision=HOLD`, `canSend=false`, `selectedRecipients=0`, `reservationsCreated=0`, `chatwootCampaignsCreated=0`, `crmAttemptsCreated=0`, `crmEventsWritten=0` |

If 101 or more campaigns are returned, only 100 details are displayed; `reportPartial=true`. All returned records are still evaluated. The observed `windowMatchesNow` simply means **these checked configuration gates** match; it is **not** an eligibility verdict.

## Manual import and test

1. In GitHub inspect the proposed feature branch and its PR. Import the revised JSON as a **new, inactive development workflow**, avoiding overwriting any existing production workflow or AGE 07.
2. Attach your existing EspoCRM API credential to `EspoCRM - Read Campaign Configuration` and existing Chatwoot API credential to `Chatwoot - Read Native Campaigns`. No new community nodes are needed if the two pinned packages are already installed in both n8n and worker images.
3. Confirm `AGE_Portfolio_Control` already exists, with actual column names/types; select its correct n8n Data Table if necessary. Do not create duplicate tables or import demo records into live storage.
4. Run **Manual Trigger**. Inspect `Halt Without Writes` output for `crm.campaigns[]`, `portfolio.observations[]`, `blockers[]`, and the zero-write counters. Investigate source errors; never replace an error with a zero/ready state.
5. Keep the workflow **Inactive**. Do not activate the hourly schedule until the separately designed, tested and authorized transactional sender exists; an hourly preview is not required for production today.

**Important:** Running on Sunday should show `SUNDAY_DISABLED` for AGE campaigns configured `ageSundayOff=true`, even when the operator executes a manual diagnostic outside business hours.

## Dependencies that block any LIVE send

1. **B-002 asynchronous attempt semantics.** Installed AGE Campaign Management `POST /AGECampaign/attempt` immediately creates a Submitted attempt, while Chatwoot launches recipients asynchronously. We cannot generate one AGE Submitted attempt for every batch member before evidence of real submission. A separately approved bridge must guarantee real attempt IDs, exact batch and contact mapping, and partial-batch reconciliation. Do **not** misuse historical mode to bypass real-time eligibility.
2. **B-003 message identity.** AGE 03 + Chatwoot `campaign_recipients` now expose candidate `wamid`, status, original recorded `sent_at/delivered_at/read_at/failed_at` and Meta error codes. The *fact that a string matches `wamid.*` is not independently verified provider provenance*. An authoritative immutable mapping to AGE campaign, recipient and attempt is required before `/AGECampaign/event`.
3. **B-004 global capacity and atomicity.** A Chatwoot campaign POST must be preceded by an atomic portfolio-wide recipient/budget claim, durable batch record, dedupe and timeout recovery. The 26-hour cycle starts only after the **last verified batch completion**. Existing Data Tables are not atomic and current Chatwoot campaign snapshots cannot account for all possible external Meta traffic. Hard attempt/spend ceilings need explicit approval.
4. **Policy verification.** Before releasing any member, check fresh dynamic audience, suppression/consent, existing AGE retry-policy API (131049 after each preceding failure), configured 180-day eligibility reviews, 7-day campaign gap, approved template variables and shared cycle limits. Stale/unavailable/ambiguous inputs must stop. A confirmed Read counts as one Delivered, not a second delivery. Errors such as 131026 must never imply that a customer is unregistered.

## Incremental milestones, without duplicate scheduled workflows

- **Milestone A — now:** Use the current working AGE 07 aggregate PostgreSQL report (successful manual reference: campaign display ID 2, audience 910, delivered including Read 660, Read 505, failed 247); execute new controller manually to validate actual campaign metadata. Keep unified health unchanged.
- **Milestone B — next:** Validate one authoritative Chatwoot recipient `wamid` ↔ AGE attempt link and document the exact v0.4.x adapter contract. Read-only private pilot first. Then build a **single incremental recipient reconciliation** stage using a durable restricted ledger, idempotent upserts, watermark overlap, and exact event timestamps. CRM writes require a separately approved gate.
- **Milestone C — after verified mapping:** Implement atomic PostgreSQL reservations **on a separately owned schema, not Chatwoot's read-only production DB**, and native Chatwoot one-off batch creation with immutable batch labels, safe timeout recovery, per-portfolio cycle holds, and a distinct deployment enablement switch. Only then run a restricted consenting dry-run/live pilot with explicit approval.

## Verification

Synthetic automated tests: `tests/multi-campaign-preflight-runtime.test.js` run the actual Code-node JavaScript under a frozen clock against multiple campaigns, wrong windows, Sunday closure, malformed template configuration, duplicate campaign IDs, 25-hour completion gap, unresolved cycles, source errors, and a processing Chatwoot campaign. CI also checks no embedded credentials or mutating nodes and the 22-file lifecycle manifest.

**What tests do NOT establish:** the updated workflow has **not** been executed in the user's n8n against live credentials, and no live Meta campaign or EspoCRM recipient write was attempted. GitHub Actions are synthetic verification, not production integration evidence.

References: [current import guide](SIMPLIFIED_THREE_WORKFLOW_DEPLOYMENT.md), [verified Chatwoot DB discoveries](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md), [current extension compatibility](ACTUAL_EXTENSION_COMPATIBILITY.md), [Chatwoot-native approved orchestration](CHATWOOT_CAMPAIGN_ORCHESTRATION.md), [recipient evidence handoff](RECIPIENT_EVIDENCE_PAGING_AND_MATCHING_2026-10-24.md).
