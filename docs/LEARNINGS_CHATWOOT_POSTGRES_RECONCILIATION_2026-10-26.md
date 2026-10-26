# Operational learnings: Chatwoot PostgreSQL delivery evidence

Date: 2026-10-26  
Purpose: preserve implementation and debugging findings that future AGE dispatcher work can reuse. This note contains no customer identifiers, phone numbers, message IDs, credentials, or unredacted execution data.

## Confirmed evidence and design lessons

1. **Keep send and evidence responsibilities separate.** Use Chatwoot native WhatsApp one-off campaigns to send bounded batches. Use a SELECT-only Chatwoot PostgreSQL connection to inspect recipient outcomes. Do not implement a parallel per-contact sender for this path.
2. **Treat Chatwoot recipient status as a snapshot.** In the observed v4.19 schema, `campaign_recipients` is unique by campaign and contact. It is the current state for that campaign/contact, not a full history of every AGE retry attempt. Preserve an independent AGE attempt identity and do not infer retry history from this table.
3. **Keep identifier namespaces distinct.** `campaigns.id` is the internal Chatwoot key; `campaigns.display_id` is the UI/API campaign ID; neither is an EspoCRM campaign ID. Apply `account_id` consistently to campaign and recipient rows. A campaign title is descriptive metadata, not a join key.
4. **A WAMID-shaped value is not provenance.** `campaign_recipients.source_id` was observed to hold Meta-shaped message IDs. Validate its source and relationship to the campaign/contact before using it as authoritative provider identity. A string-format check alone is insufficient.
5. **Current Chatwoot phone data can drift.** `contacts.phone_number` is mutable current contact data, not guaranteed historical destination data. A phone match alone cannot prove which EspoCRM attempt produced the Chatwoot message.
6. **Read counts once as delivery.** Chatwoot states are `0=Queued`, `1=Skipped`, `2=Sent`, `3=Delivered`, `4=Read`, `5=Failed`. A trusted Read proves delivery for that same message. Delivered-inclusive-of-Read is the distinct union of statuses 3 and 4; never add the Read count to Delivered. Do not invent `delivered_at` from `read_at`.
7. **Preserve source evidence.** Carry the exact error code/title/message and each source timestamp that exists. Missing provider evidence remains unknown; campaign `Completed` indicates campaign processing completion, not delivery completion.
8. **Page recipient evidence with bounded keyset cursors.** The AGE 03 reader uses parameterized SQL and an ordered `(updated_at, row_id)` cursor with a bounded page. Manual multi-page runs are not a transactionally consistent snapshot: changed rows can move during paging. Production needs a durable cursor, overlap/rescan window, and idempotent replay.
9. **Keep AGE 03 sensitive and manual.** Its result includes current phone and provider message ID. It is development-only, manual-triggered, SELECT-only, and unscheduled. Keep outputs in the restricted n8n execution UI; do not paste recipient results into GitHub, screenshots, or public chat. Synthetic SQL/tests do not constitute a live AGE 03 identity-mapping test.
10. **Fail closed on unmatched recipient/attempts.** The required mapping is EspoCRM campaign → recipient → immutable attempt → cycle/batch → Chatwoot account/inbox/campaign/contact → independently verified provider message ID. If any relationship is missing, ambiguous, or conflicting, report `UNMATCHED`/`HOLD`; do not join by title or phone alone and do not write an EspoCRM outcome.
11. **Treat label membership as a release boundary.** For temporary batch labels, preserve unrelated Chatwoot labels, verify exact membership against the prescreened batch, recheck current consent/suppression and campaign state before creating the campaign, and reconcile cleanup. Chatwoot cannot safely interrupt a batch per contact after processing begins.
12. **An unknown create result is not a failed create.** If the Chatwoot campaign-create request times out after possible acceptance, mark it `UNKNOWN`; search/reconcile before any retry. Never create a duplicate campaign merely because the client missed the response.
13. **Maintain one portfolio-level cycle gate.** The approved design uses one global Meta-portfolio cycle and a 26-hour gap after the last verified batch completion. Do not reset the clock at initial campaign start or apply independent 26-hour gaps to each campaign in a multi-campaign cycle.
14. **Preserve existing retry and error semantics.** Retain the installed extension's current 131049 timing (8, then 18, then 28 days after each preceding failure) until separately approved. Keep exact Meta codes; 131026 is not proof that a number is unregistered. Opt-out and suppression always win.

## Findings from the 2026-10-26 V5 review and tests

- The current n8n V5 worker still contains a one-recipient direct-message send node. That path does not satisfy the approved native Chatwoot batch design.
- The V5 policy helper currently sets `nativeCampaignBatchPathReady = false` and blocks a production-mode send while native campaign creation and recipient-level reconciliation remain unimplemented. Keep this gate closed and keep V5 inactive.
- Synthetic n8n policy tests on 2026-10-26 confirmed: (a) a LIVE-stage request is rejected with `v5 live sending blocked: native Chatwoot batch creation and recipient-level reconciliation are not ready`; and (b) a valid preflight with master sending disabled returns `runMode=DRY_RUN`, `liveMode=false`, and `nativeCampaignBatchPathReady=false`.
- A full parent workflow execution was not performed. The execution tool identified only the scheduled trigger and automatic review rejected the proposed manual run because it could not verify a dry-run trigger path. Do not bypass this with an alternate execution route; use synthetic node tests or explicitly configured, reviewed manual triggers.
- The current n8n instance search found no AGE 03 recipient-reader workflow. AGE 07 exists inactive, but its workflow is unavailable through current MCP access. Do not assume repository commits are automatically imported into n8n.
- Repository evidence reports a successful manual AGE 07 aggregate run for Chatwoot display campaign 2, `AGE Intro Maharastra`: 910 recipients, 660 delivered-inclusive-of-Read (including 505 Read), 247 Failed, and 3 sent-only. This is one campaign's aggregate snapshot; it is not evidence for `Intro - All India except Ahmedabad`.
- Documentation status needs reconciliation: the top-level README and dated analytics report describe the AGE 07 live manual run, while `workflows/README.md` still says AGE 07 was not executed against the live credential. Treat the dated report as the detailed run record and update the stale workflow inventory wording in a reviewed docs change.

## Production gates still to close

- Verify the exact EspoCRM-to-Chatwoot mapping for each batch and attempt; do not infer the target Chatwoot campaign from a similar name.
- Verify the installed AGE extension's actual, versioned reservation, batch-mapping, and outcome-event contracts. The documented API contract is proposed and must not be treated as a set of existing endpoints.
- Implement atomic portfolio/canonical-phone reservations, temporary-label membership verification, one idempotent native campaign creation per batch, and safe unknown-result recovery.
- Run AGE 03 manually against the exact target only after it is imported and its SELECT-only role, tenant filter, inbox scope, and licensing are verified. Redact output before preserving any test record.
- Build durable recipient-level status reconciliation and idempotent EspoCRM event posting only after the identity link and endpoint contracts are proven. Test duplicate, late, out-of-order, Read-only, and contradictory status cases with synthetic data first.
- Keep V5 disabled and WA-00 paused during preparation. Do not claim production readiness from synthetic unit tests, aggregate analytics, workflow import validation, or campaign completion alone.

## Source documents

- [Chatwoot analytics discovery (2026-10-24)](CHATWOOT_ANALYTICS_DISCOVERY_2026-10-24.md)
- [AGE 03 recipient evidence paging and matching (2026-10-24)](RECIPIENT_EVIDENCE_PAGING_AND_MATCHING_2026-10-24.md)
- [Native Chatwoot campaign orchestration](CHATWOOT_CAMPAIGN_ORCHESTRATION.md)
- [EspoCRM/Chatwoot proposed API contract](ESPOCRM_CHATWOOT_API_CONTRACT.md)
- [Acceptance test plan](TEST_PLAN.md)
