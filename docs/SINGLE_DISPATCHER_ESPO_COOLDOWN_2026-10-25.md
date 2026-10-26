# Decision D-18 — one serialized sender; EspoCRM canonical cooldown (2026-10-25)

**APPROVED DESIGN; CODE NOT LIVE.** This decision supersedes the proposed P-02/P-07 split and the assumption that a second atomic sending ledger is a prerequisite. It does **not** remove the need for verified exclusivity, durable unknown-send recovery or conservative Meta limit checks.

## One sender, not one workflow total
- Exactly **one ACTIVE n8n workflow permitted to CREATE Chatwoot campaigns** for the AGE marketing portfolio. It loops through **all** eligible EspoCRM marketing campaigns, never one sender workflow per campaign.
- Read-only health/reconciliation workflows may remain separate and scheduled; they must have **zero send privilege**.
- Run only **one dispatcher execution at a time**. n8n 2.44.6 queue mode with workers is **not automatically serialized** simply because the workflow exists once. Explicitly configure/enforce a concurrency limit of 1 for the sender and confirm it in the running deployment, including manual/test/webhook execution paths. If this cannot be guaranteed, LIVE = OFF.
- Disable old campaign dispatchers, existing extension sender jobs, alternative Chatwoot campaign automations, direct Meta sends, and any other tool with authority to CREATE campaigns for the same Meta business portfolio **before cutover**. Inventory all senders; the guarantee is invalid while unaccounted paths remain.
- Import the revised sender inactive. Publish only after runtime exclusivity and failover tests pass. No GitHub edit changes installed n8n workflows.

## EspoCRM authority, no parallel customer ledger
- Use canonical `CCommunicationPhoneNumbers.id` as identity, not phone text or Contact/Lead/Account ID.
- Before every Chatwoot campaign CREATE, read EspoCRM master suppression and marketing opt-outs, and all historical `CAGECampaignRecipient` attempts linked to that master across all marketing campaigns. Include historical/cancelled/failed recipients and complete pagination.
- **Every marketing attempt counts**, including failures, for minimum 7 days. Use the newest real CRM attempt `startedAt`, not the last delivery/read timestamp. An unresolved Submitted/Accepted/Sent attempt blocks irrespective of elapsed cooldown.
- Check `ageMinGapDays` and apply the **greater** of 7 days and configured campaign minimum. Recheck across the entire planned cycle, so a master is included once even when multiple campaigns target it.
- Dynamic audience, inactive associations, suppression, opt-out and existing AGE retry-policy endpoint are still mandatory.
- A fail-closed pure policy evaluator is implemented in `src/serialized-cooldown.js`; it requires a **trusted, complete CRM fetch**. Passing its result is a cooldown-only verdict, NOT authorization to call Chatwoot.
- Do not treat an unverified aggregated `lastWhatsAppMessageCreatedAt` on phone master as marketing attempt history; service replies/other channels can appear there. Do not pretend that a read-only source field is a writeable cooldown claim.

## Critical contract mismatch: native Chatwoot one-off batch
The existing `POST /AGECampaign/attempt` is an **immediate individual-submit** registration and does not independently enforce the marketing gap; `frequencyAllowed=true` is supplied by the caller. Registering an entire native Chatwoot label batch ahead of asynchronous provider processing would falsely classify unsent recipients as Submitted. Conversely, creating Chatwoot's campaign before tracking leaves a policy/accounting gap. This is still a **blocking integration design issue** and must be tested against actual deployed interfaces before LIVE. Never fabricate attempt receipts or change existing extension API implicitly.

## Preserve earlier constraints
- Keep global 26-hour spacing between **last verified prior Chatwoot batch completion** and next cycle; no guessed completion on unknown state.
- Native Chatwoot batching, not 45-second n8n pacing.
- Existing 131049 progressive retry holds (8/18/28 days after preceding failure), 131026 ambiguity, 180-day review-only rules, and Meta restrictions stay unchanged.
- Chatwoot PostgreSQL reconciliation is read-only; only independently verified attempts/message IDs may be written to EspoCRM events.
- No external Meta capacity API is assumed; missing tier/usage evidence remains a hold, not a license to send 3000.
- A lost HTTP response after Chatwoot campaign create is UNKNOWN, **never retry CREATE blindly**, even if cooldown has passed.

## Production acceptance (blocking)
1. Verify no other CREATE-capable sender runs; verify n8n workers, retries, manual runs, crashes and duplicate triggers cannot overlap LIVE sender instances.
2. Verify Espo full pagination and cross-campaign history count matching; unreadable history or stale policy => HOLD.
3. Test 7-day boundary, retries and failures, different campaign/sender collisions, duplicate masters and changed membership.
4. Resolve the native batch/CRM attempt registration timing conflict and verified Chatwoot message-to-attempt mapping.
5. Test ambiguous create response and crash recovery without resending.
6. Verify approved templates/inboxes, conservative portfolio cap, opt-out and campaign windows, then a controlled opt-in live pilot.

**No new atomic DB ledger is required by this approved architecture.** If the verified simple solution cannot meet above guarantees, stop and seek authorization for the smallest necessary added persistent control; never silently relax them.
