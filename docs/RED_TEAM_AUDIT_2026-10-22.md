# AGE dispatcher — independent operational / adversarial review (22 October 2026)

## Executive assessment

**Do not deploy these workflow files as a working campaign sender or automatic CRM status-sync engine.** The current *two preferred native-node workflows* are **read-only diagnostics**, with real network behavior not tested against the installed instances. The repo has extensive source-backed unit/JSON-import tests, but none proves real connectivity or recipient-by-recipient delivery synchronization.

The business target remains **one EspoCRM-driven scheduler for multiple campaigns, Option B global 26h inter-cycle gap, native Chatwoot campaigns within each approved cycle, no edits to existing extensions/workflows/Chatwoot source**. The current operating retry policy follows existing AGE 131049 holds of 8, 18, 28 days **after preceding failures**.

## Severity-ordered problems and controls

| # | Risk | Current evidence | Required gate / mitigation |
|---|---|---|---|
| CRITICAL-01 | **Chatwoot version clarified (resolved as an architecture mismatch).** User confirmed the installed Chatwoot release is **v4.19.0** on 2026-10-22. | Inspected v4.19.0 source contains the native 100-contact background batch worker; older v4.17.1 code is not the current target. This is user-confirmed deployment information, **not independently verified via a live API/version probe**. | Design for v4.19.0 batching. Before LIVE, confirm the deployed version/runtime through authorized environment evidence and test one opted-in pilot. No version upgrade required for this design. |
| CRITICAL-02 | **No exact EspoCRM→Chatwoot recipient and attempt mapping.** | Core/enterprise analytics lacks Meta message ID/time; native one-off campaign is asynchronous; AGE attempt endpoint expects per-message semantics. | Add transactionally recorded claim/cycle/batch/Chatwoot display ID/Chatwoot contact ID/AGE recipient and attempt mapping, reconcile authoritative provider events; do not invent submitted/delivered on campaign creation. |
| CRITICAL-03 | **Feature-gated campaign analytics may fail on self-hosted instances.** | v4.17.1 Enterprise analytics checks `whatsapp_campaign`; v4.19.0 Enterprise analytics checks `campaign_analytics` and `campaigns`. Both routes are in `enterprise/`. | Verify READ-ONLY metrics & recipients on exact installed release; if 401/403/404, report BLOCKED and do not launch based on unverifiable delivery feedback. Don't bypass licensing or modify Chatwoot. |
| CRITICAL-04 | **Meta messaging tier != remaining capacity.** | Shared rolling 24h unique recipients across Meta portfolio, including manual campaigns / other senders; 26h safety gap covers only this orchestrator's previous cycle. | Verify portfolio ID, sender set, tier evidence, other provider sends, reservations and unknown receipts. Unknown capacity = no new sending cycle. |
| HIGH-05 | **In-flight audience revocations cannot reliably unsend.** | Chatwoot native one-offs commit audience labels while sending. Per-recipient eligibility may change after launch. | Make uniquely labeled, bounded immutable cohorts; recheck just before creating; keep batch sizes small and avoid unbounded long-running campaigns. |
| HIGH-06 | **Multiple logical campaigns can share one portfolio's sending cycle but have different windows.** | Native Chatwoot's processing may extend beyond the EspoCRM allowed closing time, even if the POST happened within it. | Sequential/controlled launches and preflight end-window budget with conservative completion buffer; if cannot ensure compliance, defer. Sunday-off remains respected at actual launch. |
| HIGH-07 | **App node output shape/pairing cannot be proved by import tests.** | Community-node `Chatwoot.node.ts` builds `pairedItem` with input index; when campaign metrics or recipient lookup returns no items/errors, output shape can change. | Fail closed on lost/duplicate pairing and mismatch; verify one, two and zero-failure real campaigns before relying on multi-campaign reporting. |
| HIGH-08 | **Our health reporter is not exhaustive historical reconciliation.** | Latest native workflow rotates groups of five recent/processing WhatsApp campaigns every six hours and fetches only failed recipients; older statuses are skipped by design. | Use it as low-cost diagnostics ONLY. Real durable history needs private DB, incremental cursors, late-status polling and replay/audit. |
| HIGH-09 | **Retries need BOTH local schedule and existing extension approval.** | AGE source currently computes 131049 8, then 18, then 28 days after respective preceding failures (theoretical D0+8/+26/+54); old extension is left unchanged. | Read CRM `/AGECampaign/retry-policy/:recipientId` fresh before launch; no workaround/historical-mode bypass. |
| MEDIUM-10 | **System availability/restarts and partial Chatwoot POST success.** | A timeout does not tell us whether a native campaign already exists; rerun could duplicate sends. | Durable idempotency request IDs, batch label uniqueness, API reconciliation before retry, manual escalation for UNKNOWN. |
| MEDIUM-11 | **Quality of automated tests.** | n8n 2.37.9 CLI imports succeed, Node mocks succeed, ephemeral Postgres schema succeeds. None of these uses installed n8n or Chatwoot account. | Mark separately: IMPORT PASS, CODE MOCK PASS, LIVE API NOT RUN, LIVE SEND NOT AUTHORIZED. Test report log must never collapse them into production readiness. |
| MEDIUM-12 | **Community-node supply chain/queue workers.** | Exact EspoCRM 1.4.0 and Chatwoot 0.9.0 packages shown installed in user's n8n UI, but worker runtime not observed. | Run manual workflow on worker; pin versions and back up workflows; no package update solely for this integration. |

## Version source comparison (current installation confirmed by user as v4.19.0; no live API validation)
- v4.17.1: https://github.com/chatwoot/chatwoot/blob/v4.17.1/app/services/whatsapp/oneoff_campaign_service.rb
- v4.17.1: https://github.com/chatwoot/chatwoot/blob/v4.17.1/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb
- v4.19.0: https://github.com/chatwoot/chatwoot/blob/v4.19.0/app/jobs/campaigns/send_whatsapp_batch_job.rb
- v4.19.0: https://github.com/chatwoot/chatwoot/blob/v4.19.0/enterprise/app/controllers/api/v1/accounts/campaigns/analytics_controller.rb
- Chatwoot native community node: https://github.com/serversmx/n8n-nodes-chatwoot/blob/main/nodes/Chatwoot/Chatwoot.node.ts

## Recommended next execution (no modification to previous systems)
1. Import only **current** `workflows/age-api-readiness-native.json`, bind already installed EspoCRM + Chatwoot credentials, and run manually. Treat Chatwoot v4.19.0 as the current user-confirmed version; a direct environment version check remains a separate LIVE release gate. No manual campaign IDs.
2. Import current `workflows/age-chatwoot-recipient-report-native.json`; run manual against any existing completed WhatsApp one-offs and observe BLOCKED if the analytics endpoint is not entitled. Don't activate its schedule until outcome/attribute pairing is inspected.
3. When real APIs are confirmed, complete a private durable batch ledger and provider event mapping. **Only** then consider a consent-controlled pilot with explicit authorization for sending.
4. Never change earlier extensions or previously existing n8n workflows without a separate user request.

## Conclusions
**Version decision:** use Chatwoot **v4.19.0**, confirmed by the operator on 2026-10-22. The 4.17.1-vs-4.19.0 conflict is closed as a *planning* issue. The analytics-entitlement, asynchronous CRM attempt linkage, Meta capacity and provider-receipt evidence risks remain open.

The current diagnostics can help determine what exists, but cannot replace a production dispatcher. A native WhatsApp campaign should **never** be created simply because the manual import test passed. Real production readiness requires version-proofed provider behavior, consent-checked atomic reservations, controlled Chatwoot one-off launches, exact receipt evidence, and safe retries.
