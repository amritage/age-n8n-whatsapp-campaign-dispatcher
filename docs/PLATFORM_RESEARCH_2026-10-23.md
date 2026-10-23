# AGE multi-campaign dispatcher: current platform research and implementation implications

**Research date:** 23 Oct 2026 (Asia/Kolkata). **Sources:** Meta/WhatsApp Business, Chatwoot, n8n, EspoCRM official docs and Chatwoot v4.19.0 GitHub source. Meta developers.facebook.com documentation was intermittently rate-limited (HTTP 429); for certain Meta error/tier details, this note cross-references reputable implementer documentation and treats provider-specific thresholds as requiring current Meta account confirmation. No production systems were accessed or modified.

**Current operator-confirmed stack:** Chatwoot **v4.19.0**, n8n queue-mode **2.37.9**, self-hosted EspoCRM + AGE Campaign Management (exact deployed extension version remains to confirm). Dedicated n8n community nodes for EspoCRM and Chatwoot are already installed. **No edits to older AGE extension, older workflows or Chatwoot source.**

## Newly confirmed facts that materially change the architecture

| Finding | Evidence | Implementation action |
|---|---|---|
| Native WhatsApp campaign **sending** works on self-hosted Chatwoot Community, but **analytics** requires a paid self-hosted entitlement and the feature enabled at account level | Chatwoot WhatsApp campaigns guide updated Oct 20, 2026 | **Critical:** probe GET metrics and GET recipients before basing production reconciliation on them. A successful Campaign Get Many does NOT prove analytics. A 401/403/404 is BLOCKED, not no failures. |
| Chatwoot WhatsApp campaign audience uses one or more contact **labels** as OR/union; labels do not establish opt-in | Chatwoot WhatsApp campaigns guide | Independently evaluate consent/suppression in CRM; create **new isolated, immutable batch label**; don't reuse existing broad labels or overwrite others. |
| Chatwoot v4.19.0 one-off WhatsApp service runs in **100-contact worker batches** by contact-ID cursor and re-queries labeled audience for each batch | Source: `app/services/whatsapp/oneoff_campaign_service.rb`, `app/jobs/campaigns/send_whatsapp_batch_job.rb` at tag v4.19.0 | Prevent batch-label membership changes during processing. A changing audience is not a truly frozen recipient snapshot; persist intent in separate ledger, verify labeled members before scheduling. |
| Chatwoot marks campaign **completed** when the last 100-contact batch is processed, **not** when Meta delivery/read receipts are all terminal | Same source `SendWhatsappBatchJob` | Completion is submission-processing evidence, not confirmed delivery. Record batch processing finished time; separately reconcile delivered/failed/unknown and apply 26h cycle gate after the **last verified batch completion in the cycle**, with unresolved sends/unknown capacity forcing additional holds. |
| Chatwoot's WhatsApp Account Health displays portfolio identity, business messaging tier, phone number quality/status, webhook configuration, account mode and throughput | Chatwoot Account Health guide updated Oct 20 | Read/inspect portfolio/tier/quality as operational preflight. Displayed tier is **NOT** live remaining capacity. Share a single Meta-portfolio ledger across all sending numbers and channels. |
| WhatsApp usernames/Business-Scoped User IDs (BSUIDs) can identify contacts **without visible phone numbers**, including native campaigns for supported inboxes | Chatwoot BSUID guide updated Oct 22 | Preserve phone master as-is but design future stable identity `{inboxId,identityType,sourceId,chatwootContactId}`; never merge contact IDs or count Meta unique-user capacity on normalized phone alone if recipient has BSUID-only identity. Respect ambiguous multiple-BSUID skip. |
| WhatsApp Meta pricing uses **per delivered message**, varying by market and template category | Official WhatsApp Business Platform Pricing | Track separate rolling Meta 24h unique-recipient capacity, delivered-message business target, monetary spend and attempt reservations; never use delivered count as a proxy for prospective capacity. |
| `131049` is Meta's **per-recipient** marketing ecosystem limit, independent of portfolio quota | Chatwoot troubleshooting, Salesforce/Klaviyo/360dialog references | Do not subtract a 131049 from capacity as evidence of global exhaustion; keep owner's temporary unchanged AGE extension retry policy (8/18/28 days **after preceding failures**, earliest D0+8/+26/+54). |
| `131050` means recipient opted out of **marketing** from the business | Meta error reference as reproduced by BSP docs; Klaviyo implementation | **Hard-suppress marketing** until affirmative re-opt-in / Meta `user_preferences` change; never auto-retry after 6 months merely because a hold expires. Separate transactional/utility eligibility from marketing permission. |
| `131048` reflects quality/spam restrictions; `131026` is ambiguous undeliverable; `130472` marketing experiment | BSP error reference, Chatwoot troubleshooting, Salesforce | Create distinct policy classes. `131026` MUST NOT be mapped automatically to Not Registered. `131048` is NOT a trustworthy remaining-capacity counter. Keep raw error code, provider timestamp and evidence source. |
| EspoCRM API supports `where`, `select`, `orderBy`, `offset/maxSize` and per-API-user ACL; common GET max size configuration is 200 | EspoCRM API search parameters, API overview, config params | Fetch only active/change-since campaigns and minimal fields; avoid dumping 10k+ Contacts/Leads or all CampaignRecipients each hour. Use dedicated read-only API role and consistent pagination/modifiedAt high-water marks. |
| n8n queue-mode workers run concurrently; production concurrency is **not** a global lock, and manual runs may be on main | n8n queue mode and concurrency docs | Enforce one global portfolio-cycle decision using a private **PostgreSQL transaction** with row lock / unique reservation key / constrained state transitions. Do not use n8n in-memory state or assume `Execute Once` prevents concurrent runs across workers. |
| n8n Postgres node supports bind parameters and transaction query batching | n8n Postgres-node docs | Use parameterized statements for ledger writes; combine lock/acquire/reservation into one DB transaction/function, not independent nodes whose DB connections may differ. |
| n8n execution history is pruned, and can expose PII if saved | n8n execution-data docs | Maintain separate audited reporting tables (no secrets/plain phone in GitHub), configure no-success/manual execution storage/redaction as permitted, and rely on explicit check_run ledger for durable status rather than n8n execution history. |
| n8n external Code task runners and queue mode require a runner sidecar **per worker**; manual executions may use main unless `OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS` | n8n queue docs | Confirm community node availability and task runner on the **actual worker**, not just the editor. No redeploy/change until operations testing approved. |

## Financial and operational distinctions (mandatory accounting)

1. **Meta rolling messaging capacity:** A ceiling for distinct business-initiated users reached **outside** the open customer service window in rolling 24 hours, shared across the **business portfolio**. Use tier/account state plus a conservative 24h distinct-recipient ledger; account for all provider senders, including any untracked manual/external sending. **No reliable API was verified that returns exact real-time remaining capacity.** Unknown external usage => reserve margin or hold.
2. **AGE daily delivered goal:** A separately defined target or cap counting **confirmed delivered (including read)** on the AGE local business day. It must not drive unbounded attempts while awaiting receipts.
3. **Attempt / reservations hard cap:** Separate upper-bound for failed, unknown, pending and accepted submissions, plus spending risk. It protects the system even if delivered count is low.
4. **Price/expenses:** Meta charges based on delivered messages with market/category rates. Track pending projected cost and actual billable delivery without treating `submitted` as invoiced.
5. **26-hour cycle gap:** Owner-approved timing from **last verified batch completion** of the previous cycle. Chatwoot `completed` is a processing marker, not receipt settlement; hold cycle if completion of any batch is unknown and re-evaluate Meta rolling ledger independently.

## Required campaign state machine

`CRM_INACTIVE / DRY_RUN`
→ `ELIGIBLE_CANDIDATE`
→ `PRECHECKED` (consent, segment, canonical identity, account health, template approved, API access)
→ `RESERVED` (atomic portfolio quota/attempt-budget, unique recipient)
→ `LABEL_PREPARED` (unique Chatwoot label, verified stable membership)
→ `CHATWOOT_CREATED` (persist immutable Chatwoot **display ID**, payload hash)
→ `SCHEDULED`
→ `PROCESSING`
→ `PROCESSING_COMPLETE` (all Chatwoot batch workers finished)
→ `SETTLED` (delivery/failed/skipped/unknown reconciled with trusted Meta evidence).

Each transition requires idempotency and an audit event. Network timeout after Chatwoot create = **UNKNOWN**, reconcile by unique batch external key/title/payload in provider before ever creating a second campaign. Never retry a non-idempotent POST blindly.

Separately maintain per-recipient:`NOT_SELECTED`, `SUPPRESSED`, `RESERVED`, `QUEUED`, `SUBMITTED`, `SENT`, `DELIVERED`, `READ`, `FAILED_CODE`, `SKIPPED`, `UNKNOWN`; preserve event times and evidence identifiers. Never manufacture provider Meta message IDs/timestamps from local n8n poll timestamps.

## Reference workflow responsibilities

- **WF-00 Capability and account health (daily + preflight):** Chatwoot v4.19 installed/operator-confirmed; check WhatsApp Cloud API inbox, approved templates, account/portfolio tier, quality, webhook health and campaign analytics entitlement. BLOCKED if a critical check is unavailable.
- **WF-01 Campaign coordination (hourly):** Read only eligible CRM campaigns (Active + master allowed), dynamic audiences, prioritized fair allocation, 26h global cycle gap, per-campaign windows/Sunday and provider portfolio budget. Record proposed plan even when blocked.
- **WF-02 Cohort builder:** Atomic reservation, snapshot and dedupe by stable messaging identity, exclusive batch label + exact intended membership, authorized Chatwoot create once. Ensure no sender/recipient of another campaign is counted twice for distinct-recipient quota.
- **WF-03 Async status reconciliation (30–60m, plus events):** Read Chatwoot statuses / verified provider event IDs/times; full recipient ledger includes late receipts; maintain outstanding UNKNOWN queue. A low-cost five-campaign rotating failure-only diagnostic is **not** equivalent to complete reconciliation.
- **WF-04 Error and exception watch:** Separate `131049`, `131050`, `131048`, `130472`, `131026`, paused templates, 5xx, rate limits; suppress immediate retries and raise alerts for unexpected declines/quality deterioration.
- **WF-05 Operations dashboard:** Capacity reserved and known Meta deliveries last 24h, unknown/unseen sources, actual spend, daily business-delivered successes, total attempts, failed by error, pending/unknown, last verified batch processing completion, next cycle eligible time and stop reasons. Owner can stop all sends by master flag; do not delegate control.

## Immediate pre-live gates

- [ ] Confirm actual self-hosted Chatwoot campaign analytics account entitlement by *authorized, read-only* metric and recipient GET. **Sending enabled does not imply analytics enabled.**
- [ ] In **Settings > Inboxes > official Meta inbox > Account Health**, record the Meta business portfolio/WABA/sender IDs, messaging tier, quality and any warnings. This is account context, **not** an exact remaining-capacity counter.
- [ ] Confirm deployed AGE Campaign Management extension version and `GET /AGECampaign/retry-policy/:recipientId`; follow the existing 131049 preceding-failure policy.
- [ ] Determine whether Chatwoot delivers sufficient provider message ID/time evidence from existing authorized webhooks or existing DB read-only views; verify against v4.19 runtime. If not, **do not** fabricate successful CRM `/AGECampaign/event` records.
- [ ] Verify installed native n8n community nodes work on the actual execution worker and queue-mode external task runners are configured there.
- [ ] Build and CI-test atomic PostgreSQL reservations, idempotent campaign creation and strict opt-out enforcement before enabling any sending POST.
- [ ] Use a consented and intentionally limited pilot list, with explicit permission before customer send.

## Current error policy mapping (guidance, not a new extension change)

| Meta code | Class | Operational policy |
|---|---|---|
| 131049 | Per-user marketing ecosystem restriction | Existing temporary AGE CRM holds: 8, 18, then 28 days after **preceding failed retry**. Never use as a portfolio remaining-budget indicator. |
| 131050 | Marketing opt-out | Hard STOP all marketing until fresh affirmative consent / changed provider preference. Never auto-retry even if 180-day general re-review expires. |
| 131048 | Quality/spam restriction | Pause sender/campaign and inspect Account Health/Meta quality; do not use code frequency as exact capacity meter. |
| 131026 | Ambiguous undeliverable | Preserve raw error; no automatic Not Registered inference; delayed manual/rule-based review (user currently prefers 180 days) gated by consent. |
| 130472 | Recipient included in marketing experiment | Suppress automatic immediate resends, preserve raw error and user-defined review policy. |
| 132015 | Template dropped after pacing/quality | Hold affected template/campaign and investigate approved/paused state before resending. |

## Source catalog (accessed 2026-10-23)

**Chatwoot official**
- WhatsApp Campaigns (2026-10-20): https://app.chatwoot.com/hc/user-guide/articles/1791468319-8-whats_app-campaigns
- Account Health and tier (2026-10-20): https://app.chatwoot.com/hc/user-guide/articles/1791472075-11-manage-your-whats_app-number
- BSUID and usernames (2026-10-22): https://app.chatwoot.com/hc/user-guide/articles/1788437540-bsuid
- Webhook events: https://app.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
- v4.19.0 source batch service: https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/services/whatsapp/oneoff_campaign_service.rb
- v4.19.0 source background batch worker: https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/jobs/campaigns/send_whatsapp_batch_job.rb
- v4.19.0 gated analytics controller: https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb

**WhatsApp official**
- Meta Business Platform delivered-message pricing: https://whatsappbusiness.com/products/platform-pricing/
- Meta Cloud API errors (access was rate-limited while researching): https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes/
- Meta messaging limits (access was rate-limited): https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-messages/

**n8n official**
- Queue mode: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/enable-queue-mode
- Concurrent execution rules: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/control-concurrency
- Postgres query params/transactions: https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.postgres/
- Queue variables including OFFLOAD_MANUAL_EXECUTIONS_TO_WORKERS: https://docs.n8n.io/deploy/host-n8n/configure-n8n/basic-configuration/use-environment-variables/queue-mode/
- External runners: https://docs.n8n.io/deploy/host-n8n/configure-n8n/set-up-task-runners
- Execution data retention: https://docs.n8n.io/deploy/host-n8n/configure-n8n/scaling/manage-execution-data

**EspoCRM official**
- API Overview and roles: https://docs.espocrm.com/development/api/
- API search filters/select/paging: https://docs.espocrm.com/development/api-search-params/
- CRUD: https://docs.espocrm.com/development/api/crud/
- EspoCRM configuration `recordListMaxSizeLimit`: https://docs.espocrm.com/administration/config-params/
- API OpenAPI spec (v9.3+): https://docs.espocrm.com/development/api/

**Corroborating BSP references for Meta-protected details (NOT authoritative Meta releases)**
- 360dialog / per-user marketing error: https://docs.360dialog.com/docs/support/api-error-message-list
- Meta portfolio messaging limit mirror: https://support2.chatarchitect.com/books/meta-whatsapp/page/messaging-limits-developer-documentation
- Klaviyo per-user marketing restrictions: https://help.klaviyo.com/hc/en-us/articles/46890922548507
- Meta code 131050 user preference explanation: https://help.klaviyo.com/hc/en-us/articles/understanding-whatsapp-unsubscribes-and-consent-syncing

**Scope:** research and architecture recommendations only. No production sends, no changes to installed Chatwoot/AGE extension/existing workflows. Separate rollout approval required.
