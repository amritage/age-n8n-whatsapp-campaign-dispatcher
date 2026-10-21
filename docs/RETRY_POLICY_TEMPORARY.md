# Interim 131049 scheduling: use the unchanged AGE Campaign Management policy

**Decision date:** 2026-10-21. **Status:** approved temporary compatibility choice, not the long-term desired schedule.

**Do not modify AGE Campaign Management, previous n8n workflows or Chatwoot source.** Only the new dispatcher repository is in scope.

## What actually applies now
The unchanged AGE Campaign Management v0.4.x `WhatsAppPolicy::evaluate` checks **8, 18 and 28 days after the most recent 131049 failure**, depending on the count of 131049 failures in the same logical CRM campaign. It permits up to three retries when all other conditions permit.

| Relative to initial 131049 failure (D0) | Effective cooldown | Earliest retry if every preceding retry was made and failed on schedule |
|---|---|---|
| First retry | 8 days after initial failure | D0+8 |
| Second retry | 18 days after first retry's failure | D0+26 |
| Third retry | 28 days after second retry's failure | D0+54 |

These are **earliest theoretical dates**, not promises: Meta restrictions, CRM policy API, suppression/consent, the recipient 7-day minimum gap, audience membership, campaign time window, Sunday rule, the portfolio's 26-hour cycle gap, capacity, and operational failures can all push the next attempt later. **Never shorten the CRM endpoint's hold** or send just because the new local planner says due.

## What is deferred, not forgotten
The owner earlier preferred **D0+8, D0+18, D0+28 measured from initial failure**. That is a future change request, **not current runtime policy**. We will discuss it later and must not silently implement it while keeping the existing extension unchanged.

## Authoritative checks
1. Read `GET /api/v1/AGECampaign/retry-policy/:recipientId`; confirm the response belongs to the same recipient and the installed extension/version is known.
2. If `errorPolicyAllowed=false`, do not send; respect `retryAt`. If it is missing or inconsistent, hold for review.
3. Run the new dispatcher's fresh consent, audience, canonical phone, no-inflight, campaign window and portfolio-cycle checks. `src/retry-policy.js` calculates the temporary *preceding failure* thresholds and requires evidence that the failure history is scoped to the current campaign.
4. Even after passing read-only preflight, the existing `POST /AGECampaign/attempt` has its own authoritative server-side gate. **Never bypass or misrepresent a denied attempt.**
5. The asynchronous Chatwoot campaign-versus-individual AGE attempt accounting mismatch is still open; this interim retry decision does **not** resolve that separate deployment blocker.

## Evidence
- Existing extension `files/custom/Espo/Modules/AGECampaignManagement/Domain/WhatsAppPolicy.php` at https://github.com/amritage/age-campaign-management
- New implementation `src/retry-policy.js`, regression `tests/integration-contract.test.js`
- Earlier desired future policy retained in `docs/DECISIONS.md`

### Scope and limitations
The v0.4.3 GitHub source was inspected; the exact version installed on the live CRM has **not** been confirmed. Before live integration, verify its retry semantics read-only. Every rule still obeys opt-outs, provider restrictions, freshness of evidence, safety limits and reconciled outcomes.
