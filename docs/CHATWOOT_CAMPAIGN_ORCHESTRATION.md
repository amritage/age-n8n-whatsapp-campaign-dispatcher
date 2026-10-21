# Approved target: EspoCRM → n8n → Chatwoot v4.19.0 native WhatsApp campaigns

Status: **approved architecture; implementation NOT deployed or proven live**. This document supersedes individual-message dispatcher assumptions for this integration. Never patch/fork Chatwoot.

## Decisions (21 Oct 2026)
- **One** logical EspoCRM campaign can produce many immutable **one-off Chatwoot campaigns**. No separate n8n workflow per business campaign.
- EspoCRM owns AudienceSegments, Contact/Account/Lead membership, consent/suppression, recipient history, campaign status, selected templates, dates, weekdays, timezone, window, priority, and per-recipient retry policy.
- n8n owns shared **hourly** cycle scheduling, global ledger/lock, fresh audience and due-retry selection, Chatwoot contact/label synchronization, Chatwoot campaign creation, report reconciliation, and safe resume.
- **Option B confirmed:** One sending cycle can contain several one-off Chatwoot campaigns (one per distinct template/inbox/segment grouping). A **global minimum of 26 hours** separates sending cycles for the *same Meta business portfolio*. The countdown begins after the **last verified Chatwoot batch completion** within the previous cycle (conservative proxy for last actual provider submission); if completion is unknown, do not start the next cycle. Do not measure 26h from initial scheduled/start time.
- Native Chatwoot batching controls message dispatch. **No 45-second per-message pacing**. Never claim n8n can control instantaneous send rate inside Chatwoot campaigns.
- Schedule controller every **60 minutes**; reconcile statuses independently every **30–60 minutes**. A cycle may start later than its earliest eligible time, and Sunday/window rules can delay it further.
- **Meta tier is not a daily delivered quota**. Limit applies to unique business-initiated recipients in rolling 24 hours as per provider rules and is shared across portfolio senders. Read tier from Meta where supported, not from an invented Chatwoot “remaining” API. Historical sending outside this system must be accounted for. Do not calculate exact remaining using only Chatwoot campaign totals.
- Retry error **131049**: planned retries on day **8, 18, 28 from initial failure**; if a retry is not permitted that day, it remains overdue and waits for an eligible cycle. Each retry requires a fresh policy decision; stop after success, max retries, opt-out, suppression or provider restriction. Do not promise provider acceptance.
- **131026 does not prove nonregistration**. For configured 180-day holds (including applicable 131026/130472), schedule *eligibility review*, not unconditional resend. Opt-out and Meta rules always override.
- **No Chatwoot source modifications**. No WAHA for official API campaigns. No direct per-message sender built alongside Chatwoot native campaigns.
- Global master sending OFF or campaign inactive means **DRY RUN only**; never write contacts/labels or create campaigns in DRY RUN. Distinguish deployment enablement from EspoCRM master switch; both needed for LIVE.

## Execution: one hour scheduler for any number of EspoCRM campaigns
1. Acquire a transactional **portfolio-wide** lease. If another run or unreconciled cycle exists, stop and emit a reason.
2. Fetch master switch, portfolio tier/usage evidence, last completed cycle, every applicable EspoCRM campaign config and audience version. For LIVE, validate both deploy opt-in and master ON. Unknown policy, limit, adapter or clock => fail closed.
3. Check 26-hour global gap, portfolio tier and hard attempt/spend ceiling. Apply a safety reserve for unconfirmed/external sends. A planned cycle must not exceed defensible available capacity.
4. Find campaigns eligible **now** by their configured start/end dates, allowed weekdays, timezone, windows, status, approved template, inbox, sender, and campaign caps. Different windows can mean a campaign waits for another cycle; don't create future-dated campaigns that bypass fresh-eligibility checks.
5. Retrieve **current** recipient membership plus due retries via EspoCRM policy API. Deduplicate canonical phone master across Lead/Contact/Account; exclude inactive associations, opt-outs, suppressed/ineligible contacts, attempts already reserved/inflight, cooldown breaches and changed segment membership.
6. Fair deterministic allocation across campaigns with priority+age, unique destination across the entire cycle and a per-campaign ceiling; never let one high-volume segment indefinitely starve others.
7. Commit a durable **cycle reservation** and per-recipient claims, atomically, before any Chatwoot API write. Generate stable cycleId, batchId and campaign idempotency references; log planning/policy versions.
8. For each batch, create/update Chatwoot contact records via documented APIs. Never overwrite unrelated labels. Add a **unique, batch-specific label** and verify it contains *exactly* the selected Chatwoot contacts and phone numbers. Synchronize additions/removals before launch. Do not reuse the previous batch's label.
9. Re-read master switch, campaign eligibility and safety state immediately before each Chatwoot campaign API create. Re-check selected IDs, counts, approved template name/language/variables and correct WhatsApp Cloud inbox. Upon revocation, cancel unreleased batch; if already started, pause future cycles and reconcile actual sends (Chatwoot campaign cannot safely be edited mid-send).
10. POST a one-off Chatwoot campaign with its batch label and template params using authenticated API. Save returned Chatwoot campaign display ID and batch mapping. A lost HTTP response is **UNKNOWN**: search/reconcile before considering repeat creation.
11. Wait until *every* batch is completed or resolved by evidence; persist verified last completion time. The next cycle cannot begin before last completion + 26h. A stuck/unknown batch blocks automatic advancement and alerts operators.

## Chatwoot v4.19.0 verified code facts
- Core API `POST /api/v1/accounts/:account_id/campaigns` accepts nested `campaign` with `title, description, message, inbox_id, scheduled_at, audience: [{type:'Label', id}], template_params` etc. **Payload must be tested against installed release and approved templates**, no fabricated production template JSON.
- WhatsApp campaigns are `one_off`, not evergreen. The service selects account contacts tagged with chosen labels and uses `BATCH_SIZE = 100`; job iterates batches until campaign marked `completed`. This internal batch size is *not* a 100-recipient quota or Meta-tier brake.
- The core API permits updating an active one-off campaign only **before it starts**; membership changes mid-processing are not a safe cancellation mechanism.
- Enterprise routes: `GET /api/v1/accounts/:account_id/campaigns/:campaign_id/analytics/metrics` and `.../analytics/contacts?page=N`. `contacts` returns 25 recipients per page, contact ID/name/phone, status, message_content and error_code/title/message, but **not provider event timestamps or Meta message ID**. These endpoints require `campaign_analytics` feature entitlement; license/current access MUST be checked before committing to live.
- The analytics report `sent` is not the same as `delivered`; `read` implies delivered for count purposes. Preserve queued/skipped/sent/delivered/read/failed distinctions.
- Do not assume the documented per-recipient analytics endpoint exports sufficient message-level evidence for exact Meta rolling usage, idempotency or provider timestamps.

Code evidence (immutable tag):
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/controllers/api/v1/accounts/campaigns_controller.rb
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/services/whatsapp/oneoff_campaign_service.rb
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/jobs/campaigns/send_whatsapp_batch_job.rb
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb
- https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/models/campaign_recipient.rb

## Reporting/retries
- Reconciliation job polls active/recent/unfinished Chatwoot campaigns and **all pages**, including later status changes, not only once after campaign end.
- Maintain `espocrmCampaignId ↔ cycleId ↔ batchId ↔ chatwootCampaignId ↔ chatwootContactId ↔ canonical phoneMasterId ↔ recipientId`. Match by stable mappings; never infer sender/campaign solely from phone display string.
- Upsert idempotently per recipient status. `read` outranks `delivered`; do not overwrite read with stale failed. Log exact code/reason, original event times when independently available, and evidence source; distinguish `unknown`/unmatched rather than invent success.
- Pagination, retries and 404/403/feature restriction are explicit failure states: **stop new cycle** if reconciler cannot establish authoritative status. Analytics may be used for reporting even when Meta delivery evidence needed separately.
- Only when policy allows, schedule 131049 on 8/18/28 elapsed days from first failure (original initial attempt), using fresh segment eligibility. 180-day restrictions are next-review dates.
- Failure to send because of capacity is **UNSENT/DEFERRED**, *not* a message failure or retry attempt.

## Deliberately not guaranteed
- Sending 5,000 per calendar day; a global 26h cooldown, Sunday-off, windows and changing Meta tier prevent this guarantee.
- Exact remaining Meta 24h capacity from Chatwoot; native batch completion does not prove all sends consumed/no longer consume portfolio unique-recipient capacity.
- Instant opt-out cancellation after Chatwoot begins processing a one-off campaign.
- Per-message pacing, exact stop at a delivered target, in-flight mid-batch throttling, or automatic capacity-based pause inside Chatwoot.

## Release gates
- No LIVE until actual installed EspoCRM adapter contracts, Chatwoot campaign POST, label management, analytics entitlement, portfolio usage evidence, consent source and retry service have been verified end-to-end.
- Test with synthetic audience in DRY RUN, then a handful of explicitly opted-in real numbers in an approved pilot. See [API contract](ESPOCRM_CHATWOOT_API_CONTRACT.md), [examples](CAMPAIGN_SCENARIOS.md), [tests](TEST_PLAN.md).
