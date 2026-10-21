# Future-state architecture and integration boundaries

## Source of truth

| Concern | Authoritative owner | Dispatcher responsibility |
| --- | --- | --- |
| Customer, company, active links, normalized phones | EspoCRM Communications / master data | Read and validate fresh state |
| Consent, opt-out, suppression | EspoCRM canonical master, synchronized association records | Enforce; never rewrite ad hoc |
| Campaign setup, segments, template selection | EspoCRM Campaign extension | Read versioned configuration |
| Enrollment and recipients | EspoCRM campaign extension | Claim due recipients; update via supported API |
| Retry/cooldown determination | **Single** EspoCRM extension policy API (target contract) | Consume verdict and expiry; never invent a conflicting rule |
| Global sender delivery/attempt budget | Durable atomic ledger service (may be implemented in EspoCRM DB or dedicated durable store) | Reserve before send and reconcile after events |
| Chat/conversation identity, agent replies | Chatwoot for official Meta inbox | Find/create only when necessary and verify routing |
| Provider template availability, send response, delivery | Meta via Chatwoot; Meta webhooks authoritative | Verify, submit once, observe and reconcile |
| Customer-facing reporting | EspoCRM | Emit normalized events and evidence |
| Business-wide common policies | AGE central business/core knowledge repository (external boundary) | Link/read; don't copy private unrelated information |

## Conceptual data flow

1. **Campaign configuration** → validate sender, category, template and policy; classify LIVE/DRY RUN.
2. **Audience snapshot/refresh** → select Lead/Contact/Account records, map to canonical phone master, deduplicate, exclude inactive links/opt-outs, preserve provenance.
3. **Due queue** → deterministic due ordering, claim small batches with lease and attempt-idempotency key.
4. **Eligibility** → current consent/suppression, canonical destination, association, frequency, error cooldown, campaign date/window and identity.
5. **Atomic reservation** → re-evaluate emergency stop; claim sender-wide delivered target slot, hard attempt budget and pace lock. Fail if any not available.
6. **Routing** → verify/create the correct Chatwoot contact-inbox and conversation linked to intended destination, approved template and language.
7. **Final recheck** → consent, campaign state, provider policy and sending window at the last safe point before submit.
8. **One provider POST** → record Submitted or Unknown; **never** assume Delivered from HTTP 2xx.
9. **Events** → ingest provider status notifications; dedupe, attribute to attempt, update CRM recipient projections and release/finalize reserved budget.
10. **Reconciliation** → resolve old reservations, unknown submissions and late/out-of-order webhooks against auditable provider evidence.
11. **Operations** → monitor failed/unmatched events, stale checkpoints, delivery rates, costs, approval changes and policy violations.

## Service boundaries

### EspoCRM extension (not copied here)
Should expose versioned contracts for:
- GET campaign configuration and audience version
- GET/claim due recipient(s) using stable cursor/lease
- GET current phone master, active associations and history
- GET retry policy verdict (allowed, reason, nextReviewAt, ruleVersion, consent status)
- POST reserve attempt idempotently and POST/ingest outcome
- POST opt-out/suppression updates through canonical masters
- GET campaign/sender budget snapshots and traceable audit events

### n8n orchestration (this repository)
- Schedules, backpressure, retry orchestration and event handlers
- Enforces policy verdicts at key boundaries **and** verifies original scope/context matches the candidate
- Sender-level claim/lease client; no in-memory or n8n static-data-only critical state
- Error handling, observability, alerting and structured audit linkage

### Chatwoot/Meta
- Templates require explicit approved status, template/category/language match
- Contact identification must include verified account, inbox, contact-inbox identity and intended destination
- Sender must be the official Meta channel, not WAHA
- Webhook events need signature/auth verification, deduplication and replay protection
- Chatwoot is a channel/agent interface, **not** the authoritative consent database

## Critical transactional boundaries

There is no distributed transaction spanning EspoCRM, n8n and Chatwoot. Use a durable **outbox and attempt state machine**:
- Commit one logical attempt and quota reservation under an atomic sender-level claim.
- Before POST, recheck safety. If revoked, mark CancelledBeforeSend and release its reservation safely.
- On confirmed POST response, bind the Chatwoot message and any provider IDs.
- On timeout, mark Unknown; don't issue a new send unless reconciliation proves none happened and policy permits it.
- A lease expiration is not evidence that the provider never received a message.
- Budget ledger reconciliation must idempotently settle confirmed delivery/failure exactly once and never create negative counts.

## Multi-campaign coordination

- Sender-level limits, send spacing and Meta quality stops apply across **all** campaigns sharing a sender.
- Phone-level marketing cooldown and outstanding-in-flight checks prevent collisions across campaigns.
- Campaign priority must be explicit and stable; no random preference between Lead, Contact and Account copies of the same phone.
- Per-campaign targets may be smaller than the sender-wide target, but not larger.
- Historical and dynamic campaigns participate in identical safety controls.

## Failure behavior (fail closed)

| Failure | Required action |
| --- | --- |
| Campaign lookup missing/invalid | No send; configuration error |
| Retry-policy service down/malformed | No send; alert |
| Consent uncertain or association contradictory | Hold for review |
| Sender budget stale, missing or conflicting | No send; reconcile |
| Chatwoot identity/phone mismatch | No send; route repair |
| Template unapproved/missing | No send; alert |
| Provider POST timeout | Unknown; evidence-based reconciliation |
| Worker restart after reservation | Recover durable outbox without blind resubmit |
| Opt-out after queue selection | Cancel before sending; persist suppression |

## Approved replacement for legacy individual-message dispatch (2026-10-21)

**Superseding implementation mode:** Native Chatwoot v4.19 one-off campaign batches; see `CHATWOOT_CAMPAIGN_ORCHESTRATION.md`. The earlier conceptual steps “conversation routing → one provider POST → individual-message 45-second pace” describe legacy architecture only and MUST NOT be implemented in the new batch flow. Now the transactional boundary is **portfolio cycle → one or more campaign batches → unique labels → one-time Chatwoot campaign API POST per batch**; the controller itself never issues per-recipient sends. Global cycle completion and independent reporting reconciliation are explicit. The 26h hold begins after *last verified* batch completion. The approved controller polls hourly; reconciler independently polls at up to hourly cadence. Chatwoot core cannot enforce per-contact interruption after a campaign begins; keep batch sizes conservative and recheck consent before release.

Chatwoot analytics per-contact pagination exists in v4.19 enterprise code but may be feature-gated; without verified entitlement and satisfactory evidence do not launch. The proposed CRM adapter operations are documented separately and should not be treated as installed endpoints.
